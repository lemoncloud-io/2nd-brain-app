// 웹 탭 — 문서 자리 탭에 띄우는 웹 페이지. 페이지는 main 이 창·탭별로 가진 WebContentsView 이고,
// 렌더러는 자리(사각형)·주소·명령만 보낸다. 탭 id 는 렌더러 탭의 id 다(`store/tabs.ts`).
import type { AddResult } from './clip-ingest'

export const APP_CHANNELS_WEB = {
  webEnsure: 'web:ensure',
  webNavigate: 'web:navigate',
  webSetBounds: 'web:set-bounds',
  webClose: 'web:close',
  webBack: 'web:back',
  webForward: 'web:forward',
  webReload: 'web:reload',
  webStop: 'web:stop',
  webClip: 'web:clip',
  webCapture: 'web:capture',
  webState: 'web:state',
  webOpenRequest: 'web:open-request',
  webShortcut: 'web:shortcut'
} as const

/** 렌더러 CSS px 기준 사각형 — main 이 창의 확대 배율을 곱한다 */
export interface WebRect {
  x: number
  y: number
  width: number
  height: number
}

/** 페이지를 열지 못한 까닭 — 화면 문구는 렌더러 `lib/web-text.ts` 가 고른다 */
export type WebError = { kind: 'load'; code: number; description: string } | { kind: 'crashed' }

/** main 이 알리는 웹 탭 하나의 지금 상태 */
export interface WebState {
  tabId: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: WebError | null
}

/** 웹 view 에 초점이 있을 때 눌린 앱 단축키 — Mod(+Alt)+code. Mod 는 main 이 이미 확인했다 */
export interface WebShortcut {
  tabId: string
  code: string
  alt: boolean
}

export interface AppApiWeb {
  /** 그 탭의 웹 view 가 없으면 만들어 주소를 연다 — 이미 있으면 그대로 둔다 */
  webEnsure(tabId: string, url: string): Promise<void>
  /** 그 탭의 웹 view 를 그 주소로 옮긴다(없으면 만든다). http(s) 가 아니면 거절해 false */
  webNavigate(tabId: string, url: string): Promise<boolean>
  /** 그 탭의 view 를 사각형에 띄운다(같은 창의 다른 웹 view 는 숨는다). null 이면 숨긴다 */
  webSetBounds(tabId: string, rect: WebRect | null): Promise<void>
  /** 탭을 닫았다 — view 를 파기한다. 없는 탭이면 아무 일도 없다 */
  webClose(tabId: string): Promise<void>
  /** 웹 view 자체 기록의 뒤로·앞으로 — 탭 기록(←·→)과 따로다 */
  webBack(tabId: string): Promise<void>
  webForward(tabId: string): Promise<void>
  /** 다시 불러오기 — 멈춘(프로세스가 죽은) 페이지도 이걸로 되살린다 */
  webReload(tabId: string): Promise<void>
  webStop(tabId: string): Promise<void>
  /** 지금 그려진 페이지를 자료(Clippings)로 담는다 — 서버에서 다시 받지 않아 로그인 뒤 페이지도 담긴다 */
  webClip(tabId: string): Promise<AddResult>
  /** 지금 보이는 페이지 모습(JPEG data URL) — 앱 창이 페이지를 덮는 동안 view 대신 깐다. 못 찍으면 null */
  webCapture(tabId: string): Promise<string | null>
  onWebState(listener: (state: WebState) => void): () => void
  /** 페이지가 새 창을 열려 했다 — 창 대신 그 주소의 새 웹 탭을 연다 */
  onWebOpenRequest(listener: (url: string) => void): () => void
  onWebShortcut(listener: (key: WebShortcut) => void): () => void
}
