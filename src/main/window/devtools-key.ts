// 개발자 도구 단축키 — 배포본은 watchWindowShortcuts 가 막는다. 개발자 모드일 때만 main 이 직접 연다.
import type { CloseTabKeyInput } from './close-tab-key'

/** 개발자 모드일 때만 단축키를 main 이 받는다 — 꺼져 있으면 배포본은 그대로 막힌다 */
export const shouldToggleDevTools = (
  developerMode: boolean,
  input: CloseTabKeyInput,
  platform: NodeJS.Platform
): boolean => developerMode && isDevToolsKey(input, platform)

/** macOS 는 ⌥⌘I, 그 밖은 Ctrl+Shift+I — Chromium 기본 단축키와 같다 */
export const isDevToolsKey = (input: CloseTabKeyInput, platform: NodeJS.Platform): boolean => {
  if (input.type !== 'keyDown' || input.isAutoRepeat || input.code !== 'KeyI') return false
  return platform === 'darwin'
    ? input.meta && input.alt && !input.control && !input.shift
    : input.control && input.shift && !input.meta && !input.alt
}
