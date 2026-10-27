// 탭 띠에 보이는 탭 — 채팅·위키 초안은 늘, 참고한 페이지·기록은 열었을 때만.
import { describe, expect, it } from 'vitest'
import { visibleChatTabs } from './chat-tabs'

const ids = (
  chatTab: Parameters<typeof visibleChatTabs>[0]['chatTab'],
  hasPeek = false
): string[] => visibleChatTabs({ chatTab, hasPeek }).map((tab) => tab.id)

describe('visibleChatTabs', () => {
  it('연 것이 없으면 채팅·위키 초안만 보인다', () => {
    expect(ids('chat')).toEqual(['chat', 'ingest'])
    expect(ids('ingest')).toEqual(['chat', 'ingest'])
  })

  it('참고한 페이지는 근거가 열려 있는 동안 다른 탭에 가 있어도 남는다', () => {
    expect(ids('peek', true)).toEqual(['chat', 'peek', 'ingest'])
    expect(ids('chat', true)).toEqual(['chat', 'peek', 'ingest'])
  })

  it('기록은 보고 있는 동안만 보인다', () => {
    expect(ids('history')).toEqual(['chat', 'ingest', 'history'])
    expect(ids('history', true)).toEqual(['chat', 'peek', 'ingest', 'history'])
  })

  it('근거가 비워졌는데 활성 탭이 참고한 페이지로 남아도 그 탭은 띠에 있다', () => {
    expect(ids('peek')).toEqual(['chat', 'peek', 'ingest'])
  })
})
