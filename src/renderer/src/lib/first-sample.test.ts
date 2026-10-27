import { describe, expect, it } from 'vitest'
import { SAMPLE_ANSWER, SAMPLE_QUESTION } from './first-sample'

describe('first-sample', () => {
  it('예시 자료는 위키화할 수 있는 글이다 — 제목·할 일·절이 있다', () => {
    expect(SAMPLE_QUESTION.trim()).not.toBe('')
    expect(SAMPLE_ANSWER).toContain('# ')
    expect(SAMPLE_ANSWER).toContain('- [ ]')
    expect(SAMPLE_ANSWER).toContain('## ')
  })
})
