// 셸의 폭 계약 — 사이드바 + 문서(최소 420) + 채팅 칸이 창 안에 들어간다.
// 좁아지는 순서는 정해져 있다: 채팅이 최소 폭(344)까지 먼저 줄고, 그다음 사이드바가 접힌다.
import { describe, expect, it } from 'vitest'
import {
  CHAT_MIN_WIDTH,
  MAIN_MIN_WIDTH,
  SIDEBAR_MIN_WIDTH,
  chatFloats,
  chatMaxFor,
  fitsSidebar,
  floatingChatWidth,
  mainMinFor,
  sidebarMaxFor
} from './shell-fit'

// 앱이 허용하는 가장 좁은 창
const MIN_WINDOW = 1040

describe('가장 좁은 창', () => {
  it('셋이 다 들어가고 문서가 420 아래로 눌리지 않는다', () => {
    const sidebar = sidebarMaxFor(MIN_WINDOW, true)
    const chat = chatMaxFor(MIN_WINDOW, sidebar)
    expect(sidebar).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH)
    expect(chat).toBeGreaterThanOrEqual(CHAT_MIN_WIDTH)
    expect(MIN_WINDOW - sidebar - chat).toBeGreaterThanOrEqual(MAIN_MIN_WIDTH)
  })

  it('사이드바 상한은 채팅의 최소 폭을 미리 비켜 준다', () => {
    expect(sidebarMaxFor(MIN_WINDOW, true)).toBe(MIN_WINDOW - MAIN_MIN_WIDTH - CHAT_MIN_WIDTH)
  })

  it('채팅을 닫으면 사이드바가 그 자리를 쓴다 — 단 제 상한까지만', () => {
    expect(sidebarMaxFor(MIN_WINDOW, false)).toBeGreaterThan(sidebarMaxFor(MIN_WINDOW, true))
    expect(sidebarMaxFor(4000, false)).toBe(320)
  })
})

describe('더 좁아질 때', () => {
  it('채팅이 먼저 최소 폭까지 줄고 사이드바는 아직 남는다', () => {
    const width = MAIN_MIN_WIDTH + CHAT_MIN_WIDTH + SIDEBAR_MIN_WIDTH
    expect(fitsSidebar(width, true)).toBe(true)
    expect(chatMaxFor(width, SIDEBAR_MIN_WIDTH)).toBe(CHAT_MIN_WIDTH)
  })

  // 창 크기로는 못 닿는 폭이다(앱 최소 창이 1040) — 기본 메뉴의 확대(Cmd+=)가
  // CSS px 를 줄일 때의 경계다. 지우지 마라
  it('그 아래로는 사이드바가 접힌다 — 문서를 420 아래로 누르지 않는다', () => {
    const width = MAIN_MIN_WIDTH + CHAT_MIN_WIDTH + SIDEBAR_MIN_WIDTH - 1
    expect(fitsSidebar(width, true)).toBe(false)
  })

  it('채팅이 닫혀 있으면 그만큼 늦게 접힌다', () => {
    const width = MAIN_MIN_WIDTH + SIDEBAR_MIN_WIDTH
    expect(fitsSidebar(width, false)).toBe(true)
    expect(fitsSidebar(width - 1, false)).toBe(false)
  })
})

describe('채팅 칸 상한', () => {
  it('넓은 창에서도 창의 절반을 넘지 않는다', () => {
    expect(chatMaxFor(2000, 240)).toBe(1000)
  })

  it('사이드바가 실제로 쓰는 폭을 빼고 남은 자리까지다', () => {
    expect(chatMaxFor(1100, 300)).toBe(1100 - 300 - MAIN_MIN_WIDTH)
  })
})

describe('아주 좁은 창(화면 확대)', () => {
  it('문서 최소와 채팅 최소가 나란히 안 들어가면 채팅 칸은 문서 위에 뜬다', () => {
    const width = MAIN_MIN_WIDTH + CHAT_MIN_WIDTH
    expect(chatFloats(width)).toBe(false)
    expect(chatFloats(width - 1)).toBe(true)
  })

  it('문서 최소 폭은 창보다 넓지 않다 — 가로 스크롤이 생기지 않는다', () => {
    expect(mainMinFor(1040)).toBe(MAIN_MIN_WIDTH)
    expect(mainMinFor(320)).toBe(320)
  })

  it('뜬 채팅 칸은 창보다 넓지 않다', () => {
    expect(floatingChatWidth(400, 320)).toBe(320)
    expect(floatingChatWidth(360, 640)).toBe(360)
  })
})
