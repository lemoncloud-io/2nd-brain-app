// 위키화 조립(결정론) — LLM 초안을 볼트에 쓴다. 판단이 필요 없는 일만 한다.
// 페이지 쓰기·토픽 페이지·INDEX·TOPIC_MAP·run-log·결과 커밋. 본문에는 손대지 않는다.
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { linkMention, mentionTerms, unlinkedMentions } from '../../shared/wiki/link-gaps'
import { FRONTMATTER_RE } from '../../shared/wiki/parse'
import { WikiService } from '../wiki/wiki-service'
import { git } from '../git'
import type { DraftPage } from './draft-prompt'
import type { PreparedClipping } from './prepare'

export type AssembledPage = {
  rel: string
  kind: 'created' | 'updated'
  title: string
  topics: string[]
}

export type AssembleInput = {
  vaultDir: string
  date: string
  authorSlug: string
  /** 클리핑별 초안 — 순서대로 처리한다. updatable 은 덮어써도 되는 기존 경로 */
  drafts: Array<{ clipping: PreparedClipping; pages: DraftPage[]; updatable: string[] }>
  /** 구간 계측 — run-log 에 남긴다. 없으면 그 줄을 빼고 쓴다 */
  measure?: IngestMeasure
}

export type AssembleResult = {
  pages: AssembledPage[]
  skipped: Array<{ rel: string; reason: string }>
  topics: string[]
  runLogRel: string
}

/** 구간 계측 — 파이프라인이 재고 조립이 run-log 에 적는다. ms·문자·호출 횟수 */
export type IngestMeasure = {
  promptChars: number
  draftCalls: number
  prepareMs: number
  draftMs: number
  assembleMs: number
}

/** ms → "28.6초" — run-log 사람 말 한 줄용 */
const sec = (ms: number): string => `${(ms / 1000).toFixed(1)}초`

const read = (vaultDir: string, rel: string): string | null => {
  try {
    return readFileSync(join(vaultDir, rel), 'utf8')
  } catch {
    return null
  }
}

const write = (vaultDir: string, rel: string, text: string): void => {
  mkdirSync(dirname(join(vaultDir, rel)), { recursive: true })
  writeFileSync(join(vaultDir, rel), text, 'utf8')
}

/** 멀티바이트를 자르지 않는 바이트 상한 절단 */
const cutBytes = (s: string, max: number): string => {
  const buf = Buffer.from(s, 'utf8')
  if (buf.length <= max) return s
  return buf
    .subarray(0, max)
    .toString('utf8')
    .replace(/\uFFFD+$/u, '')
}

const bodyOfPage = (page: DraftPage): string => {
  const text = page.body
  if (!text.startsWith('---\n')) return text
  const close = text.indexOf('\n---', 4)
  return close === -1 ? text : text.slice(close + 4).replace(/^\n/, '')
}

const fenceBody = (text: string): string | null => {
  if (!text.startsWith('---\n')) return null
  const close = text.indexOf('\n---', 4)
  return close === -1 ? null : text.slice(4, close)
}

/** 기존 sources — YAML 로 읽는다. 정규식으로는 들여쓰기 변형을 놓쳐 provenance 를 날린다 */
const existingSources = (vaultDir: string, rel: string): string[] => {
  const raw = fenceBody(read(vaultDir, rel) ?? '')
  if (raw === null) return []
  try {
    const parsed: unknown = parseYaml(raw)
    if (typeof parsed !== 'object' || parsed === null) return []
    const sources = (parsed as Record<string, unknown>)['sources']
    return Array.isArray(sources) ? sources.map((s) => String(s)) : []
  } catch {
    return []
  }
}

const existingCreated = (vaultDir: string, rel: string, date: string): string => {
  const m = /^created:\s*["']?(.*?)["']?\s*$/m.exec(read(vaultDir, rel) ?? '')
  const value = m?.[1]?.trim()
  return value && value !== '{{date}}' ? value : date
}

const frontmatter = (opts: {
  type: string
  topics: string[]
  status: string
  sources: string[]
  created: string
  updated: string
}): string =>
  [
    '---',
    `type: ${opts.type}`,
    `topics: [${opts.topics.join(', ')}]`,
    `status: ${opts.status}`,
    'sources:',
    ...opts.sources.map((s) => `  - "${s}"`),
    `created: "${opts.created}"`,
    `updated: "${opts.updated}"`,
    '---'
  ].join('\n')

const linkLine = (slug: string, title: string): string => `- "[[${slug}|${quoteTitle(title)}]]"`

/** 따옴표 감싼 칸에 넣는 제목 — `"` 는 YAML 을 깨서 `'` 로 바꾼다 */
const quoteTitle = (title: string): string => title.replace(/"/g, "'")

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 목록 섹션에 링크 추가 — placeholder면 교체, 있으면 중복 건너뛴다 */
const appendLink = (text: string, section: string, line: string, slug: string): string => {
  const lines = text.split('\n')
  const head = lines.findIndex((l) => l.trim() === section)
  if (head === -1) return `${text.replace(/\n+$/u, '')}\n\n${section}\n\n${line}\n`
  let end = lines.length
  for (let i = head + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i]!.trim())) {
      end = i
      break
    }
  }
  const sectionText = lines.slice(head + 1, end).join('\n')
  // `[[herdr` 가 `[[herdr-x` 에 걸리지 않게 경계까지 본다
  const present = new RegExp(`\\[\\[${escapeRe(slug)}(?:\\]\\]|[|#])`).test(sectionText)
  if (present) return text
  const placeholder = /_No (topics|compiled wiki articles) yet\._/
  const body = placeholder.test(sectionText)
    ? sectionText.replace(placeholder, line)
    : `${sectionText.replace(/\n+$/u, '')}\n${line}`
  return [...lines.slice(0, head + 1), body, ...lines.slice(end)].join('\n')
}

const ensureTopicPage = (vaultDir: string, slug: string): boolean => {
  const rel = `wiki/topics/${slug}.md`
  if (existsSync(join(vaultDir, rel))) return false
  write(
    vaultDir,
    rel,
    ['---', 'type: topic', 'up:', '---', '', `# ${slug}`, '', '## Related Notes', '', '-'].join(
      '\n'
    ) + '\n'
  )
  return true
}

/** 이번 실행 pages 에 기존 노트 링크를 건다 — 본문에 이름이 있으면 첫 언급만 [[slug|이름]].
 *  짧은 이름(3자 이하)은 흔한 말과 겹쳐 건너뛴다. 에이전트가 손으로 하던 연결을 결정론으로. */
export const autolinkPages = (vaultDir: string, rels: string[]): number => {
  const targets = WikiService.listDocs(vaultDir)
    .filter((p) => p.rel.startsWith('wiki/'))
    .map((p) => ({ ...p, terms: mentionTerms({ title: p.title, slug: p.slug }) }))
    .filter((p) => p.terms.some((t) => [...t].length >= 4))
  let applied = 0
  for (const rel of rels) {
    let text = read(vaultDir, rel)
    if (text === null) continue
    const fence = FRONTMATTER_RE.exec(text)
    // 본문 시작 — frontmatter 는 손대지 않는다
    const offset = fence === null ? 0 : fence[0].length
    for (const target of targets) {
      if (target.rel === rel) continue
      const body = text.slice(offset)
      const mentions = unlinkedMentions(target, [{ rel, title: '', body }], 1)
      if (mentions.length === 0) continue
      const term = mentions[0]!.term
      if ([...term].length < 4) continue
      const next = linkMention(text, offset, mentions[0]!.line, term, target.slug)
      if (next !== null && next !== text) {
        text = next
        applied += 1
      }
    }
    write(vaultDir, rel, text)
  }
  return applied
}

export const assemblePipeline = (input: AssembleInput): AssembleResult => {
  const started = Date.now()
  const { vaultDir, date, authorSlug, drafts, measure } = input
  const pages: AssembledPage[] = []
  const skipped: Array<{ rel: string; reason: string }> = []
  const topics = new Set<string>()

  for (const { clipping, pages: draftsPages, updatable } of drafts) {
    const rawRef = `raw/${clipping.rawName}`
    for (const page of draftsPages) {
      const prev = read(vaultDir, page.rel)
      const isUpdateTarget = updatable.includes(page.rel)
      // 남의 파일을 LLM 출력으로 덮지 않는다 — 갱신 대상이 아니면 탈락으로 남긴다
      if (prev !== null && !isUpdateTarget) {
        skipped.push({ rel: page.rel, reason: '이미 있는 페이지라 건드리지 않았어요' })
        continue
      }
      const sources = [...existingSources(vaultDir, page.rel)]
      if (!sources.includes(rawRef)) sources.push(rawRef)
      if (clipping.source && !sources.includes(clipping.source)) sources.push(clipping.source)
      write(
        vaultDir,
        page.rel,
        `${frontmatter({
          type: page.type,
          topics: page.topics,
          status: page.status,
          sources,
          created: existingCreated(vaultDir, page.rel, date),
          updated: date
        })}\n\n${bodyOfPage(page).replace(/\s+$/u, '')}\n`
      )
      pages.push({
        rel: page.rel,
        kind: prev === null ? 'created' : 'updated',
        title: page.title,
        topics: page.topics
      })
      for (const t of page.topics) topics.add(t)
    }
  }

  // 이번 페이지들에 기존 노트 링크를 건다 — 새로 쓴 뒤 전체 목록 기준으로 한 번
  autolinkPages(
    vaultDir,
    pages.map((p) => p.rel)
  )

  // 토픽 페이지 + 링크
  for (const slug of topics) {
    ensureTopicPage(vaultDir, slug)
    const rel = `wiki/topics/${slug}.md`
    for (const page of pages.filter((p) => p.topics.includes(slug))) {
      const pageSlug = page.rel.replace(/^wiki\//, '').replace(/\.md$/i, '')
      const current = read(vaultDir, rel) ?? ''
      if (!current.includes(`[[${pageSlug}`)) {
        write(
          vaultDir,
          rel,
          appendLink(current, '## Related Notes', linkLine(pageSlug, page.title), pageSlug)
        )
      }
    }
  }

  // INDEX · TOPIC_MAP
  const indexRel = 'wiki/INDEX.md'
  let index = read(vaultDir, indexRel) ?? ''
  for (const page of pages) {
    const slug = page.rel.replace(/^wiki\//, '').replace(/\.md$/i, '')
    index = appendLink(index, '## Articles', linkLine(slug, page.title), slug)
  }
  for (const slug of topics) {
    index = appendLink(index, '## Topics', linkLine(`topics/${slug}`, slug), `topics/${slug}`)
  }
  write(vaultDir, indexRel, index)
  const mapRel = 'wiki/TOPIC_MAP.md'
  let map = read(vaultDir, mapRel) ?? ''
  for (const slug of topics) {
    map = appendLink(map, '## Root Topics', linkLine(`topics/${slug}`, slug), `topics/${slug}`)
  }
  write(vaultDir, mapRel, map)

  // run-log
  const processed = drafts.length
  const created = pages.filter((p) => p.kind === 'created').length
  const updated = pages.filter((p) => p.kind === 'updated').length
  const summary = cutBytes(`위키 초안: 자료 ${processed}개 → 새 ${created}·갱신 ${updated}`, 200)
  let runLogRel = `outputs/runs/${date}-ingest-${authorSlug}.md`
  for (let n = 2; existsSync(join(vaultDir, runLogRel)); n += 1) {
    runLogRel = `outputs/runs/${date}-ingest-${authorSlug}-${n}.md`
  }
  const notes = pages.map(
    (p) => `"[[${p.rel.replace(/^wiki\//, '').replace(/\.md$/i, '')}|${quoteTitle(p.title)}]]"`
  )
  const sources = drafts.map((d) => `"${d.clipping.source ?? `raw/${d.clipping.rawName}`}"`)
  // 조립 시간은 여기서 잰다 — 호출 쪽은 run-log 를 쓰기 전이라 모른다
  const measured: IngestMeasure | undefined = measure
    ? { ...measure, assembleMs: Date.now() - started }
    : undefined
  write(
    vaultDir,
    runLogRel,
    [
      '---',
      'type: run-log',
      'kind: ingest',
      `run_date: "${date}"`,
      `author: ${authorSlug}`,
      `summary: "${summary}"`,
      'pr:',
      `processed: ${processed}`,
      `new_notes: ${created}`,
      `updated_notes: ${updated}`,
      'tags: []',
      'sources:',
      ...sources.map((s) => `  - ${s}`),
      'notes:',
      ...notes.map((n) => `  - ${n}`),
      '---',
      '',
      `# ${date} ingest`,
      '',
      '## Summary',
      '',
      summary,
      '',
      '## Details',
      '',
      ...drafts.flatMap((d) => [
        `- ${d.clipping.rawName}: ${d.pages.map((p) => p.rel).join(', ') || '초안 없음'}`
      ]),
      ...(measured
        ? [
            `- 소요: 준비 ${sec(measured.prepareMs)} · 초안 ${sec(measured.draftMs)} · 정리 ${sec(measured.assembleMs)}`,
            `- 초안 입력: ${measured.promptChars.toLocaleString('ko-KR')}자 (호출 ${measured.draftCalls}회)`
          ]
        : []),
      '',
      '## Dropped / Issues',
      '',
      skipped.length > 0
        ? skipped.map((s) => `- 탈락: ${s.rel} — ${s.reason}`).join('\n')
        : drafts
            .filter((d) => d.clipping.duplicateOf)
            .map((d) => `- 재클리핑: ${d.clipping.rawName} (기존 ${d.clipping.duplicateOf} 갱신)`)
            .join('\n') || '없음',
      ''
    ].join('\n')
  )

  const slugs = [...new Set(pages.map((p) => p.rel.replace(/^wiki\//, '').replace(/\.md$/i, '')))]
  // 넣은 페이지가 없으면 커밋하지 않는다 — 파이프라인이 실패로 돌린다
  if (pages.length > 0) {
    git(vaultDir, ['add', '-A', '--', 'wiki', 'outputs'])
    git(vaultDir, [
      'commit',
      '-q',
      '-m',
      `feat: ingest ${processed} clippings into wiki (${slugs.join(', ') || 'no pages'})`
    ])
  }
  return { pages, skipped, topics: [...topics], runLogRel }
}
