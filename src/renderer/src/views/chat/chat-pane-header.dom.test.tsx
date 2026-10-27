// @vitest-environment jsdom
// 떠 있는 채팅 머리글 — 좁은 창에서 토글 단추가 pane에 덮여도 머리글 단추로 닫는다.
// 좁은 창으로 열면 처음부터 접혀 있다(문서 가림 방지). 이후 열기는 존중한다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../../store/workbench'
import { ChatPaneHeader } from './chat-pane-header'
import { ChatContext } from './chat-context'
import type { ChatSession } from './use-chat-session'
import { useChatNarrowInit } from './use-chat-narrow-init'
import { applyLanguage } from '../../lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  act(() => applyLanguage('ko'))
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

beforeEach(() => {
  useWorkbench.setState({ chatOpen: true, chatTab: 'chat', peek: null })
})

const mount = (node: React.ReactNode): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(node))
  return container
}

const Probe = (): React.JSX.Element => {
  useChatNarrowInit()
  return <></>
}

const setInnerWidth = (width: number): void => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

describe('떠 있는 채팅 머리글', () => {
  it('떠 있을 때 접기 단추가 있고 누르면 채팅 칸이 접힌다', () => {
    const container = mount(<ChatPaneHeader floating ingestRunning={false} />)
    const collapse = container.querySelector('[data-testid="collapse-chat"]')
    expect(collapse).not.toBeNull()
    expect(collapse!.getAttribute('aria-label')).toBe('채팅 칸 접기')
    act(() => (collapse as HTMLElement).click())
    expect(useWorkbench.getState().chatOpen).toBe(false)
  })

  it('자리잡힌 채팅에는 접기 단추가 없다 — 도구 막대의 토글이 맡는다', () => {
    const container = mount(<ChatPaneHeader floating={false} ingestRunning={false} />)
    expect(container.querySelector('[data-testid="collapse-chat"]')).toBeNull()
    // 탭 띠는 그대로 있다
    expect(container.querySelector('[data-testid="chat-tab-chat"]')).not.toBeNull()
    // 웹 조사는 없앤 기능이다
    expect(container.querySelector('[data-testid="chat-tab-research"]')).toBeNull()
  })

  it('탭을 누르면 그 탭으로 열린다', () => {
    const container = mount(<ChatPaneHeader floating ingestRunning={false} />)
    act(() => (container.querySelector('[data-testid="chat-tab-ingest"]') as HTMLElement).click())
    expect(useWorkbench.getState().chatTab).toBe('ingest')
    expect(useWorkbench.getState().chatOpen).toBe(true)
  })

  it('탭은 체계 radius(sm 4px)를 쓴다 — 5px 임의값 밖이다', () => {
    const container = mount(<ChatPaneHeader floating={false} ingestRunning={false} />)
    const tabs = [...container.querySelectorAll('[role="tab"]')]
    expect(tabs.length).toBeGreaterThan(0)
    for (const tab of tabs) {
      expect(tab.classList.contains('rounded-sm')).toBe(true)
      expect(tab.className).not.toContain('rounded-[')
    }
  })
})

describe('열었을 때만 뜨는 탭', () => {
  const tabs = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.id)

  it('참고한 페이지·기록 탭은 열기 전에는 띠에 없다', () => {
    const container = mount(<ChatPaneHeader floating={false} ingestRunning={false} />)
    expect(tabs(container)).toEqual(['chat-tab-chat', 'chat-tab-ingest'])
  })

  it('근거를 열면 참고한 페이지 탭이, 기록을 열면 기록 탭이 생긴다', () => {
    const container = mount(<ChatPaneHeader floating={false} ingestRunning={false} />)
    act(() => useWorkbench.setState({ peek: { rel: 'wiki/a.md', line: null }, chatTab: 'peek' }))
    expect(tabs(container)).toEqual(['chat-tab-chat', 'chat-tab-peek', 'chat-tab-ingest'])
    act(() => useWorkbench.setState({ chatTab: 'history' }))
    expect(tabs(container)).toEqual([
      'chat-tab-chat',
      'chat-tab-peek',
      'chat-tab-ingest',
      'chat-tab-history'
    ])
    act(() => useWorkbench.setState({ peek: null, chatTab: 'chat' }))
    expect(tabs(container)).toEqual(['chat-tab-chat', 'chat-tab-ingest'])
  })

  it('화살표·End 는 보이는 탭 사이만 옮긴다', () => {
    const container = mount(<ChatPaneHeader floating={false} ingestRunning={false} />)
    const list = container.querySelector('[role="tablist"]') as HTMLElement
    const press = (key: string): void => {
      act(() => {
        list.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      })
    }
    press('ArrowRight')
    expect(useWorkbench.getState().chatTab).toBe('ingest')
    press('ArrowRight')
    expect(useWorkbench.getState().chatTab).toBe('chat')
    press('End')
    expect(useWorkbench.getState().chatTab).toBe('ingest')
    press('Home')
    expect(useWorkbench.getState().chatTab).toBe('chat')
    press('ArrowLeft')
    expect(useWorkbench.getState().chatTab).toBe('ingest')
  })

  it('기록 탭이 열린 채 채팅 탭을 누르면 기록 탭이 띠에서 사라진다', () => {
    const container = mount(<ChatPaneHeader floating={false} ingestRunning={false} />)
    act(() => useWorkbench.getState().toggleHistory())
    expect(tabs(container)).toContain('chat-tab-history')
    act(() => (container.querySelector('[data-testid="chat-tab-chat"]') as HTMLElement).click())
    expect(tabs(container)).toEqual(['chat-tab-chat', 'chat-tab-ingest'])
  })

  it('근거를 닫으면 참고한 페이지 탭이 띠에서 사라지고 열기 전 탭으로 돌아간다', () => {
    act(() => useWorkbench.setState({ chatTab: 'ingest' }))
    const container = mount(<ChatPaneHeader floating={false} ingestRunning={false} />)
    act(() => useWorkbench.getState().openPeek('wiki/a.md'))
    expect(tabs(container)).toContain('chat-tab-peek')
    act(() => useWorkbench.getState().closePeek())
    expect(tabs(container)).toEqual(['chat-tab-chat', 'chat-tab-ingest'])
    expect(useWorkbench.getState().chatTab).toBe('ingest')
  })
})

describe('채팅 탭의 답 점', () => {
  const session = (running: boolean): ChatSession => ({ running }) as ChatSession
  const header = (running: boolean): React.ReactNode => (
    <ChatContext.Provider value={session(running)}>
      <ChatPaneHeader floating={false} ingestRunning={false} />
    </ChatContext.Provider>
  )

  it('다른 탭에 있는 동안 답이 오면 점, 다 오면 새 답 점 — 채팅 탭을 열면 걷힌다', () => {
    useWorkbench.setState({ chatTab: 'peek' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    const chatTab = (): string => container.querySelector('#chat-tab-chat')?.textContent ?? ''

    act(() => root.render(header(true)))
    expect(chatTab()).toContain('답 오는 중')
    act(() => root.render(header(false)))
    expect(chatTab()).toContain('새 답')
    act(() => useWorkbench.setState({ chatTab: 'chat' }))
    expect(chatTab()).toBe('채팅')
  })

  it('영어에서도 새 답 점은 멈춰 있고 진행 점만 깜빡인다 — 점의 종류를 글자로 가르지 않는다', () => {
    act(() => applyLanguage('en'))
    useWorkbench.setState({ chatTab: 'peek' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    const chatTab = (): HTMLElement => container.querySelector<HTMLElement>('#chat-tab-chat')!
    const dot = (): Element | null => chatTab().querySelector('[aria-hidden]')

    act(() => root.render(header(true)))
    expect(chatTab().textContent).toBe('ChatAnswer coming in')
    expect(dot()?.className).toContain('animate-pulse')
    act(() => root.render(header(false)))
    expect(chatTab().textContent).toBe('ChatNew answer')
    expect(dot()?.className).not.toContain('animate-pulse')
  })

  it('채팅 탭을 보고 있으면 점을 달지 않는다', () => {
    mount(header(true))
    expect(document.querySelector('#chat-tab-chat')?.textContent).toBe('채팅')
  })
})

describe('좁은 창 채팅 초기 상태', () => {
  it('좁은 창(764px 미만)으로 열면 채팅 칸은 접힌 채로 시작한다', () => {
    setInnerWidth(700)
    try {
      // StrictMode 이중 마운트에서도 set 한 번으로 끝나야 한다(toggle이면 다시 열린다)
      mount(
        <StrictMode>
          <Probe />
        </StrictMode>
      )
      expect(useWorkbench.getState().chatOpen).toBe(false)
    } finally {
      setInnerWidth(1024)
    }
  })

  it('넓은 창에서는 열린 채로 시작한다', () => {
    setInnerWidth(1280)
    try {
      mount(<Probe />)
      expect(useWorkbench.getState().chatOpen).toBe(true)
    } finally {
      setInnerWidth(1024)
    }
  })
})
