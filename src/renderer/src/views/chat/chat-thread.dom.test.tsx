// @vitest-environment jsdom
// 무거워진 대화의 알림 — 길 둘을 한 줄에 준다. 압축은 확인을 받기 전에는 아무 일도 안 한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { VaultTreeEntry } from '../../../../shared/ipc-contract'
import { useWorkbench } from '../../store/workbench'
import { ChatContext } from './chat-context'
import { ChatThread } from './chat-thread'
import type { ChatSession } from './use-chat-session'
import { applyLanguage } from '../../lib/i18n'
import { STOPPED_MARK } from '../../../../shared/chat-turn'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const session = (over: Partial<ChatSession> = {}): ChatSession =>
  ({
    conversations: [],
    activeId: 'c1',
    activeTitle: undefined,
    messages: [],
    runningIds: new Set<string>(),
    running: false,
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

const mount = (chat: ChatSession): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<ChatContext.Provider value={chat}>{<ChatThread />}</ChatContext.Provider>))
  return container
}

beforeEach(() => {
  // 입력칸이 열리자마자 스킬 목록을 미리 묻는다 — 이 테스트들의 관심은 아니라 빈 목록
  window.api = {
    listChatSkills: vi.fn(async () => [])
  } as unknown as typeof window.api
  // jsdom 에는 이 메서드가 아예 없다 — 스레드가 맨 아래로 따라 내려가는 효과가 여기서 터진다
  Element.prototype.scrollTo = function (): void {
    // 스크롤 자체는 이 테스트의 관심이 아니다
  } as Element['scrollTo']
})

afterEach(() => {
  act(() => applyLanguage('ko'))
  useWorkbench.setState({ tree: null, docMode: 'page', selectedSource: null })
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  delete (Element.prototype as Partial<Element>).scrollTo
})

const notice = (): HTMLElement | null => document.querySelector('[data-testid="chat-too-long"]')

const button = (testId: string): HTMLButtonElement | null =>
  document.querySelector(`[data-testid="${testId}"]`)

describe('ChatThread — 무거워진 대화', () => {
  it('가벼운 대화에는 알림이 없다', () => {
    mount(session())
    expect(notice()).toBeNull()
  })

  it('찬 정도가 75% 를 넘으면 알림 하나가 뜬다 — 두 종류로 갈라지지 않는다', () => {
    mount(session({ usage: { model: 'claude-opus-5', contextPercent: 78 } }))

    expect(document.querySelectorAll('[data-testid="chat-too-long"]')).toHaveLength(1)
    expect(button('chat-new-from-long')).not.toBeNull()
    // 압축은 알림 밖, 컴포저 아래에 늘 있다 — 같은 일을 하는 단추가 둘이면 안 된다
    expect(notice()?.querySelector('[data-testid="chat-compact"]')).toBeNull()
  })

  it('입력칸 아래에 단축키 힌트 줄이 없다 — 끌어다 놓기 안내는 자료 넣기 단추에 있다', () => {
    mount(session())
    expect(document.querySelector('[data-testid="chat-thread"]')?.textContent).not.toContain(
      'Shift+Enter'
    )
    expect(button('chat-attach')?.title).toContain('끌어다 놓')
    expect(button('chat-ask')?.title).toBe('보내기 (Enter · 줄 바꿈은 Shift+Enter)')
  })

  // 길어진 뒤에야 찾을 수 있으면 늦다 — 주제가 바뀌는 순간에 누르는 단추다
  it('압축은 짧은 대화에도 늘 있다', () => {
    mount(session({ messages: [{ role: 'user', text: '안녕' }] as ChatSession['messages'] }))
    expect(notice()).toBeNull()
    expect(button('chat-compact')?.disabled).toBe(false)
  })

  it('압축할 것이 없으면 숨고, 답이 오는 중이면 잠긴다', () => {
    mount(session())
    expect(button('chat-compact')).toBeNull()
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
    mount(
      session({
        messages: [{ role: 'user', text: '안녕' }] as ChatSession['messages'],
        running: true
      })
    )
    expect(button('chat-compact')?.disabled).toBe(true)
  })

  it('주고받은 수로도 같은 알림이 뜬다', () => {
    mount(session({ tooLong: true }))
    expect(document.querySelectorAll('[data-testid="chat-too-long"]')).toHaveLength(1)
  })

  it('75% 이하면 알림이 없다 — 경계는 넘어야 한다', () => {
    mount(session({ usage: { model: 'claude-opus-5', contextPercent: 75 } }))
    expect(notice()).toBeNull()
  })

  // 되돌릴 수 없고 사용량을 쓰는 일이다 — 누른 것만으로 실행되면 안 된다
  it('누르면 먼저 무엇이 일어나는지 묻고, 확인 전에는 실행하지 않는다', () => {
    const chat = session({
      tooLong: true,
      messages: [{ role: 'user', text: '안녕' }] as ChatSession['messages']
    })
    mount(chat)

    act(() => button('chat-compact')?.click())

    expect(document.querySelector('[data-testid="chat-compact-dialog"]')).not.toBeNull()
    expect(chat.compact).not.toHaveBeenCalled()
  })

  it('확인해야 실행한다', () => {
    const chat = session({
      tooLong: true,
      messages: [{ role: 'user', text: '안녕' }] as ChatSession['messages']
    })
    mount(chat)
    act(() => button('chat-compact')?.click())

    act(() => button('chat-compact-confirm')?.click())

    expect(chat.compact).toHaveBeenCalledTimes(1)
  })

  it('답이 오는 중에는 알림째 뜨지 않는다 — 같은 세션에 실행 둘이 붙는다', () => {
    mount(session({ tooLong: true, running: true }))
    expect(notice()).toBeNull()
  })
})

describe('ChatThread — 메시지와 입력칸', () => {
  const messages = [
    { role: 'user', text: '첫 질문', refs: [] },
    { role: 'assistant', text: '첫 답', refs: [] },
    { role: 'user', text: '둘째 질문', refs: [] },
    { role: 'assistant', text: '둘째 답', refs: [] }
  ] as ChatSession['messages']

  it('답 첫 글자를 기다리는 동안은 점 셋이 튄다 — 글자가 오면 사라진다', () => {
    mount(
      session({
        running: true,
        messages: [
          { role: 'user', text: '질문', refs: [] },
          { role: 'assistant', text: '', refs: [], streaming: true }
        ] as ChatSession['messages']
      })
    )
    expect(button('chat-typing')).not.toBeNull()
    for (const root of roots.splice(0)) act(() => root.unmount())
    mount(
      session({
        running: true,
        messages: [
          { role: 'user', text: '질문', refs: [] },
          { role: 'assistant', text: '답의 앞', refs: [], streaming: true }
        ] as ChatSession['messages']
      })
    )
    expect(button('chat-typing')).toBeNull()
  })

  // 근거 칩이 답 뒤로 가면서 답 전에 풍선을 열어 주던 것이 없어졌다 — 그래도 기다리는 중임은 보인다
  it('답 풍선이 열리기 전에도 답을 기다리는 동안은 점 셋이 튄다', () => {
    const asked = [{ role: 'user', text: '질문', refs: [] }] as ChatSession['messages']
    mount(session({ running: true, messages: asked }))
    expect(button('chat-pending')).not.toBeNull()
    for (const root of roots.splice(0)) act(() => root.unmount())
    mount(session({ running: false, messages: asked }))
    expect(button('chat-pending')).toBeNull()
  })

  // 다음 질문을 미리 써 둘 수 있어야 한다 — Enter 는 멈추기(■와 같음), 쓴 글은 그대로 둔다
  it('답하는 중에 Enter 를 누르면 멈추고 쓴 글은 둔다 — 보내지는 않는다', () => {
    const chat = session({ running: true, draft: '다음 질문', messages })
    mount(chat)
    const input = document.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')
    expect(input?.disabled).toBe(false)

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(chat.stop).toHaveBeenCalledOnce()
    expect(chat.ask).not.toHaveBeenCalled()
    expect(chat.setDraft).not.toHaveBeenCalled()
    expect(button('chat-stop')).not.toBeNull()
  })

  it('내 질문의 고치기는 그 문장을 입력칸에 올린다 — 대화는 건드리지 않는다', () => {
    const chat = session({ messages })
    mount(chat)

    act(() => document.querySelectorAll<HTMLButtonElement>('[data-testid="chat-edit"]')[1]?.click())

    expect(chat.setDraft).toHaveBeenCalledWith('둘째 질문')
    expect(chat.ask).not.toHaveBeenCalled()
  })

  it('마지막 답의 단추만 늘 보이고 지난 답은 손이 갈 때 보인다', () => {
    mount(session({ messages }))
    const bars = [...document.querySelectorAll('[data-testid="chat-save"]')].map(
      (save) => save.parentElement?.className ?? ''
    )
    expect(bars).toHaveLength(2)
    expect(bars[0]).toContain('opacity-0')
    expect(bars[1]).not.toContain('opacity-0')
  })

  it('다시 답하기는 마지막 답에만 있고 누르면 그 답을 다시 받는다', () => {
    const regenerate = vi.fn()
    mount(session({ messages, regenerate }))
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-testid="chat-regenerate"]')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.closest('[data-testid="chat-message-assistant"]')?.textContent).toContain(
      '둘째 답'
    )

    act(() => buttons[0]?.click())
    expect(regenerate).toHaveBeenCalledOnce()
  })

  it('다시 답하기를 누르면 입력칸으로 포커스가 간다 — 누른 단추는 답과 함께 사라진다', () => {
    mount(session({ messages, regenerate: vi.fn() }))
    act(() => button('chat-regenerate')?.click())
    expect(document.activeElement?.getAttribute('data-testid')).toBe('chat-input')
  })

  it('오류 줄에 다시 묻기가 있으면 다시 답하기는 숨긴다 — 같은 일을 하는 단추 둘이 겹친다', () => {
    mount(
      session({
        messages,
        regenerate: vi.fn(),
        retry: vi.fn(),
        error: { text: '답을 받지 못했어요' } as ChatSession['error']
      })
    )
    expect(button('chat-retry')).not.toBeNull()
    expect(button('chat-regenerate')).toBeNull()
  })

  it('regenerate 가 null 이면 단추가 없다 — 조건 판정은 훅 테스트가 본다', () => {
    mount(session({ messages, regenerate: null }))
    expect(button('chat-regenerate')).toBeNull()
  })

  it('답 복사는 답 원문을 클립보드에 넣는다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mount(session({ messages }))

    await act(async () => {
      document.querySelectorAll<HTMLButtonElement>('[data-testid="chat-copy"]')[1]?.click()
    })

    expect(writeText).toHaveBeenCalledWith('둘째 답')
    expect(
      document.querySelectorAll('[data-testid="chat-copy"]')[1]?.getAttribute('aria-label')
    ).toBe('복사됨')
  })

  it('답 아래에 웹에서 조사 단추가 없다 — 없앤 기능이다', () => {
    mount(session({ messages }))
    expect(document.querySelector('[data-testid="chat-research"]')).toBeNull()
    expect(document.querySelectorAll('[data-testid="chat-save"]').length).toBeGreaterThan(0)
  })

  it('답 본문의 보관함 경로를 누르면 가운데에 그 파일이 열린다 — 폴더와 없는 경로는 글자다', () => {
    const file = (rel: string, kind: 'file' | 'dir' = 'file'): VaultTreeEntry => ({
      rel,
      kind,
      ext: '',
      mtimeMs: 0,
      size: 0
    })
    useWorkbench.setState({
      tree: [file('outputs', 'dir'), file('outputs/report.html')],
      docMode: 'page',
      selectedSource: null
    })
    mount(
      session({
        messages: [
          { role: 'user', text: '만들어 줘', refs: [] },
          {
            role: 'assistant',
            text: '`outputs/report.html` 에 썼어요. `outputs` · `outputs/x.html`',
            refs: []
          }
        ] as ChatSession['messages']
      })
    )
    const links = document.querySelectorAll<HTMLElement>('[data-testid="chat-path"]')
    expect([...links].map((link) => link.textContent)).toEqual(['outputs/report.html'])
    act(() => links[0]?.click())
    expect(useWorkbench.getState()).toMatchObject({
      docMode: 'source',
      selectedSource: 'outputs/report.html'
    })
  })

  // 화면 캡처를 복사해 입력칸에 붙여 넣으면 질문에 붙는다 — 글을 붙여 넣는 것은 그대로다
  it('그림을 붙여 넣으면 질문에 붙이고, 글 붙여 넣기는 막지 않는다', () => {
    const chat = session()
    mount(chat)
    const input = document.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')!
    const paste = (files: File[], text = ''): Event => {
      const ev = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'clipboardData', {
        value: { files, getData: () => text }
      })
      act(() => {
        input.dispatchEvent(ev)
      })
      return ev
    }
    const shot = new File(['x'], 'shot.png', { type: 'image/png' })

    expect(paste([shot]).defaultPrevented).toBe(true)
    expect(chat.addImages).toHaveBeenCalledWith([shot])

    expect(paste([], '그냥 글').defaultPrevented).toBe(false)
    expect(chat.addImages).toHaveBeenCalledTimes(1)
  })

  it('붙인 그림은 입력칸에 작게 보이고, 누르면 크게 보며, x 로 뺀다', () => {
    const chat = session({
      images: [
        { id: 'g1', mediaType: 'image/png', data: 'AAAA', url: 'data:image/png;base64,AAAA' }
      ]
    })
    mount(chat)
    expect(document.querySelectorAll('[data-testid="chat-image"]')).toHaveLength(1)
    act(() => button('chat-image-open')?.click())
    expect(document.querySelector('[data-testid="chat-image-zoom"]')).not.toBeNull()
    act(() => button('chat-image-zoom-close')?.click())
    expect(document.querySelector('[data-testid="chat-image-zoom"]')).toBeNull()
    act(() => button('chat-image-remove')?.click())
    expect(chat.removeImage).toHaveBeenCalledWith('g1')
  })

  it('질문 말풍선에는 보낸 그림이, 다시 연 대화에는 그림 수가 보인다', () => {
    mount(
      session({
        messages: [
          {
            role: 'user',
            text: '이게 뭐야',
            refs: [],
            images: 1,
            imageUrls: ['data:image/png;base64,AAAA']
          },
          { role: 'assistant', text: '빨간 네모예요', refs: [] },
          { role: 'user', text: '이건?', refs: [], images: 2 }
        ]
      })
    )
    expect(document.querySelectorAll('[data-testid="chat-message-image"]')).toHaveLength(1)

    // 누르면 크게 보고, Esc 로 닫는다
    act(() => button('chat-message-image-open')?.click())
    const zoom = document.querySelector('[data-testid="chat-image-zoom"]')
    expect(zoom?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    })
    expect(document.querySelector('[data-testid="chat-image-zoom"]')).toBeNull()
    expect(document.querySelector('[data-testid="chat-message-image-count"]')?.textContent).toBe(
      '그림 2장'
    )
  })

  // 첫 목록은 CLI 를 띄워 받느라 몇 초 걸린다 — `/` 만 쳐도 그동안 무엇을 기다리는지 보인다
  it('/ 만 치면 목록을 받는 동안 불러오는 중이 보이고, 받으면 이름순 목록이 뜬다', async () => {
    let answer: (skills: { name: string }[]) => void = () => undefined
    window.api = {
      listChatSkills: vi.fn(() => new Promise((resolve) => (answer = resolve)))
    } as unknown as typeof window.api
    mount(session({ draft: '/', messages }))
    expect(document.querySelector('[data-testid="chat-slash-loading"]')).not.toBeNull()

    await act(async () => answer([{ name: 'vault-reach' }, { name: 'design' }]))

    expect(document.querySelector('[data-testid="chat-slash-loading"]')).toBeNull()
    const names = [...document.querySelectorAll('[data-testid^="chat-slash:"]')].map((el) =>
      el.getAttribute('data-testid')
    )
    expect(names).toEqual(['chat-slash:design', 'chat-slash:vault-reach'])
  })

  // `/` 는 사용자 스킬 목록이다 — 고르면 `/이름 ` 이 입력칸에 차고, 보내면 그 질문 그대로 간다
  it('/ 를 치면 사용자 스킬이 뜨고, 고르면 입력칸이 /이름 으로 바뀐다', async () => {
    window.api = {
      ...window.api,
      listChatSkills: vi.fn(async () => [
        { name: 'vault-reach', description: '고아 문서 찾기' },
        { name: 'pdf2md-ingest' }
      ])
    } as unknown as typeof window.api
    const chat = session({ draft: '/va', messages })
    mount(chat)
    await act(async () => undefined)
    const option = button('chat-slash:vault-reach')
    expect(option?.textContent).toContain('고아 문서 찾기')
    expect(button('chat-slash:pdf2md-ingest')).toBeNull()

    act(() => option?.click())

    expect(chat.setDraft).toHaveBeenLastCalledWith('/vault-reach ')
    expect(chat.ask).not.toHaveBeenCalled()
  })

  it('대화 스크롤 칸은 키보드로 닿고 2px 링을 보인다', () => {
    mount(session())
    const scroller = document.querySelector('[aria-label="대화 스크롤"]')!
    expect(scroller.getAttribute('tabindex')).toBe('0')
    expect(scroller.className).toContain('focus-ring')
  })
})

describe('글 없이 멈춘 답', () => {
  it('저장 표식 대신 화면 언어의 말로 보인다', () => {
    const container = mount(
      session({
        messages: [
          { role: 'user', text: '질문' },
          { role: 'assistant', text: STOPPED_MARK, refs: [] }
        ] as ChatSession['messages']
      })
    )
    const answer = (): string =>
      container.querySelector('[data-testid="chat-message-assistant"]')?.textContent ?? ''
    expect(answer()).toContain('(멈춤)')

    act(() => applyLanguage('en'))

    expect(answer()).toContain('(stopped)')
    expect(answer()).not.toContain('멈춤')
  })
})
