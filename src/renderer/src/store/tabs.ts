// 탭 — 중앙 자리를 여러 개 띄운다. 탭 하나가 자기 자리와 자기 뒤로·앞으로 기록을 들고 있다.
// Obsidian 과 같은 모양이다: 같은 파일을 두 탭에 띄우고, 한쪽에서 링크를 따라가도 다른 쪽은 그대로다.
import { EMPTY_HISTORY, type History, type HistoryEntry } from './history'
import { viewLabel, type ViewId } from './views'
import { folderName } from '../lib/vault-path'
import { getT } from '../lib/i18n'

/** 탭이 보고 있는 자리 — 기록의 한 칸과 같은 모양이다 */
export type TabPlace = HistoryEntry

/**
 * 웹 탭이 보고 있는 페이지 — 기록 칸이 아니라 탭에 붙는다. 웹 안의 뒤로·앞으로는 페이지 자체 기록이고,
 * 같은 탭에서 문서로 갔다가 ← 로 돌아오면 이 페이지가 다시 보인다. url 이 null 이면 주소를 아직 안 넣었다
 */
export type WebPlace = { url: string | null; title: string }

export type Tab = TabPlace & {
  /** 탭을 고르고 닫는 이름표 — 자리가 바뀌어도 그대로다(같은 파일 두 탭을 구분한다) */
  id: string
  history: History
  web: WebPlace | null
}

let nextTabId = 0
export const newTabId = (): string => `tab-${++nextTabId}`

export const EMPTY_PLACE: TabPlace = {
  view: 'doc',
  page: null,
  source: null,
  docMode: 'page',
  scrollTop: 0
}

export const emptyTab = (place: TabPlace = EMPTY_PLACE): Tab => ({
  ...place,
  id: newTabId(),
  history: EMPTY_HISTORY,
  web: null
})

/** 탭이 보고 있는 파일 — 뷰거나 빈 탭이면 없다 */
const docRel = (place: TabPlace): string | null => {
  if (place.view !== 'doc') return null
  return (place.docMode === 'source' ? place.source : place.page) || null
}

/** 웹 탭 이름 — 페이지 제목, 없으면 호스트, 주소를 넣기 전이면 "새 웹 페이지" */
const webLabel = (web: WebPlace | null | undefined): string => {
  if (web?.title) return web.title
  if (!web?.url) return getT().web.newTab
  try {
    return new URL(web.url).host || web.url
  } catch {
    return web.url
  }
}

/** 탭에 적히는 이름 — 파일이면 이름만, 뷰면 메뉴 이름. 빈 탭은 "새 탭" */
export const tabLabel = (place: TabPlace & { web?: WebPlace | null }): string => {
  if (place.view === 'web') return webLabel(place.web)
  if (place.view !== 'doc') return viewLabel(place.view)
  const rel = docRel(place)
  if (rel === null) return getT().shell.newTab
  return rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/i, '')
}

/**
 * 탭 띠에 나란히 적히는 이름들 — 이름이 같은 다른 문서가 같이 떠 있을 때만 바로 위 폴더를 붙인다.
 * 늘 붙이면 좁은 탭이 폴더 이름으로 찬다. 같은 파일을 띄운 두 탭은 가를 것이 없어 그대로 둔다.
 */
export const tabLabels = (places: (TabPlace & { web?: WebPlace | null })[]): string[] => {
  const names = places.map(tabLabel)
  return places.map((place, at) => {
    const rel = docRel(place)
    if (rel === null) return names[at]
    const clash = places.some((other, i) => names[i] === names[at] && docRel(other) !== rel)
    const folder = clash ? folderName(rel) : undefined
    return folder === undefined ? names[at] : `${folder} · ${names[at]}`
  })
}

/** main 에 웹 view 가 있을 수 있는 탭 — 켜진 탭의 웹 자리는 live 필드가 정본이다(탭 칸은 떠날 때 채운다) */
export const webTabIds = (tabs: Tab[], tabAt: number, live: WebPlace | null): string[] =>
  tabs.filter((tab, at) => (at === tabAt ? live : tab.web) !== null).map((tab) => tab.id)

/** 탭을 닫은 뒤 어느 탭이 켜지나 — 오른쪽 것, 없으면 왼쪽 것. Obsidian 과 같다 */
export const afterClose = (tabs: Tab[], closing: number, active: number): number => {
  if (closing > active) return active
  if (closing < active) return active - 1
  return Math.min(closing, tabs.length - 2)
}

/** 이름이 바뀐 파일을 가리키던 탭을 새 자리로 — 지웠으면(`to === null`) 빈 탭이 된다 */
export const relocateTab = (tab: Tab, moved: (rel: string | null) => string | null): Tab => ({
  ...tab,
  page: moved(tab.page),
  source: moved(tab.source)
})

export type { ViewId }
