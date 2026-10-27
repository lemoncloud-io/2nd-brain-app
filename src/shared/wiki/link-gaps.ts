// 링크의 빈틈 — Obsidian 의 "unresolved links"(가리킨 곳이 없는 링크)와 "unlinked mentions"(이름은 적었지만
// 링크로 걸지 않은 곳). 둘 다 결정론 코드다: 목록·본문만 보고 LLM 은 쓰지 않는다.
import { WIKILINK_RE, createLinkResolver, type PageRef } from './parse'

export type LinkEntry = PageRef & {
  title: string
  links: { target: string; vaultFile?: boolean }[]
}

export type Unresolved = { target: string; sources: { rel: string; title: string }[] }

/** 가리킨 곳이 없는 링크 — 대상별로 묶고, 많이 가리킨 순 */
export const unresolvedLinks = (entries: LinkEntry[]): Unresolved[] => {
  const resolve = createLinkResolver(entries.map((e) => ({ rel: e.rel, slug: e.slug })))
  const byTarget = new Map<string, Unresolved>()
  for (const from of entries) {
    for (const link of from.links) {
      if (link.vaultFile) continue
      const target = link.target.trim()
      if (target === '' || resolve(target).rel !== null) continue
      const key = target.toLowerCase()
      const entry = byTarget.get(key) ?? { target, sources: [] }
      if (!entry.sources.some((s) => s.rel === from.rel)) {
        entry.sources.push({ rel: from.rel, title: from.title })
      }
      byTarget.set(key, entry)
    }
  }
  return [...byTarget.values()].sort(
    (a, b) => b.sources.length - a.sources.length || a.target.localeCompare(b.target, 'ko')
  )
}

export type Mention = { rel: string; title: string; line: number; term: string; snippet: string }

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 영문·숫자로 끝나는 말은 단어 경계로만 찾는다 — "AI" 가 "MAIL" 안에서 걸리지 않게 */
const termRe = (term: string): RegExp => {
  const lead = /^[A-Za-z0-9]/.test(term) ? '(?<![A-Za-z0-9])' : ''
  const tail = /[A-Za-z0-9]$/.test(term) ? '(?![A-Za-z0-9])' : ''
  return new RegExp(`${lead}${escapeRe(term)}${tail}`, 'i')
}

/** 링크·코드·URL 을 같은 길이의 빈칸으로 가린다 — 가린 자리 안의 이름은 언급이 아니다 */
const MASK_WIKILINK_RE = new RegExp(WIKILINK_RE.source, 'g')
const MASK_CODE_RE = /`[^`]*`/g
const MASK_MD_LINK_RE = /\[[^\]]*\]\([^)]*\)/g
const MASK_URL_RE = /https?:\/\/\S+/g
const maskLine = (line: string): string =>
  line
    .replace(MASK_WIKILINK_RE, (m) => ' '.repeat(m.length))
    .replace(MASK_CODE_RE, (m) => ' '.repeat(m.length))
    .replace(MASK_MD_LINK_RE, (m) => ' '.repeat(m.length))
    .replace(MASK_URL_RE, (m) => ' '.repeat(m.length))

/** 찾을 이름들 — 제목과 파일 이름(두 글자 이상), 긴 것부터 */
export const mentionTerms = (page: { title: string; slug: string }): string[] => {
  const base = page.slug.split('/').pop() ?? page.slug
  return [...new Set([page.title.trim(), base.trim()])]
    .filter((t) => [...t].length >= 2)
    .sort((a, b) => b.length - a.length)
}

/** 다른 문서에서 이 페이지 이름을 링크 없이 적은 줄 — 줄마다 하나, 최대 `limit` 개 */
export const unlinkedMentions = (
  target: { rel: string; title: string; slug: string },
  docs: { rel: string; title: string; body: string }[],
  limit = 50
): Mention[] => {
  const terms = mentionTerms(target).map((term) => ({ term, re: termRe(term) }))
  if (terms.length === 0) return []
  // 줄 먼저 값싸게 거른다 — 가리기는 줄마다 정규식 4개를 돌린다. 가리기는 빈칸으로만 바꾸고
  // 길이를 유지하므로, 마스크 뒤에 걸리는 이름은 원문(소문자)에도 반드시 들어 있다. 단, 연속 공백이
  // 든 이름은 가리며 생긴 공백과 만날 수 있어(`a``b` → `a  b`) 이 빠른 길을 타지 않는다
  const lowered = terms.map(({ term }) => term.toLowerCase())
  const prefilterable = lowered.every((t) => !/\s\s/.test(t))
  const out: Mention[] = []
  for (const doc of docs) {
    if (doc.rel === target.rel) continue
    let fenced = false
    const lines = doc.body.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced
        continue
      }
      if (fenced || /^\s*#{1,6}\s/.test(line)) continue
      if (prefilterable) {
        const lower = line.toLowerCase()
        if (!lowered.some((t) => lower.includes(t))) continue
      }
      const masked = maskLine(line)
      const hit = terms.find(({ re }) => re.test(masked))
      if (!hit) continue
      out.push({ rel: doc.rel, title: doc.title, line: i, term: hit.term, snippet: line.trim() })
      if (out.length >= limit) return out
    }
  }
  return out
}

/**
 * 언급 한 곳을 링크로 바꾼다 — 본문 `lineInBody` 번째 줄(프런트매터 뒤 본문 기준)의 첫 가려지지 않은 이름.
 * 이름이 링크 대상과 같으면 `[[이름]]`, 다르면 `[[대상|이름]]`(보이는 글자는 그대로). 못 찾으면 null.
 */
export const linkMention = (
  text: string,
  bodyOffset: number,
  lineInBody: number,
  term: string,
  linkTarget: string
): string | null => {
  const head = text.slice(0, bodyOffset)
  const lines = text.slice(bodyOffset).split('\n')
  const line = lines[lineInBody]
  if (line === undefined) return null
  const m = termRe(term).exec(maskLine(line))
  if (m === null) return null
  const shown = line.slice(m.index, m.index + m[0].length)
  const link =
    shown.toLowerCase() === linkTarget.toLowerCase() ? `[[${shown}]]` : `[[${linkTarget}|${shown}]]`
  lines[lineInBody] = line.slice(0, m.index) + link + line.slice(m.index + m[0].length)
  return head + lines.join('\n')
}
