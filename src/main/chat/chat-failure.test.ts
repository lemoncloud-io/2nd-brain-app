import { describe, expect, it, vi } from 'vitest'
import { chatFailed } from './chat-failure'

const GUIDANCE = 'AI를 실행하지 못했어요. 설정에서 AI 연결 상태를 확인한 뒤 다시 눌러 주세요'

describe('chatFailed', () => {
  it('가리지 못한 실패는 연결 확인 문장 그대로다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(chatFailed('askChat 실패', new Error('뭔가 터졌다'))).toEqual({ error: GUIDANCE })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('한도 실패는 한도 문장으로 가린다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = chatFailed(
        'askChat 실패',
        new Error('Claude AI usage limit reached|9999999999')
      )
      expect(result.error).toContain('한도')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('Error 가 아닌 throw 도 문자열로 받아 오류로 돌려준다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(chatFailed('compactChat 실패', '문자열 실패')).toEqual({ error: GUIDANCE })
    } finally {
      vi.restoreAllMocks()
    }
  })
})
