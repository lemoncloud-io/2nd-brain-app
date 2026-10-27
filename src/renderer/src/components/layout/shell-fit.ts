/**
 * 셸의 폭 계약 — 사이드바 · 문서 · 채팅 칸이 창 하나를 나눠 쓴다.
 *
 * 패널마다 자기 상한만 지키면 합이 창을 넘는다: 1040 최소 창에서 320+400+420 이면 이미 100 이 모자라
 * 문서가 제 최소 아래로 눌린다. 그래서 상한은 서로를 빼고 남은 자리로 잰다. 좁아지는 순서도 여기서
 * 정한다 — 채팅이 344 까지 먼저 줄고, 그래도 모자라면 사이드바가 접힌다. 문서는 마지막까지 420 이다.
 * 창 최소는 1040 이지만 화면 확대(⌘+)를 하면 CSS 폭은 그 아래로 내려간다 — 문서와 채팅 최소가 나란히
 * 안 들어가면 채팅 칸은 문서 위에 떠서 덮고, 문서 최소도 창 폭까지 내려간다. 가로 스크롤은 생기지 않는다.
 */
export const MAIN_MIN_WIDTH = 420
export const SIDEBAR_MIN_WIDTH = 180
export const SIDEBAR_MAX_WIDTH = 320
export const SIDEBAR_DEFAULT_WIDTH = 240
/** 채팅 칸 탭 띠가 잘리지 않는 폭 — 탭 다섯일 때 잰 값(띠 313 + 좌우 여백 28)이다. 탭이 넷으로 준 뒤 다시 재지 않았다 */
export const CHAT_MIN_WIDTH = 344
export const CHAT_DEFAULT_WIDTH = 400

/** 사이드바가 가져갈 수 있는 최대 — 문서 최소와 (열려 있다면) 채팅 최소를 비켜 준다 */
export const sidebarMaxFor = (windowWidth: number, chatOpen: boolean): number =>
  Math.min(SIDEBAR_MAX_WIDTH, windowWidth - MAIN_MIN_WIDTH - (chatOpen ? CHAT_MIN_WIDTH : 0))

/** 채팅 칸이 가져갈 수 있는 최대 — 사이드바가 실제로 쓰는 폭을 빼고 남은 자리, 창의 절반까지 */
export const chatMaxFor = (windowWidth: number, sidebarWidth: number): number =>
  Math.min(windowWidth / 2, windowWidth - sidebarWidth - MAIN_MIN_WIDTH)

/** 사이드바가 제 최소 폭으로도 들어가는가 — 아니면 접는다(토글로 다시 펼 수 있다) */
export const fitsSidebar = (windowWidth: number, chatOpen: boolean): boolean =>
  sidebarMaxFor(windowWidth, chatOpen) >= SIDEBAR_MIN_WIDTH

/** 문서 최소와 채팅 최소가 나란히 안 들어가는 창 — 채팅 칸은 자리를 차지하지 않고 문서 위에 뜬다 */
export const chatFloats = (windowWidth: number): boolean =>
  windowWidth < MAIN_MIN_WIDTH + CHAT_MIN_WIDTH

/** 문서 자리의 최소 폭 — 창보다 넓으면 가로 스크롤이 생긴다 */
export const mainMinFor = (windowWidth: number): number => Math.min(MAIN_MIN_WIDTH, windowWidth)

/** 뜬 채팅 칸의 폭 — 고른 폭 그대로, 창보다 넓지 않게 */
export const floatingChatWidth = (chosen: number, windowWidth: number): number =>
  Math.min(chosen, windowWidth)
