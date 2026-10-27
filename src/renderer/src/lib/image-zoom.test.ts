import { describe, expect, it } from 'vitest'
import { stepZoom, zoomKey } from './image-zoom'

describe('stepZoom', () => {
  it('단계 위의 배율이면 다음·이전 단계로', () => {
    expect(stepZoom(100, 1)).toBe(125)
    expect(stepZoom(100, -1)).toBe(75)
  })

  it('맞춤으로 그려진 사이 배율에서는 가장 가까운 바깥 단계로', () => {
    expect(stepZoom(37.4, 1)).toBe(50)
    expect(stepZoom(37.4, -1)).toBe(25)
  })

  it('양 끝에서는 그대로', () => {
    expect(stepZoom(400, 1)).toBe(400)
    expect(stepZoom(25, -1)).toBe(25)
    expect(stepZoom(10, -1)).toBe(25)
  })
})

describe('zoomKey', () => {
  it.each([
    ['Equal', 'in'],
    ['NumpadAdd', 'in'],
    ['Minus', 'out'],
    ['Digit0', 'fit'],
    ['KeyK', null]
  ])('%s → %s', (code, action) => {
    expect(zoomKey(code)).toBe(action)
  })
})
