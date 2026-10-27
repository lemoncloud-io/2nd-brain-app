import { describe, expect, it } from 'vitest'
import { fitWithin, imageFiles } from './chat-images'

describe('fitWithin — test: chat-images.ts', () => {
  it('긴 변이 1568 을 넘으면 비율을 지켜 줄이고, 아니면 그대로', () => {
    expect(fitWithin(3024, 1964)).toEqual({ width: 1568, height: 1018 })
    expect(fitWithin(1000, 4000)).toEqual({ width: 392, height: 1568 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1568, 10)).toEqual({ width: 1568, height: 10 })
  })
})

describe('imageFiles — test: chat-images.ts', () => {
  it('붙여 넣은 파일 중 그림만 고른다', () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' })
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    expect(imageFiles([png, pdf])).toEqual([png])
    expect(imageFiles([])).toEqual([])
  })
})
