// 위키화 파이프라인 — 결정론 준비 → LLM 초안 → 결정론 조립.
// 소량(≤3개)은 클리핑당 1회, 대량은 묶음 1호출(최대 3소스)로 기동비를 나눈다.
// 에이전트에게 통째로 맡기던 일을 나눈다: git·파일명·중복·INDEX·run-log 은 코드,
// 한국어 본문 초안만 LLM. runIngest(통 에이전트)를 대체한다.
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineEvent, IngestOutcome } from '../../shared/ipc-contract'
import { searchPages } from '../../shared/wiki/search'
import { checkIngestResult } from '../engine/work-branch'
import { WikiService } from '../wiki/wiki-service'
import { assemblePipeline, type IngestMeasure } from './assemble'
import {
  buildBatchDraftPrompt,
  buildDraftPrompt,
  parseBatchDraft,
  parseDraft,
  type DraftPage
} from './draft-prompt'
import { preparePipeline, rollbackPrepared, type Prepared, type PreparedClipping } from './prepare'
import { readPurpose } from '../vault/purpose'
import type { IngestQueueStatus } from '../../shared/ipc/clip-ingest'
import { mainT } from '../i18n'

/** 소량 임계 — 이 개수까지는 기존 건당 1호출 경로를 그대로 쓴다(품질·체감 보존) */
export const SEQUENTIAL_LIMIT = 3
/** 묶음 1호출당 최대 소스 수 — 출력 잘림·개념 혼합을 막는다 */
export const BATCH_MAX_SOURCES = 3
/** 묶음 1호출당 문맥 예산(문자) — 넘기면 청크를 나눈다 */
export const BATCH_MAX_CHARS = 24000

export type DraftRunner = {
  /** 초안 프롬프트 1회 실행 — 이벤트를 그대로 흘려보낸다 */
  run: (prompt: string) => AsyncIterable<EngineEvent>
  isCanceled: () => boolean
}

const read = (vaultDir: string, rel: string): string | null => {
  try {
    return readFileSync(join(vaultDir, rel), 'utf8')
  } catch {
    return null
  }
}

const topicSlugs = (vaultDir: string): string[] => {
  let names: string[] = []
  try {
    names = readdirSync(join(vaultDir, 'wiki', 'topics'))
  } catch {
    return []
  }
  return names.filter((n) => n.endsWith('.md') && !n.startsWith('.')).map((n) => n.slice(0, -3))
}

const CONCEPT_TEMPLATE = [
  '---',
  'type: concept',
  'topics: []',
  'status: draft',
  'sources:',
  '  - "raw/source-file-name.md"',
  'created: "{{date}}"',
  'updated: "{{date}}"',
  '---',
  '',
  '# {{title}}',
  '',
  '## Summary',
  '',
  '## Details',
  '',
  '## Connections',
  '',
  '## Open Questions'
].join('\n')

type DraftContext = {
  updateTargets: Array<{ rel: string; content: string }>
  bodies: Array<{ rel: string; title: string; content: string }>
  updatable: string[]
}

/** 관련 노트 최대 수 — 단건 프롬프트 폭증 방지. knowledge 실측: 8전문≈8만자→수분 지연 */
export const RELATED_MAX_COUNT = 3
/** 관련 노트 개당 최대 문자 — 잘린 뒤에는 잘림 표시를 붙인다. 갱신 대상(updateTargets)은 전문 유지 */
export const RELATED_MAX_CHARS = 2000

/** draftOne과 묶음 초안이 같은 문맥을 쓰게 — BM25·updatable 로직 단일화.
 *  docs는 묶음 호출이 한 번 읽어 나눈다. 생략 시 건당 읽는다(단건 경로). */
const collectContext = (
  vaultDir: string,
  clipping: PreparedClipping,
  docs?: ReturnType<typeof WikiService.listDocs>
): DraftContext => {
  const updateTargets = clipping.updateTargets.flatMap((rel) => {
    const content = read(vaultDir, rel)
    return content === null ? [] : [{ rel, content }]
  })
  const known = new Set(updateTargets.map((t) => t.rel))
  // 관련 노트(BM25) — 상위 RELATED_MAX_COUNT개만, 개당 RELATED_MAX_CHARS자로 잘라 싣는다.
  // 토픽 페이지는 갱신 대상에서 뺀다: 승인 목록에 안 보여서 덮어쓰면 조용히 머지된다
  const related = searchPages(
    docs ?? WikiService.listDocs(vaultDir),
    `${clipping.title}\n${clipping.body.slice(0, 2000)}`,
    RELATED_MAX_COUNT
  ).filter(
    (h) => h.rel.startsWith('wiki/') && !h.rel.startsWith('wiki/topics/') && !known.has(h.rel)
  )
  const bodies = related.flatMap((h) => {
    // INDEX·TOPIC_MAP만 뺀다: 승인 목록에 안 보여서 덮어쓰면 조용히 머지된다.
    // VAULT_MEMORY 는 빼지 않는다 — 관련 노트 맥락으로 쓴다 (lint 면제 목록과는 의도적으로 다르다)
    if (h.rel === 'wiki/INDEX.md' || h.rel === 'wiki/TOPIC_MAP.md') return []
    const content = read(vaultDir, h.rel)
    if (content === null) return []
    const clipped =
      content.length > RELATED_MAX_CHARS
        ? // ui-hangul-ignore: AI 에게 보내는 맥락 발췌 표식(범위 밖: AI 프롬프트)
          `${content.slice(0, RELATED_MAX_CHARS)}\n\n…(이하 잘림 — 링크용 맥락 발췌)`
        : content
    return [{ rel: h.rel, title: h.title, content: clipped }]
  })
  const updatable = [...updateTargets.map((t) => t.rel), ...bodies.map((b) => b.rel)]
  return { updateTargets, bodies, updatable }
}

const contextChars = (clipping: PreparedClipping, ctx: DraftContext): number =>
  clipping.body.length +
  ctx.updateTargets.reduce((n, t) => n + t.content.length, 0) +
  ctx.bodies.reduce((n, b) => n + b.content.length, 0)

/**
 * 묶음 청크 나누기 — 개수 상한 + 문자 예산. 큰 클리핑은 자동으로 단독 청크가 된다.
 * 순서를 바꾸지 않는다(승인·run-log 순서 안정).
 */
export const chunkForBatch = (
  items: Array<{ clipping: PreparedClipping; ctx: DraftContext }>
): Array<Array<{ clipping: PreparedClipping; ctx: DraftContext }>> => {
  const chunks: Array<Array<{ clipping: PreparedClipping; ctx: DraftContext }>> = []
  let current: Array<{ clipping: PreparedClipping; ctx: DraftContext }> = []
  let chars = 0
  for (const item of items) {
    const size = contextChars(item.clipping, item.ctx)
    if (
      current.length >= BATCH_MAX_SOURCES ||
      (current.length > 0 && chars + size > BATCH_MAX_CHARS)
    ) {
      chunks.push(current)
      current = []
      chars = 0
    }
    current.push(item)
    chars += size
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

const runOnce = async (
  runner: DraftRunner,
  prompt: string,
  onEvent: (event: EngineEvent) => void
): Promise<{ output: string; ok: boolean } | null> => {
  let output = ''
  let ok = false
  let canceled = false
  for await (const event of runner.run(prompt)) {
    // 호출마다의 끝은 흘리지 않는다 — 자료마다·다시 묻기마다 "작업을 마쳤어요/끝내지 못했어요" 가
    // 도중에 떴다. 위키화 전체의 끝은 결과 카드가 말한다
    if (event.type === 'done') {
      ok = event.ok
      canceled = event.canceled
      continue
    }
    onEvent(event)
    if (event.type === 'text') output += `${event.text}\n`
  }
  if (canceled || runner.isCanceled()) return null
  return { output, ok }
}

const draftOne = async (
  vaultDir: string,
  clipping: PreparedClipping,
  runner: DraftRunner,
  onEvent: (event: EngineEvent) => void,
  purpose: string,
  docs?: ReturnType<typeof WikiService.listDocs>
): Promise<{ pages: DraftPage[]; updatable: string[]; exhausted: boolean } | null> => {
  const ctx = collectContext(vaultDir, clipping, docs)
  let prompt = buildDraftPrompt({
    title: clipping.title,
    source: clipping.source,
    body: clipping.body,
    updateTargets: ctx.updateTargets,
    bodies: ctx.bodies,
    topics: topicSlugs(vaultDir),
    template: read(vaultDir, 'templates/wiki-concept.md') ?? CONCEPT_TEMPLATE,
    purpose
  })
  // 파서 계약 위반이면 사유를 붙여 한 번만 다시 — 그래도 안 되면 이 클리핑은 건너뛴다
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await runOnce(runner, prompt, onEvent)
    if (res === null) return null
    if (!res.ok) {
      prompt = `${prompt}\n\nEngine run failed without usable output. Output the fenced blocks only.`
      continue
    }
    const parsed = parseDraft(res.output)
    if (parsed.ok) return { pages: parsed.pages, updatable: ctx.updatable, exhausted: false }
    // ui-hangul-ignore: AI 에게 보내는 재시도 지시(범위 밖: AI 프롬프트)
    prompt = `${prompt}\n\n다시 써 주세요. 문제: ${parsed.reason} — 출력은 펜스 블록만.`
  }
  // 재시도 소진 — 빈 초안으로 위장하지 않고 소진 표시로 돌린다(호출 쪽이 failed로 기록)
  return { pages: [], updatable: ctx.updatable, exhausted: true }
}

/**
 * 묶음 초안 — 한 청크를 1호출로. 최대 1회 재시도 후 실패하면 null 대신
 * 'fallback'을 돌려 호출 쪽에서 건당 draftOne으로 낱개 재시도한다(품질 보존).
 */
const draftBatch = async (
  vaultDir: string,
  items: Array<{ clipping: PreparedClipping; ctx: DraftContext }>,
  runner: DraftRunner,
  onEvent: (event: EngineEvent) => void,
  purpose: string
): Promise<Array<{ pages: DraftPage[]; updatable: string[] }> | 'fallback' | null> => {
  const topics = topicSlugs(vaultDir)
  const template = read(vaultDir, 'templates/wiki-concept.md') ?? CONCEPT_TEMPLATE
  let prompt = buildBatchDraftPrompt(
    items.map((item) => ({
      rawName: item.clipping.rawName,
      title: item.clipping.title,
      source: item.clipping.source,
      body: item.clipping.body,
      updateTargets: item.ctx.updateTargets,
      bodies: item.ctx.bodies
    })),
    topics,
    template,
    purpose
  )
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await runOnce(runner, prompt, onEvent)
    if (res === null) return null
    if (!res.ok) {
      prompt = `${prompt}\n\nEngine run failed without usable output. Output the SOURCE sections only.`
      continue
    }
    const parsed = parseBatchDraft(res.output, items.length)
    if (parsed.ok) {
      return items.map((item, i) => ({
        pages: parsed.pagesPerSource[i] ?? [],
        updatable: item.ctx.updatable
      }))
    }
    // ui-hangul-ignore: AI 에게 보내는 재시도 지시(범위 밖: AI 프롬프트)
    prompt = `${prompt}\n\n다시 써 주세요. 문제: ${parsed.reason} — 출력은 SOURCE 섹션과 펜스 블록만. 소스를 서로 섞지 마세요.`
  }
  return 'fallback'
}

type Draft = { clipping: PreparedClipping; pages: DraftPage[]; updatable: string[] }

/** 초안 단계 — null 은 취소 */
const draftAll = async (
  vaultDir: string,
  clippings: PreparedClipping[],
  runner: DraftRunner,
  onEvent: (event: EngineEvent) => void,
  mark?: (clippingName: string, status: IngestQueueStatus) => void
): Promise<Draft[] | null> => {
  const drafts: Draft[] = []
  // 초안 호출은 도구 없이 돈다 — 화면은 읽기 이벤트가 아니라 여기서 센 수로 진행을 말한다
  const report = (): void =>
    onEvent({
      type: 'phase',
      // 진행 수가 바뀔 때마다 같은 이름으로 다시 알린다(화면은 한 줄로 접는다)
      label: mainT().ingestMain.phaseDraft,
      progress: {
        done: drafts.length,
        total: clippings.length,
        pages: drafts.reduce((n, d) => n + d.pages.length, 0)
      }
    })
  const add = (
    clipping: PreparedClipping,
    drafted: { pages: DraftPage[]; updatable: string[] }
  ): void => {
    drafts.push({ clipping, pages: drafted.pages, updatable: drafted.updatable })
    report()
  }
  report()
  // 같은 내용은 LLM 호출 없이 건너뛴다 — raw/ 이동·이력은 prepare 가 이미 끝냈다
  const skipped = clippings.filter((c) => c.skipDraft)
  for (const clipping of skipped) {
    mark?.(clipping.clippingName, 'skipped')
    add(clipping, { pages: [], updatable: [] })
  }
  const live = clippings.filter((c) => !c.skipDraft)
  // 방향성 문서는 실행당 한 번만 읽는다 — 호출마다 다시 읽으면 토큰 낭비·프롬프트 흔들림
  const purpose = readPurpose(vaultDir)
  const draftLive = async (
    clipping: PreparedClipping,
    docs?: ReturnType<typeof WikiService.listDocs>
  ): Promise<{ pages: DraftPage[]; updatable: string[]; exhausted: boolean } | null> => {
    mark?.(clipping.clippingName, 'processing')
    const drafted = await draftOne(vaultDir, clipping, runner, onEvent, purpose, docs)
    if (drafted === null) return null
    mark?.(
      clipping.clippingName,
      drafted.exhausted ? 'failed' : drafted.pages.length > 0 ? 'done' : 'empty'
    )
    return drafted
  }
  // 소량은 기존 건당 호출 그대로(품질·체감 보존) — 목록만 한 번 읽어 나눈다.
  // 실행 중 wiki/는 바뀌지 않는다(쓰기는 조립 단계).
  if (live.length <= SEQUENTIAL_LIMIT) {
    if (live.length === 0) return drafts
    const docs = WikiService.listDocs(vaultDir)
    for (const clipping of live) {
      if (runner.isCanceled()) return null
      const drafted = await draftLive(clipping, docs)
      if (drafted === null) return null
      add(clipping, drafted)
    }
    return drafts
  }
  // 묶음 수집은 목록을 한 번만 읽는다 — 실행 중 wiki/는 바뀌지 않는다(쓰기는 조립 단계)
  const docs = WikiService.listDocs(vaultDir)
  const items = live.map((clipping) => ({
    clipping,
    ctx: collectContext(vaultDir, clipping, docs)
  }))
  for (const chunk of chunkForBatch(items)) {
    if (runner.isCanceled()) return null
    // 단독 청크는 건당 경로와 완전히 같은 프롬프트·파서로 (큰 클리핑 품질 보존)
    if (chunk.length === 1) {
      const solo = chunk[0]!
      const drafted = await draftLive(solo.clipping, docs)
      if (drafted === null) return null
      add(solo.clipping, drafted)
      continue
    }
    for (const item of chunk) mark?.(item.clipping.clippingName, 'processing')
    const batched = await draftBatch(vaultDir, chunk, runner, onEvent, purpose)
    if (batched === null) return null
    if (batched !== 'fallback') {
      chunk.forEach((item, i) => {
        const pages = batched[i]!
        mark?.(item.clipping.clippingName, pages.pages.length > 0 ? 'done' : 'empty')
        add(item.clipping, pages)
      })
      continue
    }
    // 묶음 실패 시 낱개로 폴백 — 느려지지만 결과는 건당 품질과 같다
    for (const item of chunk) {
      if (runner.isCanceled()) return null
      const drafted = await draftOne(vaultDir, item.clipping, runner, onEvent, purpose, docs)
      if (drafted === null) return null
      mark?.(
        item.clipping.clippingName,
        drafted.exhausted ? 'failed' : drafted.pages.length > 0 ? 'done' : 'empty'
      )
      add(item.clipping, drafted)
    }
  }
  return drafts
}

/**
 * 페이지가 커밋되기 전에 끝난 위키화 — 자료를 대기함으로 돌려놓아 "다시 위키화"가 그대로 되게 한다.
 * 되감지 못하면 작업 브랜치가 남으므로 승인에서 정리하라고 말한다. `next` = 되감겼을 때 사유 뒤에 붙는 말.
 */
const rewound = (
  vaultDir: string,
  prepared: Prepared,
  status: 'canceled' | 'failed',
  reason: string,
  next: string
): IngestOutcome => ({
  status,
  reason: rollbackPrepared(vaultDir, prepared)
    ? `${reason}${next}`
    : `${reason}${mainT().ingestMain.stranded}`
})

export type IngestQueueHooks = {
  /** 준비된 항목 목록 — 핸들러가 큐 기록을 쓴다 */
  onPrepared?: (clippings: PreparedClipping[]) => void
  /** 항목 상태 전이 — skipped/done/empty/processing/failed/canceled */
  mark?: (clippingName: string, status: IngestQueueStatus) => void
}

export const runPipeline = async (
  vaultDir: string,
  runner: DraftRunner,
  onEvent: (event: EngineEvent) => void,
  hooks?: IngestQueueHooks
): Promise<IngestOutcome> => {
  const started = Date.now()
  const prepared = preparePipeline(vaultDir)
  if (!prepared.ok) return { status: 'failed', reason: prepared.reason }
  const prepareMs = Date.now() - started
  // 초안 입력을 잰다 — 같은 프롬프트를 두 번 보내면(재시도) 합산된다
  const measure: IngestMeasure = {
    promptChars: 0,
    draftCalls: 0,
    prepareMs,
    draftMs: 0,
    assembleMs: 0
  }
  const measured: DraftRunner = {
    run: (prompt) => {
      measure.promptChars += prompt.length
      measure.draftCalls += 1
      return runner.run(prompt)
    },
    isCanceled: runner.isCanceled
  }

  let assembled: ReturnType<typeof assemblePipeline>
  try {
    // 진행률은 draftAll 이 센 수로 알린다(화면은 한 줄로 접는다). 시간만 여기서 잰다
    const draftStarted = Date.now()
    hooks?.onPrepared?.(prepared.clippings)
    const drafts = await draftAll(vaultDir, prepared.clippings, measured, onEvent, hooks?.mark)
    measure.draftMs = Date.now() - draftStarted
    if (drafts === null) {
      for (const c of prepared.clippings) hooks?.mark?.(c.clippingName, 'canceled')
      return rewound(
        vaultDir,
        prepared,
        'canceled',
        mainT().ingestMain.canceled,
        mainT().ingestMain.canceledTail
      )
    }
    // 전부 같은 내용 스킵이면 성공으로 둔다 — 시작 커밋(raw 이동)만 있고 쓸 초안이 없다.
    // 승인 화면은 빈/Wiki 변경 없음으로 보이고, raw 이력은 머지로 들어간다
    if (!drafts.some((d) => d.pages.length > 0)) {
      if (prepared.clippings.length > 0 && prepared.clippings.every((c) => c.skipDraft)) {
        const checked = checkIngestResult(vaultDir, {
          defaultBranch: prepared.defaultBranch,
          head: prepared.head
        })
        return checked.ok
          ? { status: 'succeeded', branch: checked.branch }
          : { status: 'failed', reason: checked.reason }
      }
      return rewound(
        vaultDir,
        prepared,
        'failed',
        mainT().ingestMain.noneWritten(prepared.clippings.length),
        mainT().ingestMain.againTail
      )
    }
    onEvent({ type: 'phase', label: mainT().ingestMain.phaseAssemble })
    assembled = assemblePipeline({
      vaultDir,
      date: prepared.date,
      authorSlug: prepared.authorSlug,
      drafts,
      measure: { ...measure }
    })
  } catch (error) {
    // 초안·조립이 던져도 자료는 대기함으로 — 사유는 원래 예외 그대로 올라간다.
    // 쓰다 만 페이지나 결과 커밋이 있으면 되감기가 스스로 물러나 작업 브랜치가 남는다
    for (const c of prepared.clippings) hooks?.mark?.(c.clippingName, 'failed')
    if (rollbackPrepared(vaultDir, prepared)) throw error
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${mainT().ingestMain.stranded}`,
      {
        cause: error
      }
    )
  }
  // 전부 탈락이면 커밋은 나가지 않는다(assemble) — 빈 승인으로 성공 주지 않는다.
  // 커밋 없이 쓰인 실행 기록은 되감기 전에 지운다 — 남으면 기본 브랜치에 커밋 전 파일로 딸려 간다
  if (assembled.pages.length === 0) {
    rmSync(join(vaultDir, assembled.runLogRel), { force: true })
    return rewound(vaultDir, prepared, 'failed', mainT().ingestMain.allOverlap, '')
  }
  const checked = checkIngestResult(vaultDir, {
    defaultBranch: prepared.defaultBranch,
    head: prepared.head
  })
  return checked.ok
    ? { status: 'succeeded', branch: checked.branch }
    : { status: 'failed', reason: checked.reason }
}
