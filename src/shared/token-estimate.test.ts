import { describe, expect, it } from 'vitest'
import { estimateTokens } from './token-estimate'

describe('estimateTokens — test: token-estimate.ts', () => {
  it('ASCII 는 3자당 1토큰으로 센다 — 산문의 4자보다 무겁게, 마크다운·코드 기준', () => {
    // 30자 → 10
    expect(estimateTokens('a'.repeat(30))).toBe(10)
  })

  it('한글은 1.5자당 1토큰으로 센다 — ASCII 보다 무겁다', () => {
    // 30자 → 20
    expect(estimateTokens('가'.repeat(30))).toBe(20)
    // 같은 글자 수라도 한글이 ASCII 보다 토큰을 더 먹는다
    expect(estimateTokens('가'.repeat(30))).toBeGreaterThan(estimateTokens('a'.repeat(30)))
  })

  it('섞인 글은 두 몫을 더한다', () => {
    // ASCII 30자(10) + 한글 30자(20) = 30
    expect(estimateTokens('a'.repeat(30) + '가'.repeat(30))).toBe(30)
  })

  it('예산은 상한이므로 올림한다 — 1자도 0토큰이 아니다', () => {
    expect(estimateTokens('a')).toBe(1)
    expect(estimateTokens('가')).toBe(1)
  })

  it('빈 글은 0', () => {
    expect(estimateTokens('')).toBe(0)
  })
})
