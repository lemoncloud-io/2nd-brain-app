import { parse as parseYaml } from 'yaml'
import { currentT } from '../i18n'

/** 정규화된 페이지 인덱스 항목 — 링크 해석용 최소 정보 */
export interface PageRef {
  rel: string
  slug: string
}

export interface WikiLink {
  target: string
  heading?: string
  alias?: string
  /** 원문 1-based 줄 번호 — lint broken-link 지목용 */
  line?: number
  /** wiki 페이지는 아니지만 볼트에 있는 파일로 이어진다(예: [[projects/x/README]]) — 목록을 만드는 main 이 표시한다 */
  vaultFile?: boolean
}

export interface WikiPage {
  rel: string
  slug: string
  title: string
  frontmatter: Record<string, unknown> | null
  frontmatterError?: string
  body: string
  links: WikiLink[]
}

export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** 맨 위 속성 블록 길이 — 본문은 이 뒤부터다. 없으면 0. 읽는 쪽이 쓰는 같은 잣대다 */
export const frontmatterLength = (text: string): number =>
  text.match(FRONTMATTER_RE)?.[0].length ?? 0

/**
 * [[target(#heading)?(\|alias)?]] 추출. 코드 펜스·인라인 코드 밖만.
 * 표 안의 `\|` 이스케이프도 alias 구분으로 인정한다 (review-service 링크 규칙과 같은 기대값).
 */
export const WIKILINK_RE = /\[\[([^[|#]+)(?:#([^[|]*))?(?:\\?\|([^[\]]*))?\]\]/g

/** 줄 시작 오프셋표 + 오프셋의 줄 번호(1부터) 이분탐색 */
const lineStartsOf = (text: string): number[] => {
  const starts = [0]
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  return starts
}

const lineOf = (starts: number[], index: number): number => {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid]! <= index) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function extractLinks(text: string): WikiLink[] {
  const links: WikiLink[] = []
  // 펜스·인라인 코드를 placeholder로 치환한 뒤 링크를 찾는다
  const masked = text
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (m) => '\u0000'.repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => '\u0000'.repeat(m.length))
  // 줄 시작 오프셋표 — 링크마다 앞부분을 잘라 세면 링크 수에 비례해 앞을 반복 재주사한다
  const lineStarts = lineStartsOf(masked)
  for (const match of masked.matchAll(WIKILINK_RE)) {
    const line = lineOf(lineStarts, match.index ?? 0)
    links.push({
      line,
      // 표 안 이스케이프 `\|`의 `\`가 target 꼬리에 흡수되지 않게 제거한다
      target: normalizeNFC(match[1].trim().replace(/\\$/, '')),
      heading: match[2] !== undefined ? normalizeNFC(match[2].trim()) : undefined,
      alias: match[3] !== undefined ? normalizeNFC(match[3].trim()) : undefined
    })
  }
  return links
}

const normalizeNFC = (text: string): string => text.normalize('NFC')

/**
 * 링크를 찾는 원문 — 속성 블록 안의 `[[이름]]` 은 페이지 링크가 아니다(별칭·출처·up 등에 흔하다).
 * 블록을 통째로 자르면 줄 번호가 어긋나 점검이 엉뚱한 줄을 지목하므로, 줄 수만 맞춰 비워 둔다.
 * 속성이 깨져 본문에 남은 블록은 그대로 둔다(보이는 글자와 같은 판정).
 */
const linkSource = (text: string, frontmatter: Record<string, unknown> | null): string => {
  if (frontmatter === null) return text
  const match = text.match(FRONTMATTER_RE)
  if (!match) return text
  const kept = match[0].split('\n').length - 1
  return `${'\n'.repeat(kept)}${text.slice(match[0].length)}`
}

export function parseWikiPage(rel: string, text: string): WikiPage {
  const slug = rel.startsWith('wiki/')
    ? rel.slice('wiki/'.length).replace(/\.md$/, '')
    : rel.replace(/\.md$/, '')

  let frontmatter: Record<string, unknown> | null = null
  let frontmatterError: string | undefined
  let body = text

  const match = text.match(FRONTMATTER_RE)
  if (match) {
    try {
      const parsed = parseYaml(match[1])
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        frontmatter = parsed as Record<string, unknown>
        body = text.slice(match[0].length)
      } else {
        frontmatterError = currentT().wiki.frontmatterNotMap
      }
    } catch (err) {
      frontmatterError = err instanceof Error ? err.message : String(err)
    }
  }

  const title = extractTitle(frontmatter, body, slug)
  return {
    rel,
    slug,
    title,
    frontmatter,
    frontmatterError,
    body,
    links: extractLinks(linkSource(text, frontmatter))
  }
}

function extractTitle(
  frontmatter: Record<string, unknown> | null,
  body: string,
  slug: string
): string {
  const fmTitle = frontmatter?.title
  if (typeof fmTitle === 'string' && fmTitle.trim()) return fmTitle.trim()
  const heading = body.match(/^#\s+(.+?)\s*$/m)
  if (heading) return heading[1]
  return slug.slice(slug.lastIndexOf('/') + 1)
}

export type ResolvedLink = { rel: string | null }

export type LinkResolver = (target: string) => ResolvedLink

/**
 * Obsidian 규칙: basename 일치 우선, 경로형은 경로 일치.
 * basename 중복이면 가장 짧은 경로를 고른다. 비교는 NFC 정규화 후.
 * 한 목록으로 링크를 여러 번 풀 때는 이걸로 — 조회표를 한 번 만들고 링크마다 O(1).
 */
export function createLinkResolver(index: PageRef[]): LinkResolver {
  const bySlug = new Map<string, PageRef>()
  const byBase = new Map<string, PageRef>()
  for (const p of index) {
    const slug = normalizeNFC(p.slug).toLowerCase()
    keepShortest(bySlug, slug, p)
    keepShortest(byBase, slug.slice(slug.lastIndexOf('/') + 1), p)
  }
  return (target) => {
    // `.MD` 도 떼야 한다 — 떼기 전에 낮춰야 대문자가 걸린다
    const wanted = normalizeNFC(target).toLowerCase().replace(/\.md$/, '')
    const hit = bySlug.get(wanted) ?? byBase.get(wanted.slice(wanted.lastIndexOf('/') + 1))
    return { rel: hit?.rel ?? null }
  }
}

/** 한 번짜리 해석 — 링크마다 부르는 루프에서는 `createLinkResolver` 로 조회표를 재사용한다(매 호출 표를 만들면 N배) */
export function resolveLink(target: string, index: PageRef[]): ResolvedLink {
  const wantedLower = normalizeNFC(target).toLowerCase().replace(/\.md$/, '')

  // 경로형 — slug 전체(대소문자 무시) 일치
  const pathMatched = index.filter((p) => normalizeNFC(p.slug).toLowerCase() === wantedLower)
  if (pathMatched.length > 0) {
    return { rel: shortest(pathMatched).rel }
  }

  // basename 일치
  const baseMatched = index.filter(
    (p) =>
      normalizeNFC(p.slug.slice(p.slug.lastIndexOf('/') + 1)).toLowerCase() ===
      wantedLower.slice(wantedLower.lastIndexOf('/') + 1)
  )
  if (baseMatched.length > 0) {
    return { rel: shortest(baseMatched).rel }
  }

  return { rel: null }
}

const shortest = (pages: PageRef[]): PageRef =>
  pages.reduce((a, b) => (b.rel.length < a.rel.length ? b : a))

const keepShortest = (map: Map<string, PageRef>, key: string, p: PageRef): void => {
  const prev = map.get(key)
  if (prev === undefined || p.rel.length < prev.rel.length) map.set(key, p)
}
