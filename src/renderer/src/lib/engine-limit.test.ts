import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearEngineLimit,
  engineLimit,
  noteEngineFailure,
  subscribeEngineLimit
} from './engine-limit'

afterEach(() => {
  clearEngineLimit()
  vi.useRealTimers()
})

describe('한도를 앱이 기억한다', () => {
  it('한도 실패에서 해제 시각을 읽어 둔다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1758067200 * 1000 - 60_000)
    noteEngineFailure('Claude AI usage limit reached|1758067200')
    expect(engineLimit()).toEqual({ at: 1758067200 * 1000 })
  })

  // 지어낸 시각을 "N시쯤" 이라고 단정하면 그것도 거짓말이다 — 모르면 모른다고 들고 있는다
  it('해제 시각이 없으면 시각 없이 기억한다', () => {
    noteEngineFailure('usage limit reached')
    expect(engineLimit()).toEqual({ at: null })
  })

  it('시각을 아는 기억을 모르는 기억으로 덮지 않는다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1758067200 * 1000 - 60_000)
    noteEngineFailure('Claude AI usage limit reached|1758067200')
    noteEngineFailure('usage limit reached')
    expect(engineLimit()).toEqual({ at: 1758067200 * 1000 })
  })

  it('한도가 아닌 실패는 아무것도 기억하지 않는다', () => {
    noteEngineFailure('ENOENT: no such file or directory')
    noteEngineFailure('overloaded_error')
    expect(engineLimit()).toBeNull()
  })

  it('해제 시각이 지나면 스스로 잊고, 보고 있는 화면에 알린다', () => {
    vi.useFakeTimers()
    const seen = vi.fn()
    const stop = subscribeEngineLimit(seen)
    vi.setSystemTime(new Date('2026-09-16T00:00:00Z'))
    noteEngineFailure('Claude AI usage limit reached|1758067200')
    expect(engineLimit()).not.toBeNull()
    vi.advanceTimersByTime(3 * 60 * 60_000)
    expect(engineLimit()).toBeNull()
    // 읽는 함수가 몰래 지우는 것이 아니라, 잊을 때 알린다
    expect(seen).toHaveBeenCalledTimes(2)
    stop()
  })

  it('기억이 바뀌면 보고 있는 화면에 알린다', () => {
    const seen = vi.fn()
    const stop = subscribeEngineLimit(seen)
    noteEngineFailure('429 Too Many Requests')
    expect(seen).toHaveBeenCalledTimes(1)
    clearEngineLimit()
    expect(seen).toHaveBeenCalledTimes(2)
    stop()
    noteEngineFailure('429 Too Many Requests')
    expect(seen).toHaveBeenCalledTimes(2)
  })
})
