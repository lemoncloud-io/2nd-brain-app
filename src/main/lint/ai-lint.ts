// AI 점검(슬라이스 13) — lint 프로필 엔진으로 의미 결함을 찾는다. 볼트는 읽기만 하고 쓰지 않는다.
import type { Engine } from '../engine/engine'
import type { EngineEvent } from '../../shared/ipc-contract'
import { WikiService } from '../wiki/wiki-service'
import { squashTitle } from '../../shared/review-sweep'
import { isWikiPagePath } from '../../shared/wiki/merge-pages'
import type { SemanticFinding, SemanticKind, SemanticLintResult } from '../../shared/ipc-contract'
import { mainT } from '../i18n'

export type { SemanticFinding, SemanticKind, SemanticLintResult }

const KINDS = new Set<string>([
  'contradiction',
  'outdated',
  'missing-page',
  'suggestion',
  'duplicate'
])

// duplicate 의 경로 칸 — `wiki/a.md + wiki/b.md`. 위키 안의 서로 다른 두 페이지여야 합치기를 제안할 수 있다
const duplicatePair = (rel: string): [string, string] | null => {
  const parts = rel.split('+').map((part) => part.trim())
  const fold = (part: string): string => part.normalize('NFC').toLowerCase()
  // 대소문자만 다른 두 경로는 macOS·Windows 기본 디스크에서 한 파일이다
  if (parts.length !== 2 || fold(parts[0]!) === fold(parts[1]!)) return null
  return parts.every(isWikiPagePath) ? [parts[0], parts[1]] : null
}

const SEVERITIES = new Set(['high', 'medium', 'low'])

const SUMMARY_LIMIT = 500

/**
 * 한 번에 점검할 페이지 수 상한. 232페이지 볼트는 프롬프트가 100KB 를 넘어 모델이 한 번에 못 읽는다.
 * 최근에 고친 페이지부터 이만큼만 본다 — 못 본 페이지는 다음 점검에서 앞에 선다.
 */
export const LINT_PAGE_LIMIT = 80

// ui-hangul-ignore: AI 에게 보내는 지시 본문(범위 밖: AI 프롬프트)
export const lintPrompt = (pages: { rel: string; title: string; body: string }[]): string =>
  [
    '아래 위키 페이지 요약을 점검해 모순·오래된 내용·누락된 페이지·개선 제안·같은 개념을 다루는 두 페이지를 찾아라.',
    '답은 반드시 다음 블록 형식으로만 하라. 블록 밖 산문은 해석에서 버린다.',
    '',
    '---LINT: <contradiction|outdated|missing-page|suggestion|duplicate>|<high|medium|low>|<제목>|<wiki/ 페이지 경로>---',
    '<한 줄 설명>',
    '---END LINT---',
    '',
    'duplicate 는 경로 칸에 두 페이지를 `wiki/a.md + wiki/b.md` 처럼 적어라.',
    '',
    '결함을 찾지 못했으면 블록 없이 "문제 없음"이라고만 답하라.',
    '',
    ...pages.map(({ rel, title, body }) => `## ${rel} — ${title}\n${body.slice(0, SUMMARY_LIMIT)}`)
  ].join('\n')

const BLOCK_START = /^---LINT:\s*([^|\n]+)\|([^|\n]+)\|([^|\n]*)\|([^|\n]*)---\s*$/
const BLOCK_END = /^---END LINT---\s*$/

export const parseSemanticLint = (text: string, existingTitles: string[]): SemanticLintResult => {
  const lines = text.split('\n')
  const findings: SemanticFinding[] = []
  let current: {
    kind: string
    severity: string
    title: string
    rel: string
    detail: string[]
  } | null = null

  for (const line of lines) {
    if (current === null) {
      const start = BLOCK_START.exec(line)
      if (start) {
        current = {
          kind: start[1].trim(),
          severity: start[2].trim(),
          title: start[3].trim(),
          rel: start[4].trim(),
          detail: []
        }
      }
      continue
    }
    if (BLOCK_END.test(line)) {
      const validKind = KINDS.has(current.kind)
      const validSeverity = SEVERITIES.has(current.severity)
      const knownTitle =
        current.kind === 'missing-page' &&
        existingTitles.some((t) => squashTitle(t) === squashTitle(current?.title ?? ''))
      const pair = current.kind === 'duplicate' ? duplicatePair(current.rel) : null
      const validPair = current.kind !== 'duplicate' || pair !== null
      if (!validPair)
        console.warn(
          'dropped AI check duplicate finding — paths are not two wiki pages',
          current.title,
          current.rel
        )
      if (validKind && validSeverity && !knownTitle && validPair) {
        findings.push({
          kind: current.kind as SemanticKind,
          severity: current.severity,
          title: current.title,
          ...(pair ? { rel: pair[0], rel2: pair[1] } : { rel: current.rel }),
          detail: current.detail.join('\n').trim()
        })
      }
      current = null
      continue
    }
    current.detail.push(line)
  }

  if (current !== null)
    return {
      status: 'unparsed',
      reason: mainT().lintMain.cutOff
    }
  if (findings.length > 0) return { status: 'found', findings }
  // ui-hangul-ignore: 프롬프트가 시킨 AI 답 표식
  if (text.includes('문제 없음')) return { status: 'clean' }
  return { status: 'unparsed', reason: mainT().lintMain.unreadable }
}

export interface AiLintService {
  /** onEvent 는 화면에 진행을 그리기 위한 것이다 — 없으면 조용히 돈다 */
  run(vaultDir: string, onEvent?: (event: EngineEvent) => void): Promise<SemanticLintResult>
  cancel(): void
}

export const createAiLintService = (createEngine: () => Engine): AiLintService => {
  let engine: Engine | null = null

  return {
    cancel: () => {
      engine?.cancel()
    },
    async run(vaultDir, onEvent) {
      if (engine !== null) return { status: 'unparsed', reason: mainT().lintMain.running }
      const pages = WikiService.list(vaultDir)
        // 최근에 고친 것부터 — 방금 위키화한 페이지가 점검에서 빠지지 않게
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, LINT_PAGE_LIMIT)
        .map((entry) => {
          const full = WikiService.read(vaultDir, entry.rel)
          return { rel: entry.rel, title: entry.title, body: full?.text ?? '' }
        })
      engine = createEngine()
      let text = ''
      try {
        for await (const event of engine.run({ vaultDir, prompt: lintPrompt(pages) })) {
          onEvent?.(event)
          if (event.type === 'text') text += (text === '' ? '' : '\n') + event.text
          if (event.type === 'error') {
            return { status: 'unparsed', reason: event.message }
          }
        }
      } finally {
        engine = null
      }
      return parseSemanticLint(
        text,
        pages.map((p) => p.title)
      )
    }
  }
}
