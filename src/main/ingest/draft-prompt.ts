// 위키 초안 1회 호출 — 프롬프트 조립과 출력 파서. LLM 은 본문 초안만 낸다.
// 파일 쓰기·frontmatter 완성(INDEX·run-log 포함)은 assemble 이 코드로 한다.
// 출력 계약: `@@ wiki/<slug>.md` 로 시작하는 펜스 블록 나열. 어기면 재시도 사유로 돌려준다.
import { scanFrontmatter } from '../verify/vault-verify'

export const PAGE_TYPES = ['concept', 'tool', 'model', 'framework'] as const
export const PAGE_STATUS = ['stub', 'draft', 'complete', 'needs-update'] as const

/** 방향성 문서 상한 — 길면 자른다. 잘린 뒤에는 잘림 표시를 붙인다 */
export const PURPOSE_MAX_CHARS = 2000

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

export type DraftInput = {
  title: string
  source?: string
  body: string
  /** 기존 노트 갱신이면 그 전문 — 같은 경로로 덮어쓴다 */
  updateTargets: Array<{ rel: string; content: string }>
  /** BM25 관련 노트 전문 — 이 안에 없는 경로로 UPDATE를 내면 탈락한다 */
  bodies: Array<{ rel: string; title: string; content: string }>
  /** wiki/topics/ 기존 slug — 없으면 새로 제안해도 된다 */
  topics: string[]
  /** 볼트의 wiki-concept 템플릿 전문 */
  template: string
  /** vault purpose.md 전문 — 없으면 빈 문자열 */
  purpose?: string
}

const purposeBlock = (purpose: string | undefined): string => {
  if (!purpose) return ''
  const clipped =
    purpose.length > PURPOSE_MAX_CHARS
      ? `${purpose.slice(0, PURPOSE_MAX_CHARS)}\n…(이하 잘림)`
      : purpose
  return ['Wiki purpose (direction — prefer topics and questions in scope):', clipped, ''].join(
    '\n'
  )
}

export const buildDraftPrompt = (input: DraftInput): string => {
  const updating =
    input.updateTargets.length > 0
      ? [
          'This source was clipped before. UPDATE these existing notes instead of creating duplicates.',
          'Rewrite each target file fully, integrating the new material. Keep its path.',
          ...input.updateTargets.map((t) => `--- FILE ${t.rel} ---\n${t.content}`)
        ].join('\n')
      : 'Create new wiki notes. Split into multiple notes only if the source holds truly separate concepts.'
  const linking =
    input.bodies.length > 0
      ? [
          'Related notes (full text below) — mention their concept with [[slug|Alias]] links where the draft touches them.',
          'If the source belongs inside one of these, output an UPDATE block for its path with the full rewritten file instead of a new page.',
          'UPDATE blocks are accepted ONLY for paths listed under --- FILE below; any other path is dropped.',
          ...input.bodies.map((t) => `--- FILE ${t.rel} (${t.title}) ---\n${t.content}`)
        ].join('\n')
      : ''
  return [
    'You are drafting wiki article(s) for an Obsidian markdown knowledge vault.',
    'Rules:',
    '- Body prose in Korean. Section headings in English: Summary, Details, Connections, Open Questions.',
    `- type must be one of: ${PAGE_TYPES.join(', ')}.`,
    `- topics: reuse from [${input.topics.join(', ')}] when one fits; otherwise propose a new English kebab-case slug.`,
    '- status: stub if under 350 words, otherwise draft.',
    '- Do NOT write sources/created/updated frontmatter — the app fills those.',
    '- Do NOT write INDEX, TOPIC_MAP, topic pages, or run-logs — the app updates those.',
    '- No tools needed; all context is in this prompt. Output ONLY the fenced blocks below.',
    '',
    'Template to follow:',
    input.template,
    '',
    purposeBlock(input.purpose),
    `Source: ${input.title}${input.source ? ` (${input.source})` : ''}`,
    input.body,
    '',
    updating,
    '',
    linking,
    '',
    'Output contract (nothing else):',
    '```',
    '@@ wiki/<english-kebab-slug>.md',
    '---',
    'type: <one of the four>',
    'topics: [<slug>, ...]',
    'status: <stub|draft>',
    '---',
    '# <Korean title>',
    '<body sections>',
    '```'
  ].join('\n')
}

export type DraftPage = {
  rel: string
  type: string
  topics: string[]
  status: string
  title: string
  body: string
}

const titleOf = (body: string): string | null => {
  for (const line of body.split('\n')) {
    const match = /^#\s+(.+)\s*$/.exec(line)
    if (match) return match[1]!.trim()
  }
  return null
}

/** fenced `@@ ` 블록을 DraftPage 로 — 계약 위반은 reason 으로 (재시도 재료) */
export const parseDraft = (
  output: string
): { ok: true; pages: DraftPage[] } | { ok: false; reason: string } => {
  const blocks = output
    .split(/^@@\s+/m)
    .map((b) => b.trim())
    .filter((b) => b !== '')
    .filter((b) => !/^```/.test(b))
  if (blocks.length === 0) return { ok: false, reason: '출력에 `@@ wiki/...` 블록이 없어요' }
  const pages: DraftPage[] = []
  for (const block of blocks) {
    const nl = block.indexOf('\n')
    const rel = (nl === -1 ? block : block.slice(0, nl)).trim()
    const text = nl === -1 ? '' : block.slice(nl + 1)
    if (!/^wiki\/[a-z0-9][a-z0-9-]*\.md$/.test(rel)) {
      return { ok: false, reason: `경로가 wiki 케밥 규칙이 아니에요: ${rel}` }
    }
    const structural = scanFrontmatter(text, rel)
    if (structural.length > 0) {
      return { ok: false, reason: `frontmatter 구조가 깨졌어요 (${rel}): ${structural[0]}` }
    }
    const fmText = text.startsWith('---\n') ? text.slice(4, text.indexOf('\n---', 4)) : ''
    const get = (key: string): string => {
      const m = new RegExp(`^${key}:(.*)$`, 'm').exec(fmText)?.[1]?.trim() ?? ''
      return m.replace(/^["']|["']$/g, '')
    }
    const type = get('type')
    if (!(PAGE_TYPES as readonly string[]).includes(type)) {
      return { ok: false, reason: `type 이 목록에 없어요 (${rel}): ${type || '(없음)'}` }
    }
    const topicsRaw = /^topics:(.*)$/m.exec(fmText)?.[1]?.trim() ?? ''
    const topics = topicsRaw
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter((t) => t !== '')
    const badTopic = topics.find((t) => !SLUG_RE.test(t))
    if (badTopic)
      return { ok: false, reason: `topics slug 가 케밥이 아니에요 (${rel}): ${badTopic}` }
    const status = get('status')
    if (!(PAGE_STATUS as readonly string[]).includes(status)) {
      return { ok: false, reason: `status 가 목록에 없어요 (${rel}): ${status || '(없음)'}` }
    }
    const title = titleOf(text)
    if (!title) return { ok: false, reason: `H1 제목이 없어요 (${rel})` }
    pages.push({ rel, type, topics, status, title, body: text })
  }
  const seen = new Set<string>()
  for (const p of pages) {
    if (seen.has(p.rel)) return { ok: false, reason: `같은 경로가 두 번 나왔어요: ${p.rel}` }
    seen.add(p.rel)
  }
  return { ok: true, pages }
}

// --- 묶음 초안(대량 일괄용) ---
// 소량(≤3개)은 기존 buildDraftPrompt/draftOne 경로를 그대로 쓴다.
// 대량일 때만 여러 클리핑을 1호출에 묶어 기동 오버헤드를 나눈다.
// 품질 방어: 소스별 독립 초안(개념 혼합 금지) + 섹션 귀속 + 경로 충돌 시 전체 실패→개별 폴백.

export type BatchDraftSource = {
  /** raw 파일명 — 섹션 헤더와 귀속에 쓴다 */
  rawName: string
  title: string
  source?: string
  body: string
  updateTargets: Array<{ rel: string; content: string }>
  bodies: Array<{ rel: string; title: string; content: string }>
}

export const buildBatchDraftPrompt = (
  sources: BatchDraftSource[],
  topics: string[],
  template: string,
  purpose?: string
): string => {
  const sections = sources
    .map((s, i) => {
      const n = i + 1
      const updating =
        s.updateTargets.length > 0
          ? [
              `This source was clipped before. UPDATE these existing notes instead of creating duplicates (source ${n} only).`,
              'Rewrite each target file fully, integrating the new material. Keep its path.',
              ...s.updateTargets.map((t) => `--- FILE ${t.rel} ---\n${t.content}`)
            ].join('\n')
          : `Create new wiki notes for source ${n}. Split into multiple notes only if this source holds truly separate concepts.`
      const linking =
        s.bodies.length > 0
          ? [
              `Related notes for source ${n} (full text below) — mention their concept with [[slug|Alias]] links where the draft touches them.`,
              `If source ${n} belongs inside one of these, output an UPDATE block for its path with the full rewritten file instead of a new page.`,
              `UPDATE blocks for source ${n} are accepted ONLY for paths listed under its --- FILE below; any other path is dropped.`,
              ...s.bodies.map((t) => `--- FILE ${t.rel} (${t.title}) ---\n${t.content}`)
            ].join('\n')
          : ''
      return [
        `## SOURCE ${n}: raw/${s.rawName}`,
        `Title: ${s.title}${s.source ? ` (${s.source})` : ''}`,
        s.body,
        '',
        updating,
        '',
        linking
      ].join('\n')
    })
    .join('\n\n---\n\n')
  return [
    'You are drafting wiki article(s) for an Obsidian markdown knowledge vault.',
    `You receive ${sources.length} independent sources. Draft EACH source independently.`,
    'Rules:',
    '- Body prose in Korean. Section headings in English: Summary, Details, Connections, Open Questions.',
    `- type must be one of: ${PAGE_TYPES.join(', ')}.`,
    `- topics: reuse from [${topics.join(', ')}] when one fits; otherwise propose a new English kebab-case slug.`,
    '- status: stub if under 350 words, otherwise draft.',
    '- Do NOT write sources/created/updated frontmatter — the app fills those.',
    '- Do NOT write INDEX, TOPIC_MAP, topic pages, or run-logs — the app updates those.',
    '- Do NOT mix concepts across sources. A page for source N must use only source N material (plus its related notes).',
    '- No tools needed; all context is in this prompt. Output ONLY the sections below.',
    '',
    'Template to follow (applies to every page):',
    template,
    '',
    purposeBlock(purpose),
    sections,
    '',
    'Output contract (nothing else). One section per source, in order:',
    '## SOURCE <n>: raw/<file>',
    '```',
    '@@ wiki/<english-kebab-slug>.md',
    '---',
    'type: <one of the four>',
    'topics: [<slug>, ...]',
    'status: <stub|draft>',
    '---',
    '# <Korean title>',
    '<body sections>',
    '```',
    '- Repeat the @@ block(s) under the matching SOURCE section.',
    '- A source with genuinely nothing new may have an empty section (header only).',
    '- Never emit the same wiki path under two different SOURCE sections.'
  ].join('\n')
}

/** 묶음 출력을 소스별 섹션으로 가른다 — 헤더 누락·중복·순서 어긋남은 실패 */
export const splitBatchSections = (
  output: string,
  expected: number
): { ok: true; sections: string[] } | { ok: false; reason: string } => {
  const found: Array<{ index: number; start: number }> = []
  const re = /^## SOURCE (\d+):\s*(.+?)\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(output)) !== null) {
    found.push({ index: Number(m[1]), start: m.index })
  }
  if (found.length === 0) return { ok: false, reason: '출력에 `## SOURCE n` 섹션이 없어요' }
  const indices = found.map((f) => f.index)
  const dup = indices.find((v, i) => indices.indexOf(v) !== i)
  if (dup !== undefined) return { ok: false, reason: `SOURCE 섹션이 두 번 나왔어요: ${dup}` }
  for (let n = 1; n <= expected; n += 1) {
    if (!indices.includes(n)) return { ok: false, reason: `SOURCE 섹션이 빠졌어요: ${n}` }
  }
  if (found.length !== expected) {
    return { ok: false, reason: `SOURCE 섹션이 ${expected}개가 아니에요: ${found.length}개` }
  }
  const ordered = [...found].sort((a, b) => a.index - b.index)
  const sections = ordered.map((f, i) => {
    const end = i + 1 < ordered.length ? ordered[i + 1]!.start : output.length
    const headerEnd = output.indexOf('\n', f.start)
    return output.slice(headerEnd === -1 ? output.length : headerEnd + 1, end).trim()
  })
  return { ok: true, sections }
}

/**
 * 묶음 출력 파서 — 섹션 분리 후 기존 parseDraft 재사용.
 * 빈 섹션(헤더만)은 0페이지로 둔다. 소스 간 같은 경로 충돌은 전체 실패(개별 폴백 유도).
 */
export const parseBatchDraft = (
  output: string,
  expected: number
): { ok: true; pagesPerSource: DraftPage[][] } | { ok: false; reason: string } => {
  const split = splitBatchSections(output, expected)
  if (!split.ok) return split
  const pagesPerSource: DraftPage[][] = []
  for (const section of split.sections) {
    if (section === '') {
      pagesPerSource.push([])
      continue
    }
    const parsed = parseDraft(section)
    if (!parsed.ok) {
      // @@ 블록 없는 빈 섹션 취급(모델이 "쓸 것 없음"을 빈칸으로 낸 경우) — 0페이지로 둔다
      if (/`@@ wiki/.test(parsed.reason) && !/@@\s+wiki\//.test(section)) {
        pagesPerSource.push([])
        continue
      }
      return parsed
    }
    pagesPerSource.push(parsed.pages)
  }
  const seen = new Map<string, number>()
  for (let i = 0; i < pagesPerSource.length; i += 1) {
    for (const p of pagesPerSource[i]!) {
      const prev = seen.get(p.rel)
      if (prev !== undefined) {
        return {
          ok: false,
          reason: `같은 경로가 다른 소스에 두 번 나왔어요: ${p.rel} (SOURCE ${prev + 1}, ${i + 1})`
        }
      }
      seen.set(p.rel, i)
    }
  }
  return { ok: true, pagesPerSource }
}
