import { describe, expect, it } from 'vitest'
import { fillDraft, fillNote } from './chat-fill'

describe('fillDraft', () => {
  it('빈 입력칸에는 그 문장을 채운다', () => {
    expect(fillDraft('  ', '정리해줘')).toEqual({ next: '정리해줘', appended: false })
  })

  it('쓰던 글이 있으면 지우지 않고 다음 줄에 덧붙인다', () => {
    expect(fillDraft('쓰던 질문 ', '정리해줘')).toEqual({
      next: '쓰던 질문\n정리해줘',
      appended: true
    })
  })

  it('이미 그 문장이 있으면 그대로 둔다', () => {
    expect(fillDraft('앞\n정리해줘', '정리해줘')).toEqual({ next: '앞\n정리해줘', appended: false })
  })

  it('알림 문장은 덧붙였는지에 따라 다르다', () => {
    expect(fillNote(true)).toContain('덧붙였어요')
    expect(fillNote(false)).toBe('채팅 입력칸에 채웠어요')
  })
})
