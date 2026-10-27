// @vitest-environment jsdom
// 채팅 스레드의 승인 흐름 — 스트리밍 답 아래에 카드와 진행 줄이 뜨고, 입력칸에서 권한 모드를 고른다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChatContext } from './chat-context'
import { ChatThread } from './chat-thread'
import { useWorkbench } from '../../store/workbench'
import type { ChatSession } from './use-chat-session'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const session = (over: Partial<ChatSession> = {}): ChatSession =>
  ({
    conversations: [],
    activeId: 'c1',
    activeTitle: undefined,
    messages: [
      { role: 'user', text: '셸로 date 실행해 줘', refs: [] },
      { role: 'assistant', text: '', refs: [], streaming: true }
    ],
    runningIds: new Set<string>(['c1']),
    running: true,
    error: null,
    notice: null,
    dismissNotice: vi.fn(),
    notify: vi.fn(),
    tooLong: false,
    usage: null,
    compact: vi.fn(),
    compacting: false,
    retry: null,
    regenerate: null,
    draft: '',
    setDraft: vi.fn(),
    mentions: [],
    images: [],
    addImages: vi.fn(),
    removeImage: vi.fn(),
    setMentions: vi.fn(),
    permissionMode: 'ask',
    setPermissionMode: vi.fn(),
    pendingPermission: null,
    answerPermission: vi.fn(),
    activity: null,
    saveNote: null,
    openConversation: vi.fn(),
    newConversation: vi.fn(),
    ask: vi.fn(),
    stop: vi.fn(),
    saveAnswer: vi.fn(),
    undoChange: vi.fn(),
    undoing: null,
    undoError: null,
    applyChanges: vi.fn(),
    renameConversation: vi.fn(),
    removeConversation: vi.fn(),
    ...over
  }) as ChatSession

const mount = (chat: ChatSession): void => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<ChatContext.Provider value={chat}>{<ChatThread />}</ChatContext.Provider>))
}

const button = (testId: string): HTMLButtonElement | null =>
  document.querySelector(`[data-testid="${testId}"]`)

beforeAllSetup()

function beforeAllSetup(): void {
  // jsdom 에는 scrollTo 가 없다 — 스레드의 따라내리기 효과가 여기서 터진다
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- 스크롤은 이 테스트의 관심이 아니다
  Element.prototype.scrollTo = function (): void {} as Element['scrollTo']
}

beforeEach(() => {
  // 입력칸이 열리자마자 스킬 목록을 미리 묻는다 — 이 테스트들의 관심은 아니라 빈 목록
  window.api = {
    listChatSkills: vi.fn(async () => [])
  } as unknown as typeof window.api
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('ChatThread — 승인 카드와 진행 줄', () => {
  it('승인 요청이 오면 스트리밍 답 아래에 카드가 뜬다', () => {
    mount(session({ pendingPermission: { id: 'req-1', tool: 'Bash', target: 'date' } }))
    expect(button('chat-permission-card')).not.toBeNull()
    expect(button('chat-permission-allow')).not.toBeNull()
    expect(button('chat-permission-session')).not.toBeNull()
    expect(button('chat-permission-deny')).not.toBeNull()
  })

  it('승인 단추를 누르면 그 답이 main 으로 간다', () => {
    const answerPermission = vi.fn()
    mount(
      session({
        answerPermission,
        pendingPermission: { id: 'req-1', tool: 'Bash', target: 'date' }
      })
    )
    act(() => button('chat-permission-session')?.click())
    expect(answerPermission).toHaveBeenCalledWith('session')
  })

  it('답이 오는 동안 도구 진행 한 줄이 보인다', () => {
    mount(session({ activity: '명령을 실행해요 — date' }))
    expect(document.querySelector('[data-testid="chat-activity"]')?.textContent).toContain(
      '명령을 실행해요'
    )
  })

  it('입력칸에 권한 고르기와 위키 토글이 없다 — 설정으로 간다', () => {
    mount(session({}))
    expect(button('chat-source-only')).toBeNull()
    expect(document.querySelector('[data-testid="chat-permission-mode"]')).toBeNull()
  })

  it('붙는 문서가 없으면 칩줄 자체가 없다 — 있으면 컨텍스트 칩만 보인다', () => {
    useWorkbench.setState({ view: 'start', selectedPage: null, selectedSource: null })
    mount(session({ mentions: [] }))
    expect(document.querySelector('[data-testid="chat-context"]')).toBeNull()
    mount(session({ mentions: ['wiki/a.md'] }))
    expect(document.querySelector('[data-testid="chat-context"]')).not.toBeNull()
    expect(button('chat-mention-chip:wiki/a.md')).not.toBeNull()
  })

  // 보고 있는 문서는 저절로 붙지 않는다 — 누르면 `@` 로 고른 것과 똑같이 붙는다
  it('보고 있는 문서는 @ 단추로 권하고, 누르면 @ 문서로 붙인다', () => {
    useWorkbench.setState({ view: 'doc', docMode: 'page', selectedPage: 'wiki/a.md' })
    const setMentions = vi.fn()
    mount(session({ mentions: ['wiki/b.md'], setMentions }))
    act(() => button('chat-context-open-add')?.click())
    expect(setMentions).toHaveBeenCalledWith(['wiki/b.md', 'wiki/a.md'])
  })

  it('보고 있는 문서를 이미 붙였으면 @ 단추를 다시 권하지 않는다', () => {
    useWorkbench.setState({ view: 'doc', docMode: 'page', selectedPage: 'wiki/a.md' })
    mount(session({ mentions: ['wiki/a.md'] }))
    expect(button('chat-context-open-add')).toBeNull()
  })
})
