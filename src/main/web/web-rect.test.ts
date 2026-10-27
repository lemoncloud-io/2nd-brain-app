import { describe, expect, it } from 'vitest'
import { scaleRect, validRect } from './web-rect'

describe('validRect — 렌더러에서 온 사각형', () => {
  it('유한한 0 이상 수 넷이면 받는다', () => {
    expect(validRect({ x: 0, y: 36, width: 800, height: 600 })).toBe(true)
  })

  it('음수·무한·숫자 아님·빠진 칸은 거절한다', () => {
    expect(validRect({ x: -1, y: 0, width: 1, height: 1 })).toBe(false)
    expect(validRect({ x: 0, y: 0, width: Infinity, height: 1 })).toBe(false)
    expect(validRect({ x: 0, y: 0, width: Number.NaN, height: 1 })).toBe(false)
    expect(validRect({ x: '0', y: 0, width: 1, height: 1 })).toBe(false)
    expect(validRect({ x: 0, y: 0, width: 1 })).toBe(false)
    expect(validRect(null)).toBe(false)
    expect(validRect('rect')).toBe(false)
  })
})

describe('scaleRect — 창 확대 배율', () => {
  it('배율 1 이면 그대로, 1.25 면 곱해 반올림한다', () => {
    const rect = { x: 10, y: 36, width: 801, height: 600 }
    expect(scaleRect(rect, 1)).toEqual(rect)
    expect(scaleRect(rect, 1.25)).toEqual({ x: 13, y: 45, width: 1001, height: 750 })
  })
})
