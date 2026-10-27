// 페이지 이동 기록 — 브라우저처럼 커서가 가운데 있고, 새 이동은 커서 뒤를 버린다.
// 페이지를 여는 것과 메뉴로 뷰를 바꾸는 것을 모두 쌓는다 — 검색·그래프에서 뒤로 눌렀을 때
// 와 본 적 없는 페이지가 뜨면 그것은 되돌아가기가 아니다.
// 이동하는 순간의 뷰를 출발점으로 적어 두므로 뒤로 가면 거기로 돌아간다.
import type { ViewId } from './views'

export type HistoryEntry = {
  view: ViewId
  page: string | null
  /** md 가 아닌 파일의 미리보기 — 돌아갈 때 그 자리가 리더인지 미리보기인지 같이 살린다 */
  source: string | null
  docMode: 'page' | 'source'
  scrollTop: number
}
export type History = { entries: HistoryEntry[]; cursor: number }

export const HISTORY_LIMIT = 50
export const EMPTY_HISTORY: History = { entries: [], cursor: -1 }

/** from = 지금 자리(실제 뷰·스크롤로 덮어쓴다), to = 새 자리 */
export const pushEntry = (history: History, from: HistoryEntry, to: HistoryEntry): History => {
  const kept = history.entries.slice(0, Math.max(history.cursor, 0))
  const entries = [...kept, from, to].slice(-HISTORY_LIMIT)
  return { entries, cursor: entries.length - 1 }
}

/**
 * 한 칸 뒤·앞으로. current 는 지금 자리 스냅숏(스크롤)으로 커서 칸을 덮는다.
 * exists 가 거짓인 칸(지워진 페이지)은 기록에서 빼고 건너뛴다. 갈 곳이 없으면 null.
 */
export const stepHistory = (
  history: History,
  delta: -1 | 1,
  current: HistoryEntry,
  exists: (entry: HistoryEntry) => boolean
): { history: History; entry: HistoryEntry } | null => {
  if (history.cursor < 0) return null
  const entries = [...history.entries]
  entries[history.cursor] = current
  let cursor = history.cursor + delta
  while (cursor >= 0 && cursor < entries.length) {
    if (exists(entries[cursor])) return { history: { entries, cursor }, entry: entries[cursor] }
    entries.splice(cursor, 1)
    // 뒤로 가는 중이면 앞 칸이 한 칸 당겨졌을 뿐이라 한 칸 더 간다. 앞으로면 같은 자리에 다음 칸이 온다
    if (delta === -1) cursor -= 1
  }
  return null
}

export const RECENT_LIMIT = 20

/**
 * Cmd+K 빈 입력에 보일 최근 연 페이지 — 새것부터, 중복 없이.
 * 기록과 따로 둔다: 뒤로 간 뒤 새로 이동하면 기록의 앞쪽은 잘리지만, 열어 본 사실은 남아야 한다.
 */
export const touchRecent = (recent: string[], page: string): string[] =>
  [page, ...recent.filter((p) => p !== page)].slice(0, RECENT_LIMIT)
