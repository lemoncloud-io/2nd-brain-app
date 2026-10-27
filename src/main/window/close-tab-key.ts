// ⌘W(Ctrl+W)는 탭 닫기 — Electron 기본 메뉴의 창 닫기로 새기 전에 main 이 가로챈다.
// Dock·메뉴의 닫기(숨기기)와 ⌘Q 종료는 이 판정 밖에 있어 기존 경로 그대로다.
export type CloseTabKeyInput = {
  type: string
  code: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
  isAutoRepeat: boolean
}

/** main before-input-event 에서 ⌘W를 탭 닫기로 돌릴 조건 — macOS는 ⌘, 그 밖은 Ctrl */
export const isCloseTabKey = (input: CloseTabKeyInput, platform: NodeJS.Platform): boolean => {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return false
  if (input.code !== 'KeyW' || input.alt || input.shift) return false
  return platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
}
