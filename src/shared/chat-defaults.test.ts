// 채팅 기본값 — 설정에 저장되는 질문 기본값. main(저장)과 renderer(설정 화면)가 같은 정규화를 쓴다.
import { describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_DEFAULTS, normalizeChatDefaults, updateChatDefaults } from './chat-defaults'

describe('normalizeChatDefaults', () => {
  it('없으면 물어보기가 기본이다', () => {
    expect(normalizeChatDefaults(undefined)).toEqual(DEFAULT_CHAT_DEFAULTS)
    expect(DEFAULT_CHAT_DEFAULTS).toEqual({ permissionMode: 'ask', userSettings: true })
  })

  it('비정상 모드는 물어보기로 거른다', () => {
    expect(normalizeChatDefaults({ permissionMode: 'xxx' })).toEqual(DEFAULT_CHAT_DEFAULTS)
  })

  // 예전 설정 파일에는 위키 빼고 묻기·보고 있는 문서 붙이기 값이 남아 있다 — 읽지 않는다
  it('고른 모드는 그대로 두고 예전 키는 버린다', () => {
    expect(
      normalizeChatDefaults({ permissionMode: 'all', sourceOnly: true, attachOpen: true })
    ).toEqual({ permissionMode: 'all', userSettings: true })
  })

  it('내 Claude 설정은 끈 것만 끈다 — boolean 이 아니면 켬', () => {
    expect(normalizeChatDefaults({ userSettings: false }).userSettings).toBe(false)
    expect(normalizeChatDefaults({ userSettings: 'no' }).userSettings).toBe(true)
  })
})

describe('updateChatDefaults', () => {
  it('보낸 값만 바꾸고 나머지는 저장된 값을 지킨다', () => {
    const saved = { permissionMode: 'all', userSettings: false }
    expect(updateChatDefaults(saved, { permissionMode: 'edits' })).toEqual({
      permissionMode: 'edits',
      userSettings: false
    })
    expect(updateChatDefaults(saved, { userSettings: true })).toEqual({
      permissionMode: 'all',
      userSettings: true
    })
  })
})
