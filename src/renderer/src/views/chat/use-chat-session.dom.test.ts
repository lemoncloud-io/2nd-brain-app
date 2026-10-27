// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type {
  ChangeSet,
  ChatAskContext,
  ChatEvent,
  ChatMessage
} from '../../../../shared/ipc-contract'
import { useWorkbench } from '../../store/workbench'
import { useChatSession, withChanges, type ChatSession, type ViewMessage } from './use-chat-session'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const card: ChangeSet = { id: 'run-1', files: [], blocked: ['막았다'] }

describe('withChanges', () => {
  it('도는 답에 카드를 붙인다', () => {
    const prev: ViewMessage[] = [{ role: 'assistant', text: '답', refs: [], streaming: true }]
    expect(withChanges(prev, card)).toEqual([
      { role: 'assistant', text: '답', refs: [], streaming: true, changes: card }
    ])
  })

  it('같은 id 카드가 있으면 그 자리를 바꾼다 — 되돌리기 결과', () => {
    const prev: ViewMessage[] = [
      { role: 'assistant', text: '답', refs: [], changes: card },
      { role: 'user', text: '다음', refs: [] }
    ]
    const next = withChanges(prev, { ...card, undone: true })
    expect(next).toHaveLength(2)
    expect(next[0]?.changes?.undone).toBe(true)
  })

  it('도는 답이 없으면 새 답으로 붙인다 — 앱 시작 때 마무리한 끊긴 실행', () => {
    const prev: ViewMessage[] = [{ role: 'assistant', text: '끝난 답', refs: [] }]
    expect(withChanges(prev, { ...card, interrupted: true }).at(-1)).toEqual({
      role: 'assistant',
      text: '',
      refs: [],
      changes: { ...card, interrupted: true }
    })
  })
})

describe('useChatSession — 엔진이 알려 오는 형편', () => {
  let listener: ((conversationId: string, event: ChatEvent) => void) | null = null
  const roots: Root[] = []
  let session: ChatSession | null = null

  const Probe = (): null => {
    session = useChatSession()
    return null
  }

  const mount = (): void => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(createElement(Probe)))
  }

  beforeEach(() => {
    listener = null
    session = null
    window.api = {
      listChats: () => Promise.resolve([]),
      loadChat: () => Promise.resolve({ messages: [] }),
      getVaultStatus: () => Promise.resolve({ vaultDir: null }),
      onWikiChanged: () => () => {},
      onChatEvent: (fn: (id: string, event: ChatEvent) => void) => {
        listener = fn
        return () => {
          listener = null
        }
      }
    } as unknown as typeof window.api
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
  })

  const open = (id: string): void => {
    act(() => session?.openConversation(id))
  }

  const send = (event: ChatEvent): void => {
    act(() => listener?.('c1', event))
  }

  it('모델은 턴 시작에, 사용률은 턴 끝에 온다 — 둘이 한 줄로 합쳐진다', () => {
    mount()
    open('c1')

    send({ type: 'usage', usage: { model: 'claude-opus-5', contextPercent: null } })
    expect(session?.usage).toEqual({ model: 'claude-opus-5', contextPercent: null })

    send({ type: 'usage', usage: { model: 'claude-opus-5', contextPercent: 31 } })
    expect(session?.usage).toEqual({ model: 'claude-opus-5', contextPercent: 31 })
  })

  // 앞 턴의 수가 다음 턴의 "지금 형편" 인 척하면, 모델이 바뀐 턴에는 딴 창의 비율을 읽게 된다
  it('턴이 시작되면 앞 턴의 사용률을 지운다', () => {
    mount()
    open('c1')
    send({ type: 'usage', usage: { model: 'claude-opus-5', contextPercent: 31 } })

    send({ type: 'usage', usage: { model: 'claude-haiku-4-5', contextPercent: null } })

    expect(session?.usage).toEqual({ model: 'claude-haiku-4-5', contextPercent: null })
  })

  it('모델을 안 밝힌 줄에도 알던 모델 이름은 지킨다', () => {
    mount()
    open('c1')
    send({ type: 'usage', usage: { model: 'claude-opus-5', contextPercent: null } })

    send({ type: 'usage', usage: { model: null, contextPercent: 12 } })

    expect(session?.usage).toEqual({ model: 'claude-opus-5', contextPercent: 12 })
  })

  it('codex 처럼 아무것도 안 보내면 형편은 없는 채로 둔다', () => {
    mount()
    open('c1')

    send({ type: 'text', text: '답' })

    expect(session?.usage).toBeNull()
  })

  // 앞 대화의 숫자를 다음 대화의 형편으로 읽으면 안 된다
  it('대화를 바꾸면 비운다', () => {
    mount()
    open('c1')
    send({ type: 'usage', usage: { model: 'claude-opus-5', contextPercent: 31 } })

    open('c2')

    expect(session?.usage).toBeNull()
  })
})

describe('useChatSession — 대화 압축', () => {
  let listener: ((conversationId: string, event: ChatEvent) => void) | null = null
  const roots: Root[] = []
  let session: ChatSession | null = null
  const compacted: string[] = []

  const Probe = (): null => {
    session = useChatSession()
    return null
  }

  const mount = (): void => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(createElement(Probe)))
  }

  beforeEach(() => {
    listener = null
    session = null
    compacted.length = 0
    window.api = {
      listChats: () => Promise.resolve([]),
      loadChat: () => Promise.resolve({ messages: [] }),
      getVaultStatus: () => Promise.resolve({ vaultDir: null }),
      onWikiChanged: () => () => {},
      askChat: () => Promise.resolve({ conversationId: 'c1' }),
      compactChat: (id: string) => {
        compacted.push(id)
        return Promise.resolve({ ok: true as const })
      },
      onChatEvent: (fn: (id: string, event: ChatEvent) => void) => {
        listener = fn
        return () => {
          listener = null
        }
      }
    } as unknown as typeof window.api
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
  })

  const send = (event: ChatEvent): void => {
    act(() => listener?.('c1', event))
  }

  const start = (): void => {
    mount()
    act(() => session?.openConversation('c1'))
  }

  it('도는 대화에는 걸지 않는다 — 같은 세션에 실행 둘이 붙는다', () => {
    start()
    // 답이 오는 중 = 그 대화가 runningIds 에 있다
    act(() => session?.compact())
    compacted.length = 0

    act(() => session?.compact())

    expect(compacted).toEqual([])
    expect(session?.error?.text).toContain('압축하지 못했어요')
  })

  it('누르면 그 대화를 압축하라고 보내고 도는 중으로 잠근다', () => {
    start()
    act(() => session?.compact())

    expect(compacted).toEqual(['c1'])
    expect(session?.compacting).toBe(true)
    expect(session?.running).toBe(true)
  })

  it('끝나면 얼마에서 얼마로 줄었는지 한 줄로 말한다', () => {
    start()
    send({ type: 'usage', usage: { model: 'claude-opus-5', contextPercent: 78 } })
    act(() => session?.compact())

    // main 이 보내는 순서 그대로다 — 압축 실행의 사용률은 경계 줄이 왔을 때만 온다
    send({ type: 'usage', usage: { model: 'claude-opus-5', contextPercent: 31 } })
    send({ type: 'compacted' })
    send({ type: 'done', ok: true, canceled: false })

    expect(session?.notice?.text).toContain('78%에서 31%로 줄었어요')
    // 압축 뒤에도 위의 대화는 그대로다 — 그 말을 빼면 AI 가 앞을 잊은 것이 답의 일부처럼 읽힌다
    expect(session?.notice?.text).toContain('위의 대화는 그대로')
    expect(session?.compacting).toBe(false)
  })

  // 누른 적 없는 사람에게 "압축했다" 는 앱이 제멋대로 한 일로 읽힌다
  it('CLI 가 스스로 줄인 것은 다른 말로 알린다', () => {
    start()
    send({ type: 'usage', usage: { model: 'claude-opus-5', contextPercent: 78 } })

    send({ type: 'compacted' })

    expect(session?.notice?.text).toBe(
      'AI가 앞부분을 요약으로 바꿨어요 — 위의 대화는 그대로 남아요'
    )
  })

  // 경계 줄 없이 끝난 실행을 줄었다고 말하면 줄지 않은 대화를 계속 끌고 간다
  it('압축이 안 됐으면 줄었다고 말하지 않는다', () => {
    start()
    send({ type: 'usage', usage: { model: 'claude-opus-5', contextPercent: 78 } })
    act(() => session?.compact())

    // 실패한 실행은 사용률을 아예 안 보낸다 — 보내면 화면의 수가 지워지고 알림째 사라진다
    send({ type: 'notice', text: '대화를 압축하지 못했어요 — 그대로 이어서 물어봐도 돼요' })
    send({ type: 'done', ok: false, canceled: false })

    expect(session?.notice?.text).toContain('하지 못했어요')
    expect(session?.usage?.contextPercent).toBe(78)
    expect(session?.compacting).toBe(false)
  })
})

describe('useChatSession — 다시 답하기', () => {
  let listener: ((conversationId: string, event: ChatEvent) => void) | null = null
  const roots: Root[] = []
  let session: ChatSession | null = null
  let stored: ChatMessage[] = []
  let regenerateResult: { ok: true } | { error: string } = { ok: true }
  const regenerated: [string, ChatAskContext | undefined][] = []
  const asked: string[] = []

  const Probe = (): null => {
    session = useChatSession()
    return null
  }

  beforeEach(() => {
    listener = null
    session = null
    regenerated.length = 0
    asked.length = 0
    regenerateResult = { ok: true }
    stored = [
      { role: 'user', text: '사과는?', refs: [] },
      { role: 'assistant', text: '빨갛다', refs: [] }
    ]
    window.api = {
      listChats: () => Promise.resolve([]),
      loadChat: () => Promise.resolve({ messages: stored }),
      getVaultStatus: () => Promise.resolve({ vaultDir: null }),
      onWikiChanged: () => () => {},
      askChat: (question: string) => {
        asked.push(question)
        return Promise.resolve({ conversationId: 'c1' })
      },
      regenerateChat: (id: string, context?: ChatAskContext) => {
        regenerated.push([id, context])
        return Promise.resolve(regenerateResult)
      },
      onChatEvent: (fn: (id: string, event: ChatEvent) => void) => {
        listener = fn
        return () => {
          listener = null
        }
      }
    } as unknown as typeof window.api
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
  })

  const start = async (): Promise<void> => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(createElement(Probe)))
    await act(async () => session?.openConversation('c1'))
  }

  const send = (event: ChatEvent): void => {
    act(() => listener?.('c1', event))
  }

  it('마지막 답을 지우고 그 대화에 다시 답하라고 보낸다 — 새 답이 그 자리에 온다', async () => {
    await start()
    await act(async () => session?.regenerate?.())

    expect(regenerated).toEqual([['c1', { permissionMode: 'ask' }]])
    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?'])
    expect(session?.running).toBe(true)
    expect(session?.regenerate).toBeNull()

    send({ type: 'text', text: '초록도 있다' })
    // main 은 저장한 뒤에 끝을 알린다
    stored = [stored[0]!, { role: 'assistant', text: '초록도 있다', refs: [] }]
    await act(async () => listener?.('c1', { type: 'done', ok: true, canceled: false }))
    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?', '초록도 있다'])
  })

  it('main 이 거절하면 지운 답을 되살리고 이유를 보인다', async () => {
    regenerateResult = { error: '이미 진행 중인 질문이 있어요' }
    await start()
    await act(async () => session?.regenerate?.())

    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?', '빨갛다'])
    expect(session?.error?.text).toContain('이미 진행 중인 질문이 있어요')
    expect(session?.running).toBe(false)
  })

  it('새 답이 실패하거나 멈추면 지운 답을 되살린다 — main 과 같은 규칙', async () => {
    await start()
    await act(async () => session?.regenerate?.())
    send({ type: 'text', text: '반쯤' })
    send({ type: 'error', message: '한도에 걸렸다' })
    send({ type: 'done', ok: false, canceled: false })
    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?', '빨갛다'])

    await act(async () => session?.regenerate?.())
    send({ type: 'done', ok: false, canceled: true })
    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?', '빨갛다'])
  })

  it('보내기가 거절된 질문의 다시 묻기는 앞 답을 지우지 않고 새로 보낸다 — 앞 질문과 글이 같아도', async () => {
    let refuse = true
    window.api.askChat = ((question: string) => {
      asked.push(question)
      return Promise.resolve(
        refuse ? { error: 'AI 연결을 확인해 주세요' } : { conversationId: 'c1' }
      )
    }) as typeof window.api.askChat
    await start()
    act(() => session?.setDraft('사과는?'))
    await act(async () => session?.ask())
    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?', '빨갛다'])

    refuse = false
    await act(async () => session?.retry?.())
    expect(regenerated).toEqual([])
    expect(asked).toEqual(['사과는?', '사과는?'])
  })

  it('다시 답하는 중에 다른 대화로 갔다 오면 앞 답 없이 열고, 실패하면 앞 답을 한 번만 되살린다', async () => {
    await start()
    await act(async () => session?.regenerate?.())
    await act(async () => session?.openConversation('c2'))
    // 저장소는 새 답이 남을 때까지 앞 답을 들고 있다 — 다시 열면 [질문, 앞 답] 이 온다
    await act(async () => session?.openConversation('c1'))
    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?'])

    send({ type: 'text', text: '반쯤' })
    send({ type: 'done', ok: false, canceled: false })
    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?', '빨갛다'])
  })

  it('도는 중에 다시 열어 받은 글이 화면에 없어도, 끝나면 저장소의 새 답을 보인다', async () => {
    await start()
    await act(async () => session?.regenerate?.())
    send({ type: 'text', text: '초록도 있다' })
    await act(async () => session?.openConversation('c2'))
    await act(async () => session?.openConversation('c1'))
    stored = [stored[0]!, { role: 'assistant', text: '초록도 있다', refs: [] }]
    await act(async () => listener?.('c1', { type: 'done', ok: true, canceled: false }))
    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?', '초록도 있다'])
  })

  it('끝까지 왔는데 빈 새 답이면 앞 답을 되살린다', async () => {
    await start()
    await act(async () => session?.regenerate?.())
    send({ type: 'done', ok: true, canceled: false })
    expect(session?.messages.map((m) => m.text)).toEqual(['사과는?', '빨갛다'])
  })

  it('답이 만든 파일이 남아 있으면 다시 답하기를 내지 않는다', async () => {
    const changes: ChangeSet = {
      id: 'run-1',
      files: [{ rel: 'private/a.md', kind: 'created', tracked: false, afterHash: 'h' }],
      blocked: []
    }
    stored = [stored[0]!, { ...stored[1]!, changes }]
    await start()
    expect(session?.regenerate).toBeNull()
  })

  it('답이 실패한 질문의 다시 묻기는 질문을 한 번 더 붙이지 않고 그 질문에 다시 답하게 한다', async () => {
    stored = []
    await start()
    act(() => session?.setDraft('배는?'))
    await act(async () => session?.ask())
    send({ type: 'error', message: '연결이 끊겼다' })
    send({ type: 'done', ok: false, canceled: false })
    expect(session?.messages.map((m) => m.text)).toEqual(['배는?'])

    await act(async () => session?.retry?.())

    expect(asked).toEqual(['배는?'])
    expect(regenerated).toHaveLength(1)
    expect(regenerated[0]?.[0]).toBe('c1')
    expect(session?.messages.map((m) => m.text)).toEqual(['배는?'])
  })

  it('보내기 자체가 실패하면 질문을 입력칸에 되돌리고 말풍선은 남기지 않는다', async () => {
    stored = []
    window.api.askChat = (() => Promise.reject(new Error('끊겼다'))) as typeof window.api.askChat
    await start()
    act(() => session?.setDraft('배는?'))
    await act(async () => session?.ask())
    expect(session?.messages).toEqual([])
    expect(session?.draft).toBe('배는?')
    expect(session?.error?.text).toContain('질문을 보내지 못했어요')
  })

  it('실패 뒤 새로 쓴 글이 있으면 되돌리기가 덮어쓰지 않는다', async () => {
    stored = []
    let reject: ((e: unknown) => void) | null = null
    window.api.askChat = (() =>
      new Promise<{ conversationId: string }>((_, rej) => {
        reject = rej
      })) as typeof window.api.askChat
    await start()
    act(() => session?.setDraft('배는?'))
    act(() => void session?.ask())
    // 답이 오기 전에 새로 쓰기 시작했다
    act(() => session?.setDraft('새로 쓴다'))
    await act(async () => reject?.(new Error('끊겼다')))
    expect(session?.draft).toBe('새로 쓴다')
  })
})

describe('useChatSession — 스트리밍 묶음', () => {
  let listener: ((conversationId: string, event: ChatEvent) => void) | null = null
  const roots: Root[] = []
  let session: ChatSession | null = null
  let renders = 0

  const Probe = (): null => {
    renders += 1
    session = useChatSession()
    return null
  }

  beforeEach(() => {
    listener = null
    session = null
    renders = 0
    window.api = {
      listChats: () => Promise.resolve([]),
      loadChat: () => Promise.resolve({ messages: [] }),
      getVaultStatus: () => Promise.resolve({ vaultDir: null }),
      onWikiChanged: () => () => {},
      onChatEvent: (fn: (id: string, event: ChatEvent) => void) => {
        listener = fn
        return () => {
          listener = null
        }
      }
    } as unknown as typeof window.api
  })

  afterEach(() => {
    vi.useRealTimers()
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
  })

  it('토큰 스무 개가 두 번의 다시 그리기 안에 합쳐진다', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(createElement(Probe)))
    await act(async () => session?.openConversation('c1'))
    const base = renders
    // 토큰이 와도 화면은 그대로 — 묵혀 둔다
    act(() => {
      for (let i = 0; i < 20; i++) listener?.('c1', { type: 'text', text: `${i} ` })
    })
    expect(session?.messages).toEqual([])
    // 프레임이 돌면 스무 개가 한 풍선으로 한 번에 오른다
    await act(async () => {
      vi.advanceTimersByTime(32)
    })
    expect(session?.messages.map((m) => m.text)).toEqual([
      Array.from({ length: 20 }, (_, i) => `${i} `).join('')
    ])
    expect(renders - base).toBeLessThanOrEqual(2)
  })

  it('끝·실패 사건은 묵은 토큰을 먼저 올린다 — 판정이 덜 된 화면을 보지 않는다', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(createElement(Probe)))
    act(() => session?.openConversation('c1'))
    act(() => listener?.('c1', { type: 'text', text: '반쯤' }))
    act(() => listener?.('c1', { type: 'done', ok: true, canceled: false }))
    expect(session?.messages.map((m) => m.text)).toEqual(['반쯤'])
  })
})

describe('useChatSession — 보관함 전환', () => {
  let changed: ((rels: string[]) => void) | null = null
  const roots: Root[] = []
  let session: ChatSession | null = null

  const Probe = (): null => {
    session = useChatSession()
    return null
  }

  beforeEach(() => {
    changed = null
    useWorkbench.setState({ vaultDir: '/vault/a' })
    window.api = {
      listChats: () => Promise.resolve([]),
      loadChat: () => Promise.resolve({ messages: [{ role: 'user', text: '질문' }] }),
      getVaultStatus: () => Promise.resolve({ vaultDir: '/vault/a' }),
      onWikiChanged: (fn: (rels: string[]) => void) => {
        changed = fn
        return () => {}
      },
      onChatEvent: () => () => {}
    } as unknown as typeof window.api
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
  })

  const mountAndOpen = async (): Promise<void> => {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    await act(async () => root.render(createElement(Probe)))
    await act(async () => session?.openConversation('c1'))
  }

  // 커밋·통째 바뀜도 빈 묶음으로 온다 — 그때 쓰던 대화가 사라지면 안 된다
  it('빈 묶음이 와도 같은 보관함이면 대화를 그대로 둔다', async () => {
    await mountAndOpen()
    expect(session?.messages).toHaveLength(1)

    await act(async () => changed?.([]))

    expect(session?.activeId).toBe('c1')
    expect(session?.messages).toHaveLength(1)
  })

  it('보관함이 바뀌면 비운다', async () => {
    await mountAndOpen()

    await act(async () => useWorkbench.setState({ vaultDir: '/vault/b' }))

    expect(session?.activeId).toBeNull()
    expect(session?.messages).toHaveLength(0)
  })

  it('질문 기본값은 설정에서 읽는다 — 못 읽으면 그 자리 기본으로 둔다', async () => {
    window.api = {
      listChats: () => Promise.resolve([]),
      loadChat: () => Promise.resolve({ messages: [] }),
      getVaultStatus: () => Promise.resolve({ vaultDir: '/vault/a' }),
      getChatDefaults: () => Promise.resolve({ permissionMode: 'edits' }),
      onWikiChanged: () => () => {},
      onChatEvent: () => () => {}
    } as unknown as typeof window.api
    await mountAndOpen()
    expect(session?.permissionMode).toBe('edits')
  })
})

describe('useChatSession — 되돌리기', () => {
  const roots: Root[] = []
  let session: ChatSession | null = null
  const card: ChangeSet = { id: 'run-1', files: [], blocked: [] }
  let undoResult: { ok: true; changes: ChangeSet } | { ok: false; reason: string } = {
    ok: true,
    changes: { ...card, undone: true }
  }
  let undoThrows = false
  const undone: [string, string][] = []
  let reloaded = 0

  const Probe = (): null => {
    session = useChatSession()
    return null
  }

  beforeEach(() => {
    session = null
    undone.length = 0
    reloaded = 0
    undoThrows = false
    undoResult = { ok: true, changes: { ...card, undone: true } }
    useWorkbench.setState({ vaultDir: '/vault/a' })
    window.api = {
      listChats: () => Promise.resolve([]),
      loadChat: () => {
        reloaded += 1
        return Promise.resolve({
          messages: [{ role: 'assistant', text: '바꿈', refs: [], changes: card }]
        })
      },
      getVaultStatus: () => Promise.resolve({ vaultDir: '/vault/a' }),
      onWikiChanged: () => () => {},
      onChatEvent: () => () => {},
      undoNoteChange: (conversationId: string, changeId: string) => {
        undone.push([conversationId, changeId])
        if (undoThrows) return Promise.reject(new Error('gone'))
        return Promise.resolve(undoResult)
      }
    } as unknown as typeof window.api
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
  })

  const mountAndOpen = async (): Promise<void> => {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    await act(async () => root.render(createElement(Probe)))
    await act(async () => session?.openConversation('c1'))
    reloaded = 0
  }

  it('되돌리면 카드에 결과가 붙고 잠금이 풀린다', async () => {
    await mountAndOpen()
    act(() => session?.undoChange('run-1'))
    await act(async () => {})
    expect(undone).toEqual([['c1', 'run-1']])
    expect(session?.messages.at(-1)).toMatchObject({ changes: { id: 'run-1', undone: true } })
    expect(session?.undoing).toBeNull()
    expect(session?.undoError).toBeNull()
  })

  it('main이 거절하면 사유를 보이고 대화를 다시 읽는다', async () => {
    undoResult = { ok: false, reason: '막혔어요' }
    await mountAndOpen()
    act(() => session?.undoChange('run-1'))
    await act(async () => {})
    expect(session?.undoError?.id).toBe('run-1')
    expect(session?.undoError?.text).toContain('되돌리지 못했어요')
    expect(reloaded).toBeGreaterThan(0)
    expect(session?.undoing).toBeNull()
  })

  it('IPC가 끊겨도 잠금은 풀고 사유를 남긴다', async () => {
    undoThrows = true
    await mountAndOpen()
    act(() => session?.undoChange('run-1'))
    await act(async () => {})
    expect(session?.undoError?.id).toBe('run-1')
    expect(session?.undoError?.text).toContain('되돌리지 못했어요')
    expect(session?.undoing).toBeNull()
  })
})
describe('useChatSession — 답 저장', () => {
  const roots: Root[] = []
  let session: ChatSession | null = null
  let saved: unknown[] = []
  let saveResult: { ok: true; path: string } | { ok: false; reason: string } = {
    ok: true,
    path: 'outputs/2026-10-13-사과.md'
  }
  let saveThrows = false

  const Probe = (): null => {
    session = useChatSession()
    return null
  }

  beforeEach(() => {
    session = null
    saved = []
    saveThrows = false
    saveResult = { ok: true, path: 'outputs/2026-10-13-사과.md' }
    useWorkbench.setState({ vaultDir: '/vault/a' })
    window.api = {
      listChats: () => Promise.resolve([]),
      loadChat: () =>
        Promise.resolve({
          messages: [
            { role: 'user', text: '사과는?', refs: [] },
            { role: 'assistant', text: '빨갛다', refs: [] }
          ]
        }),
      getVaultStatus: () => Promise.resolve({ vaultDir: '/vault/a' }),
      onWikiChanged: () => () => {},
      onChatEvent: () => () => {},
      saveChatAnswer: (arg: unknown) => {
        saved.push(arg)
        if (saveThrows) return Promise.reject(new Error('gone'))
        return Promise.resolve(saveResult)
      }
    } as unknown as typeof window.api
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
  })

  const mountAndOpen = async (): Promise<void> => {
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    roots.push(root)
    await act(async () => root.render(createElement(Probe)))
    await act(async () => session?.openConversation('c1'))
  }

  it('답을 보관함 규칙대로 outputs 노트로 남긴다', async () => {
    await mountAndOpen()
    act(() => session?.saveAnswer(1))
    await act(async () => {})
    expect(saved).toEqual([
      { vaultDir: '/vault/a', question: '사과는?', answer: '빨갛다', refs: [] }
    ])
    expect(session?.saveNote).toEqual({
      index: 1,
      ok: true,
      text: '노트로 남겼어요',
      rel: 'outputs/2026-10-13-사과.md'
    })
  })

  it('윈도 경로가 와도 파일 이름만 쓴다', async () => {
    saveResult = { ok: true, path: 'C:\\vault\\outputs\\답.md' }
    await mountAndOpen()
    act(() => session?.saveAnswer(1))
    await act(async () => {})
    expect(session?.saveNote).toMatchObject({ ok: true, rel: 'outputs/답.md' })
  })

  it('main이 거절하면 그 사유를 눕힌다', async () => {
    saveResult = { ok: false, reason: '막혔어요' }
    await mountAndOpen()
    act(() => session?.saveAnswer(1))
    await act(async () => {})
    expect(session?.saveNote?.ok).toBe(false)
    expect(session?.saveNote?.text).toContain('답을 남기지 못했어요')
  })

  it('IPC가 끊겨도 조용하지 않다', async () => {
    saveThrows = true
    await mountAndOpen()
    act(() => session?.saveAnswer(1))
    await act(async () => {})
    expect(session?.saveNote?.ok).toBe(false)
    expect(session?.saveNote?.text).toContain('답을 남기지 못했어요')
  })

  it('보관함이 없으면 보내지 않는다', async () => {
    useWorkbench.setState({ vaultDir: null })
    window.api = {
      ...window.api,
      getVaultStatus: () => Promise.resolve({ vaultDir: null })
    } as unknown as typeof window.api
    await mountAndOpen()
    act(() => session?.saveAnswer(1))
    await act(async () => {})
    expect(saved).toHaveLength(0)
    expect(session?.saveNote).toBeNull()
  })
})

describe('useChatSession — 승인 카드와 진행 줄', () => {
  let listener: ((conversationId: string, event: ChatEvent) => void) | null = null
  const roots: Root[] = []
  let session: ChatSession | null = null
  const answered: [string, string, string][] = []
  let answerThrows = false

  const Probe = (): null => {
    session = useChatSession()
    return null
  }

  const mount = (): void => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(createElement(Probe)))
  }

  beforeEach(() => {
    listener = null
    session = null
    answered.length = 0
    answerThrows = false
    window.api = {
      listChats: () => Promise.resolve([]),
      loadChat: () => Promise.resolve({ messages: [] }),
      getVaultStatus: () => Promise.resolve({ vaultDir: null }),
      onWikiChanged: () => () => {},
      answerChatPermission: (id: string, requestId: string, answer: string) => {
        answered.push([id, requestId, answer])
        return answerThrows ? Promise.reject(new Error('끊겼다')) : Promise.resolve()
      },
      onChatEvent: (fn: (id: string, event: ChatEvent) => void) => {
        listener = fn
        return () => {
          listener = null
        }
      }
    } as unknown as typeof window.api
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
  })

  const open = (id: string): void => {
    act(() => session?.openConversation(id))
  }

  const sendTo = (id: string, event: ChatEvent): void => {
    act(() => listener?.(id, event))
  }

  it('승인 요청이 오면 카드가 뜨고 답이 끝나면 사라진다', () => {
    mount()
    open('c1')
    sendTo('c1', { type: 'permission', id: 'req-1', tool: 'Bash', target: 'date' })
    expect(session?.pendingPermission).toEqual({ id: 'req-1', tool: 'Bash', target: 'date' })

    sendTo('c1', { type: 'done', ok: true, canceled: false })
    expect(session?.pendingPermission).toBeNull()
  })

  it('도구 진행은 한 줄로 보이고 답이 끝나면 비운다', () => {
    mount()
    open('c1')
    sendTo('c1', { type: 'tool', name: 'Bash', target: 'date' })
    expect(session?.activity).toContain('명령을 실행해요')

    sendTo('c1', { type: 'done', ok: true, canceled: false })
    expect(session?.activity).toBeNull()
  })

  // 엔진은 답이 올 때까지 기다리므로 뒷 대화의 요청을 버리면 그 실행이 영영 멈춘다
  it('뒷 대화의 승인 요청을 버리지 않고 돌아오면 카드가 보인다', () => {
    mount()
    open('c1')
    sendTo('c2', { type: 'permission', id: 'req-9', tool: 'Bash', target: 'ls' })
    expect(session?.pendingPermission).toBeNull()

    open('c2')
    expect(session?.pendingPermission).toEqual({ id: 'req-9', tool: 'Bash', target: 'ls' })
  })

  // 화면을 다시 읽으면 카드는 사라져도 main 의 실행은 답을 기다린다 — 대화를 열 때 되살린다
  it('대화를 열 때 main 이 들고 있는 승인 요청으로 카드를 되살린다', async () => {
    window.api.loadChat = () =>
      Promise.resolve({ messages: [], permission: { id: 'req-3', tool: 'Bash', target: 'ls' } })
    mount()
    await act(async () => session?.openConversation('c1'))
    expect(session?.pendingPermission).toEqual({ id: 'req-3', tool: 'Bash', target: 'ls' })
  })

  it('단추를 누르면 main 으로 답이 가고 카드가 내려간다', async () => {
    mount()
    open('c1')
    sendTo('c1', { type: 'permission', id: 'req-1', tool: 'Bash', target: 'date' })
    await act(async () => {
      session?.answerPermission('session')
    })
    expect(answered).toEqual([['c1', 'req-1', 'session']])
    expect(session?.pendingPermission).toBeNull()
  })

  it('main 에 닿지 않으면 카드를 되살려 다시 누를 수 있게 한다', async () => {
    mount()
    open('c1')
    sendTo('c1', { type: 'permission', id: 'req-1', tool: 'Bash', target: 'date' })
    answerThrows = true
    await act(async () => {
      session?.answerPermission('allow')
    })
    expect(answered).toEqual([['c1', 'req-1', 'allow']])
    expect(session?.pendingPermission).toEqual({ id: 'req-1', tool: 'Bash', target: 'date' })
    expect(session?.error?.text).toContain('보내지 못했어요')
  })
})
