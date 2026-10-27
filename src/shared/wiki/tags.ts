// 태그 — 맨 위 속성의 `tags` 와 본문의 `#태그`(Obsidian 과 같은 규칙).
// 코드 안의 `#` 과 제목 줄(`# 제목`)은 태그가 아니다. 숫자만 있는 `#123` 도 아니다. 대소문자는 가리지 않는다.

const INLINE_TAG_RE = /(^|[\s(（,，])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu

const clean = (tag: string): string => tag.trim().replace(/^#/, '').replace(/\/+$/, '')

/** 속성의 `tags` — 목록이든 쉼표·공백으로 이은 글이든 받는다 */
const frontmatterTags = (value: unknown): string[] => {
  if (Array.isArray(value))
    return value.flatMap((v) =>
      typeof v === 'string' || typeof v === 'number' ? [clean(String(v))] : []
    )
  if (typeof value === 'string') return value.split(/[,\s]+/).map(clean)
  return []
}

/** 본문의 `#태그` — 펜스·인라인 코드는 지우고 찾는다 */
export const inlineTags = (body: string): string[] => {
  const masked = body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ').replace(/`[^`\n]*`/g, ' ')
  const out: string[] = []
  for (const m of masked.matchAll(INLINE_TAG_RE)) out.push(clean(m[2]))
  return out
}

/** 문서 하나의 태그 — 처음 나온 모양으로, 같은 태그(대소문자 무시)는 한 번만 */
export const pageTags = (page: {
  frontmatter: Record<string, unknown> | null
  body: string
}): string[] => {
  const seen = new Map<string, string>()
  for (const tag of [...frontmatterTags(page.frontmatter?.tags), ...inlineTags(page.body)]) {
    if (tag === '') continue
    const key = tag.toLowerCase()
    if (!seen.has(key)) seen.set(key, tag)
  }
  return [...seen.values()]
}

export interface TagEntry {
  tag: string
  count: number
  rels: string[]
}

/** 보관함 전체 태그 표 — 많이 쓴 순, 같으면 이름 순 */
export const tagIndex = (pages: { rel: string; tags: string[] }[]): TagEntry[] => {
  const byKey = new Map<string, TagEntry>()
  for (const page of pages) {
    for (const tag of page.tags) {
      const key = tag.toLowerCase()
      const entry = byKey.get(key) ?? { tag, count: 0, rels: [] }
      entry.count += 1
      entry.rels.push(page.rel)
      byKey.set(key, entry)
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** 검색어에서 `#태그` 를 떼어 낸다 — 남은 글은 보통 검색어다 */
export const splitTagQuery = (query: string): { tags: string[]; rest: string } => {
  const tags: string[] = []
  const rest = query
    .replace(/(^|\s)#([^\s#]+)/gu, (_m, lead: string, tag: string) => {
      // 본문 규칙과 같이 끝의 문장부호는 태그가 아니다 (`#회의!` → `회의`)
      tags.push(
        clean(tag)
          .toLowerCase()
          .replace(/[^\p{L}\p{N}_/-]+$/u, '')
      )
      return lead
    })
    .trim()
  return { tags: tags.filter((t) => t !== ''), rest }
}

/** 문서가 태그를 갖는가 — `#a` 는 `#a/b` 도 품는다(중첩 태그). 양쪽 다 낮춰서 본다 */
export const hasTag = (tags: string[], wanted: string): boolean => {
  const want = wanted.toLowerCase()
  return tags.some((tag) => {
    const key = tag.toLowerCase()
    return key === want || key.startsWith(`${want}/`)
  })
}
