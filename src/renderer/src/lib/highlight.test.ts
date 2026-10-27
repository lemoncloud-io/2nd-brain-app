import { describe, expect, it } from 'vitest'
import { pickHighlight } from './highlight'

describe('pickHighlight', () => {
  it('전체 일치가 있으면 그대로 — 기존 동작 유지', () => {
    expect(pickHighlight('회의록 정리', '회의')).toBe('회의')
    expect(pickHighlight('a 회의 예산 b', '회의 예산')).toBe('회의 예산')
    expect(pickHighlight('llm 이야기', 'LLM')).toBe('llm')
  })

  it('빈 질의·일치 없음은 null', () => {
    expect(pickHighlight('본문', '')).toBeNull()
    expect(pickHighlight('본문', '   ')).toBeNull()
    expect(pickHighlight('본문', '없다')).toBeNull()
    expect(pickHighlight('본문', '#')).toBeNull()
  })

  it('태그 두르기는 # 을 뗀 낱말로 붙는다', () => {
    expect(pickHighlight('회의 계획', '#회의')).toBe('회의')
    expect(pickHighlight('예산 계획', '#회의')).toBeNull()
    expect(pickHighlight('회의 계획', '##회의')).toBe('회의')
    expect(pickHighlight('a # b', '##')).toBeNull()
  })

  it('여러 낱말은 긴 것부터 — 스니펫 중심과 같은 규칙', () => {
    expect(pickHighlight('회의가 있고 예산도 있음', '회의 예산')).toBe('회의')
    expect(pickHighlight('예산이 늘었다', '회의 예산')).toBe('예산')
    expect(pickHighlight('회의 예산 계획', '#회의 예산')).toBe('회의')
  })
})
