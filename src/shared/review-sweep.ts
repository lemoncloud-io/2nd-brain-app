// 검토 항목 자동 정리 — 그사이 생긴 페이지의 '빠진 페이지' 항목을 고른다. 규칙만 보고 AI 판정은 없다.
// 모순·오래됨·제안은 사람이 읽어야 끝나는 일이라 건드리지 않는다.
import type { ReviewItem } from './ipc-contract'
import { createLinkResolver, type PageRef } from './wiki/parse'

export type SweepPage = PageRef & { title: string }

/** 제목 비교 — 공백 제거 + 소문자 + NFC. AI 점검이 이미 있는 페이지를 빠졌다고 하지 않게 거르는 것도 이 비교다 */
export const squashTitle = (title: string): string =>
  title.normalize('NFC').replace(/\s+/g, '').toLowerCase()

export const isMissingPageItem = (item: ReviewItem): boolean =>
  item.source === 'ai-lint' && item.kind === 'missing-page'

/**
 * 더 이상 사실이 아닌 '빠진 페이지' 항목의 id — 같은 제목의 페이지가 있거나 그 이름의 링크가 풀린다.
 * AI 점검은 제목만 견주지만 여기는 링크로도 본다: 사람이 [[이름]] 으로 만든 페이지는 제목이 달라도 그 이름이다.
 * `/` 가 든 이름(TCP/IP)은 링크로 풀면 마지막 조각(ip)만 견주게 돼 제목으로만 본다.
 */
export const sweptReviewItemIds = (items: ReviewItem[], pages: SweepPage[]): Set<string> => {
  const missing = items.filter(isMissingPageItem)
  if (missing.length === 0) return new Set()
  const resolve = createLinkResolver(pages)
  const titles = new Set(pages.map((page) => squashTitle(page.title)))
  const exists = (title: string): boolean =>
    titles.has(squashTitle(title)) || (!title.includes('/') && resolve(title).rel !== null)
  return new Set(missing.filter((item) => exists(item.title)).map((item) => item.id))
}
