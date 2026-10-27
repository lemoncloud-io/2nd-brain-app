// @vitest-environment jsdom
// 빈 탭은 설명이 아니라 할 일을 보인다 — 네 가지가 서고, 누르면 그 일이 일어난다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../store/workbench'
import { emptyTab } from '../store/tabs'
import { BlankTab } from './blank-tab'
import { createTodayPrompt } from '../lib/chat-actions'
import { ChatContext } from './chat/chat-context'
import type { ChatSession } from './chat/use-chat-session'
import { dateKey } from '../lib/today-note'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

beforeEach(() => {
  useWorkbench.setState({
    view: 'doc',
    tabs: [emptyTab()],
    tabAt: 0,
    selectedPage: null,
    selectedSource: null,
    docMode: 'page',
    paletteOpen: false,
    editing: null,
    editorDirty: false,
    pendingNavigation: null,
    tree: []
  })
})

const chatWith = (draft: string): ChatSession =>
  ({ draft, setDraft: vi.fn() }) as unknown as ChatSession

const mount = (chat: ChatSession = chatWith('')): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() =>
    root.render(
      <ChatContext.Provider value={chat}>
        <BlankTab />
      </ChatContext.Provider>
    )
  )
  return container
}

const press = (container: HTMLElement, testId: string): void => {
  act(() => container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click())
}

// 앱과 같은 로컬 날짜 — toISOString 은 UTC 라 한국 시각 0~9시에 하루 어긋난다
const TODAY = dateKey(new Date())
const todayNote = {
  rel: `private/${TODAY}.md`,
  kind: 'file' as const,
  ext: '.md',
  mtimeMs: 0,
  size: 0
}

describe('빈 탭', () => {
  it('오늘 노트가 없으면 열기 대신 만들기가 맨 위에, 시작하기는 같은 크기의 줄로 맨 아래에 선다', () => {
    const container = mount()
    expect(
      [...container.querySelectorAll('button')].map((b) => b.getAttribute('data-testid'))
    ).toEqual([
      'blank-today-create',
      'blank-open',
      'blank-new-note',
      'blank-web',
      'blank-close',
      'blank-start'
    ])
    expect(container.querySelector('[data-testid="blank-start"]')?.className).toBe(
      container.querySelector('[data-testid="blank-open"]')?.className
    )
  })

  it('오늘 노트 만들기는 채팅 입력칸에 그 문장을 채우고 보내지 않는다', () => {
    expect(createTodayPrompt()).toBe('오늘 노트 만들어줘')
    const chat = chatWith('')
    const container = mount(chat)
    press(container, 'blank-today-create')
    expect(chat.setDraft).toHaveBeenCalledWith('오늘 노트 만들어줘')
    expect(useWorkbench.getState().chatTab).toBe('chat')
    expect(useWorkbench.getState().chatOpen).toBe(true)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('채웠어요')
  })

  it('쓰던 글이 있으면 덮어쓰지 않고 덧붙인다', () => {
    const chat = chatWith('쓰던 질문')
    press(mount(chat), 'blank-today-create')
    expect(chat.setDraft).toHaveBeenCalledWith('쓰던 질문\n오늘 노트 만들어줘')
  })

  it('오늘 노트가 있으면 그 줄이 맨 위에 선다', () => {
    useWorkbench.setState({ tree: [todayNote] })
    const container = mount()
    expect(
      [...container.querySelectorAll('button')].map((b) => b.getAttribute('data-testid'))
    ).toEqual(['blank-today', 'blank-open', 'blank-new-note', 'blank-web', 'blank-close'])
  })

  it('문서 찾아 열기는 ⌘K 와 같은 자리를 연다', () => {
    press(mount(), 'blank-open')
    expect(useWorkbench.getState().paletteOpen).toBe(true)
  })

  it('오늘 노트 열기는 그 노트를 연다', () => {
    useWorkbench.setState({ tree: [todayNote] })
    press(mount(), 'blank-today')
    expect(useWorkbench.getState().view).toBe('doc')
    expect(useWorkbench.getState().selectedPage).toBe(todayNote.rel)
  })

  it('이 탭 닫기는 마지막 한 장이면 비운다', () => {
    useWorkbench.getState().newTab()
    expect(useWorkbench.getState().tabs).toHaveLength(2)
    press(mount(), 'blank-close')
    expect(useWorkbench.getState().tabs).toHaveLength(1)
  })

  it('단축키 표시는 지금 표와 같다 — 닫기는 ⌘W, 새 노트 만들기는 단축키 없음', () => {
    const container = mount()
    const isMac = navigator.userAgent.includes('Mac')
    const keyOf = (testId: string): string | undefined => {
      const button = container.querySelector(`[data-testid="${testId}"]`)!
      return button.querySelector('kbd')?.textContent ?? undefined
    }
    expect(keyOf('blank-new-note')).toBeUndefined()
    expect(keyOf('blank-close')).toBe(isMac ? '⌘W' : 'Ctrl+W')
  })

  it('단축키 표시는 잘리지 않고 전문이 title에 있다', () => {
    const container = mount()
    const kbds = [...container.querySelectorAll('kbd')]
    expect(kbds.length).toBeGreaterThan(0)
    for (const kbd of kbds) {
      expect(kbd.getAttribute('title')).toBe(kbd.textContent)
      expect(kbd.className).toContain('truncate')
    }
  })
})
