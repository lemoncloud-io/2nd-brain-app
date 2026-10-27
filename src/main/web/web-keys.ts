// 웹 view 에 초점이 있으면 키가 앱 창 렌더러로 가지 않는다 — 앱 단축키는 main 이 웹 view 의 before-input-event 에서
// 가로채 렌더러로 넘긴다. 어떤 키를 넘길지만 여기서 정한다: 명령 표(renderer lib/commands.ts)의 Mod 키와
// 웹 탭 몫(⌘L 주소칸·⌘R 다시 불러오기·⌘W 탭 닫기). 복사·붙여넣기·전체 선택은 페이지 몫이라 넘기지 않는다.
import type { CloseTabKeyInput } from '../window/close-tab-key'

const PLAIN = new Set([
  'KeyK',
  'KeyP',
  'KeyT',
  'KeyJ',
  'KeyN',
  'KeyW',
  'KeyL',
  'KeyR',
  'Backslash',
  'BracketLeft',
  'BracketRight',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9'
])

/** Alt 를 더한 탭 명령 — 새 탭·탭 닫기·왼쪽·오른쪽 탭 */
const WITH_ALT = new Set(['KeyT', 'KeyW', 'BracketLeft', 'BracketRight'])

/** 페이지 안에서 끝나는 키 — 초점을 앱으로 옮기지 않는다(뒤로·앞으로·다시 불러오기 뒤에도 페이지를 계속 본다) */
const STAYS_IN_PAGE = new Set(['BracketLeft', 'BracketRight', 'KeyR'])

export type WebKey = { code: string; alt: boolean; focusApp: boolean }

/** 웹 view 에서 눌린 키가 앱 단축키면 그 키 — macOS 는 ⌘, 그 밖은 Ctrl. Shift 조합은 페이지 몫이다 */
export const webKeyOf = (input: CloseTabKeyInput, platform: NodeJS.Platform): WebKey | null => {
  if (input.type !== 'keyDown' || input.isAutoRepeat || input.shift) return null
  const mod = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
  if (!mod) return null
  if (!(input.alt ? WITH_ALT : PLAIN).has(input.code)) return null
  return {
    code: input.code,
    alt: input.alt,
    focusApp: input.alt || !STAYS_IN_PAGE.has(input.code)
  }
}
