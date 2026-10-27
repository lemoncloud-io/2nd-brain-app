import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markStartDone, startDone } from './start-done'

// 유닛 테스트는 node 환경이라 localStorage 가 없다 — 렌더러가 보는 것과 같은 모양을 끼운다
const memoryStorage = (): Storage => {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value)
  }
}

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
afterEach(() => vi.unstubAllGlobals())

describe('startDone', () => {
  it('기록하기 전에는 false, 기록한 뒤에는 true', () => {
    expect(startDone()).toBe(false)
    markStartDone()
    expect(startDone()).toBe(true)
  })

  it('두 번 기록해도 같다', () => {
    markStartDone()
    markStartDone()
    expect(startDone()).toBe(true)
  })

  // 시크릿 창·정책으로 저장소가 막히면 접근 자체가 던진다 — 앱이 안 뜨면 안 된다
  it('저장소가 던져도 앱을 막지 않는다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      }
    })
    expect(() => markStartDone()).not.toThrow()
    expect(startDone()).toBe(false)
  })

  it('localStorage 자체가 없어도 던지지 않는다', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => markStartDone()).not.toThrow()
    expect(startDone()).toBe(false)
  })
})
