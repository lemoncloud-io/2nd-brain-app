// Cmd+K 페이지 고르기 — 제목·경로 부분 일치. 본문 검색은 검색 탭 몫이다.
import type { VaultDocEntry, VaultTreeEntry, WikiListEntry } from '../../../shared/ipc-contract'

/** 고를 수 있는 문서 한 줄 */
export type PaletteEntry = { rel: string; title: string }

/**
 * ⌘K 가 찾는 범위 — 파일 트리의 모든 md. 제목은 위키 목록 → 보관함 문서 목록 → 파일 이름 순으로 고른다.
 * 트리를 아직 못 읽었으면 두 목록만 쓴다.
 */
export const paletteEntries = (
  pages: WikiListEntry[],
  docs: VaultDocEntry[],
  tree: VaultTreeEntry[]
): PaletteEntry[] => {
  const byRel = new Map<string, PaletteEntry>()
  const add = (rel: string, title: string): void => {
    if (!byRel.has(rel)) byRel.set(rel, { rel, title })
  }
  for (const p of pages) add(p.rel, p.title)
  for (const d of docs) add(d.rel, d.title)
  for (const e of tree) {
    if (e.kind === 'file' && e.ext === '.md')
      add(e.rel, e.rel.slice(e.rel.lastIndexOf('/') + 1, -3))
  }
  return [...byRel.values()]
}

export const PALETTE_LIMIT = 50

type Ranked<T> = { page: T; rank: number }

// 낮을수록 위 — 제목 앞 일치 < 제목 안 일치 < 경로 일치 < 띄어 쓴 낱말이 저마다 일치(`보고서 pdf`)
const rankOf = (page: PaletteEntry, needle: string, terms: string[]): number | null => {
  const title = page.title.toLowerCase()
  if (title.startsWith(needle)) return 0
  if (title.includes(needle)) return 1
  const rel = page.rel.toLowerCase()
  if (rel.includes(needle)) return 2
  if (terms.length > 1 && terms.every((t) => title.includes(t) || rel.includes(t))) return 3
  return null
}

export const matchPages = <T extends PaletteEntry>(pages: T[], query: string): T[] => {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const terms = needle.split(/\s+/)
  return pages
    .map((page): Ranked<T> | null => {
      const rank = rankOf(page, needle, terms)
      return rank === null ? null : { page, rank }
    })
    .filter((r): r is Ranked<T> => r !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.page.title.length - b.page.title.length ||
        a.page.title.localeCompare(b.page.title, 'ko')
    )
    .slice(0, PALETTE_LIMIT)
    .map((r) => r.page)
}
