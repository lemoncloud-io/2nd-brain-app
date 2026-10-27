import { describe, expect, it } from 'vitest'
import { createQuitGuard, dockBadge } from './quit-guard'

describe('createQuitGuard', () => {
  it('macOS 는 창을 닫으면 숨긴다 — 종료(⌘Q·업데이트)가 시작되면 닫는다', () => {
    const guard = createQuitGuard('darwin')
    expect(guard.hidesOnClose()).toBe(true)
    guard.quitStarted()
    expect(guard.hidesOnClose()).toBe(false)
  })

  it('Windows 는 닫으면 그대로 닫는다(앱이 끝난다)', () => {
    expect(createQuitGuard('win32').hidesOnClose()).toBe(false)
  })

  it('설치가 실패해 종료가 멈추면 다시 숨긴다', () => {
    const guard = createQuitGuard('darwin')
    guard.quitStarted()
    guard.quitCanceled()
    expect(guard.hidesOnClose()).toBe(true)
    expect(guard.resumesQuit()).toBeNull()
  })

  it('저장 안 한 글이 종료를 막으면, 버리기를 고른 뒤 한 번만 종료를 잇는다', () => {
    const guard = createQuitGuard('darwin')
    guard.quitStarted()
    guard.quitBlocked()
    // 막힌 동안 창을 닫으면 다시 숨긴다 — 종료는 취소됐다
    expect(guard.hidesOnClose()).toBe(true)
    expect(guard.resumesQuit()).toBe('user')
    expect(guard.resumesQuit()).toBeNull()
  })

  it('막힌 종료에서 계속 편집을 고른 뒤 다시 시작한 종료는 그 표시를 잇지 않는다', () => {
    const guard = createQuitGuard('darwin')
    guard.quitStarted()
    guard.quitBlocked()
    // 계속 편집 — resumesQuit 이 불리지 않는다. 다음 종료는 업데이트 설치였고 실패했다
    guard.quitStarted()
    guard.quitCanceled()
    expect(guard.resumesQuit()).toBeNull()
  })

  it('막힌 적 없으면 버리기 뒤의 닫기는 종료가 아니다', () => {
    expect(createQuitGuard('darwin').resumesQuit()).toBeNull()
  })

  it('업데이트 설치가 막히면 막힌 것이 설치라고 알리고, 버리기 뒤에는 설치를 잇게 한다', () => {
    const guard = createQuitGuard('darwin')
    guard.quitStarted('update')
    // 설치 종료의 before-quit 이 뒤늦게 와도 이유는 설치다
    guard.quitStarted()
    expect(guard.quitBlocked()).toBe('update')
    guard.quitStarted()
    guard.quitStarted('update')
    expect(guard.quitBlocked()).toBe('update')
    expect(guard.resumesQuit()).toBe('update')
  })
})

describe('dockBadge', () => {
  it('받을 팀 변경 수 — 없으면 빈 글자(배지를 지운다)', () => {
    expect(dockBadge(3)).toBe('3')
    expect(dockBadge(0)).toBe('')
  })
})
