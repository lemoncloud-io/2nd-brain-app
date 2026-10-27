import { describe, expect, it } from 'vitest'
import { formatElapsed } from './elapsed'

describe('formatElapsed', () => {
  it('60초 미만은 초로', () => {
    expect(formatElapsed(0)).toBe('0초')
    expect(formatElapsed(59)).toBe('59초')
  })

  it('60초부터 분·초로', () => {
    expect(formatElapsed(60)).toBe('1분 0초')
    expect(formatElapsed(125)).toBe('2분 5초')
  })
})
