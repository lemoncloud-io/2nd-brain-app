// @vitest-environment jsdom
// 오늘 띠 — 지난 노트로 건너가도 오늘로 돌아오는 길이 남고, 오늘 정리하기는 쓰던 글을 지우지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../store/workbench'
import { dateKey } from '../lib/today-note'
import { messages } from '../../../shared/i18n'
import { ChatContext } from './chat/chat-context'
import type { ChatSession } from './chat/use-chat-session'
import { TodayStrip } from './today-strip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TODAY = dateKey(new Date())
const PREV = '2020-10-10'
const file = (
  rel: string
): { rel: string; kind: 'file'; ext: string; mtimeMs: number; size: number } => ({
  rel,
  kind: 'file',
  ext: '.md',
  mtimeMs: 1,
  size: 0
})
const TEXT: Record<string, string> = {
  [`private/${TODAY}.md`]: '# 오늘\n\n## 할 일\n- [x] 하나\n- [ ] 둘\n',
  [`private/${PREV}.md`]: '# 지난\n\n## 할 일\n- [ ] 셋\n- [ ] 넷\n'
}

const roots: Root[] = []

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    readWikiPage: async (rel: string) => ({ text: TEXT[rel] ?? '' })
  }
  useWorkbench.setState({
    view: 'doc',
    tree: [file(`private/${TODAY}.md`), file(`private/${PREV}.md`)],
    selectedPage: `private/${TODAY}.md`
  })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  delete (window as unknown as { api?: unknown }).api
})

const mount = async (chat: ChatSession): Promise<HTMLElement> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(
      <ChatContext.Provider value={chat}>
        <TodayStrip />
      </ChatContext.Provider>
    )
  })
  return container
}

const chatWith = (draft: string): ChatSession =>
  ({ draft, setDraft: vi.fn() }) as unknown as ChatSession

const byTestId = (container: HTMLElement, id: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${id}"]`)

describe('TodayStrip', () => {
  it('지난 노트 단추는 날짜를 말하고, 진행 수는 단추가 아닌 글자다', async () => {
    const container = await mount(chatWith(''))
    expect(byTestId(container, 'today-previous')?.textContent).toContain('10/10 노트에 남은 일 2')
    const progress = byTestId(container, 'today-progress')!
    expect(progress.tagName).toBe('SPAN')
    expect(progress.textContent).toContain('오늘 할 일 2개 중 1개 완료')
  })

  it('지난 노트를 볼 때도 띠가 남아 오늘 노트로 돌아온다', async () => {
    useWorkbench.setState({ selectedPage: `private/${PREV}.md` })
    const container = await mount(chatWith(''))
    expect(byTestId(container, 'today-wrapup')).toBeNull()
    await act(async () => byTestId(container, 'today-back')!.click())
    expect(useWorkbench.getState().selectedPage).toBe(`private/${TODAY}.md`)
  })

  it('다른 문서 위에는 뜨지 않는다', async () => {
    useWorkbench.setState({ selectedPage: 'wiki/a.md' })
    const container = await mount(chatWith(''))
    expect(byTestId(container, 'today-strip')).toBeNull()
  })

  it('오늘 정리하기는 쓰던 글 뒤에 덧붙이고 띠에 알린다', async () => {
    const chat = chatWith('쓰던 질문')
    const container = await mount(chat)
    act(() => byTestId(container, 'today-wrapup')!.click())
    expect(chat.setDraft).toHaveBeenCalledWith(`쓰던 질문\n${messages('ko').chat.wrapUpPrompt}`)
    expect(byTestId(container, 'today-filled')?.textContent).toContain('덧붙였어요')
    expect(byTestId(container, 'today-filled')?.getAttribute('role')).toBe('status')
  })
})
