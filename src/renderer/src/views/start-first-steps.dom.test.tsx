// @vitest-environment jsdom
// 처음 3걸음 — 걸음이 자동으로 넘어가고, 버튼이 다음 화면으로 보낸다.
// e2e는 첫 상태와 채우기만 보고, done 전이와 이동은 여기서 잠근다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../hooks/use-setup'
import type { SetupState } from '../hooks/use-setup-state'
import type { Journey, VaultTreeEntry } from '../../../shared/ipc-contract'
import { ChatContext } from './chat/chat-context'
import type { ChatSession } from './chat/use-chat-session'
import { useWorkbench } from '../store/workbench'
import { FirstSteps } from './start-view'
import { dateKey } from '../lib/today-note'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const session = (over: Partial<ChatSession> = {}): ChatSession =>
  ({ draft: '', setDraft: vi.fn(), ...over }) as ChatSession

const setup = (journey: Journey | null): SetupState =>
  ({
    vault: 'ok',
    engine: 'ok',
    engineKind: 'claude',
    engineStatus: null,
    journey,
    remote: null,
    remoteKnown: true,
    github: null,
    sync: {} as SetupState['sync'],
    error: null,
    refresh: vi.fn(),
    refreshJourney: vi.fn(),
    receiveTeamChanges: vi.fn(),
    refreshGithub: vi.fn()
  }) as SetupState

const TODAY_REL = `private/${dateKey(new Date())}.md`
const noteEntry: VaultTreeEntry = { rel: TODAY_REL, kind: 'file', ext: '.md', mtimeMs: 1, size: 10 }

const saveChatToWiki = vi.fn(async () => ({ ok: true as const, path: 'Clippings/sample.md' }))

const mount = (journey: Journey | null, chat: ChatSession): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <SetupContext.Provider value={setup(journey)}>
        <ChatContext.Provider value={chat}>{<FirstSteps />}</ChatContext.Provider>
      </SetupContext.Provider>
    )
  })
  return container
}

const state = (container: HTMLElement, step: string): string | null =>
  container.querySelector(`[data-testid="start-first-${step}"]`)?.getAttribute('data-state') ?? null

const press = (container: HTMLElement, testId: string): void => {
  act(() => container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click())
}

beforeEach(() => {
  saveChatToWiki.mockClear()
  ;(window as unknown as { api: unknown }).api = {
    saveChatToWiki,
    readWikiPage: async () => ({ error: '없음' })
  }
  useWorkbench.setState({
    view: 'doc',
    selectedPage: null,
    chatOpen: true,
    chatTab: 'chat',
    knowledgeSection: 'sources',
    tree: [],
    editorDirty: false
  })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  delete (window as unknown as { api?: unknown }).api
})

describe('처음 3걸음', () => {
  it('처음에는 오늘 노트가 지금 단계이고 나머지는 나중이다', () => {
    const container = mount({ clippings: 0, ingested: false, merged: false }, session())
    expect(state(container, 'today')).toBe('current')
    expect(state(container, 'clip')).toBe('later')
    expect(state(container, 'approve')).toBe('later')
  })

  it('아직 확인 중이면 걸음은 checking이지만 오늘 노트 만들기는 가리지 않는다', () => {
    const container = mount(null, session())
    expect(state(container, 'today')).toBe('checking')
    expect(container.querySelector('[data-testid="first-today-chat"]')).not.toBeNull()
  })

  it('오늘 노트가 생기면 자료가 지금 단계가 된다', () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const container = mount({ clippings: 0, ingested: false, merged: false }, session())
    expect(state(container, 'today')).toBe('done')
    expect(state(container, 'clip')).toBe('current')
    expect(container.querySelector('[data-testid="first-sources"]')).not.toBeNull()
  })

  it('위키화를 마치면 승인이 지금 단계, 병합하면 첫 성공이 뜬다', () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const doing = mount({ clippings: 0, ingested: true, merged: false }, session())
    expect(state(doing, 'clip')).toBe('done')
    expect(state(doing, 'approve')).toBe('current')
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.body.innerHTML = ''
    const done = mount({ clippings: 0, ingested: true, merged: true }, session())
    expect(done.querySelector('[data-testid="start-first-list"]')).toBeNull()
    expect(done.textContent).toContain('첫 위키를 마쳤어요')
  })

  it('채팅 만들기는 보내지 않고 입력칸에 채우고 채팅으로 간다', () => {
    const chat = session()
    const container = mount({ clippings: 0, ingested: false, merged: false }, chat)
    press(container, 'first-today-chat')
    expect(chat.setDraft).toHaveBeenCalledWith('오늘 노트 만들어줘')
    expect(useWorkbench.getState().chatTab).toBe('chat')
  })

  it('오늘 노트 열기·자료 넣기·승인 보기는 다음 화면으로 간다', () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const container = mount({ clippings: 0, ingested: false, merged: false }, session())
    press(container, 'first-today-open')
    expect(useWorkbench.getState().selectedPage).toBe(TODAY_REL)
    press(container, 'first-sources')
    expect(useWorkbench.getState().view).toBe('knowledge')
    expect(useWorkbench.getState().knowledgeSection).toBe('sources')
  })

  it('자료가 기다리면 위키화 시작이 옆 칸 위키화 탭을 연다', () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const container = mount({ clippings: 2, ingested: false, merged: false }, session())
    press(container, 'first-ingest')
    expect(useWorkbench.getState().chatTab).toBe('ingest')
  })

  it('승인 보기는 지식 관리 승인 구역으로 간다', () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const container = mount({ clippings: 0, ingested: true, merged: false }, session())
    press(container, 'first-review')
    expect(useWorkbench.getState().view).toBe('knowledge')
    expect(useWorkbench.getState().knowledgeSection).toBe('review')
  })

  it('예시 글은 한 번만 나가고 같은 틱 연타를 막는다', async () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const container = mount({ clippings: 0, ingested: false, merged: false }, session())
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="first-sample"]')!.click()
      container.querySelector<HTMLButtonElement>('[data-testid="first-sample"]')!.click()
      await Promise.resolve()
    })
    expect(saveChatToWiki).toHaveBeenCalledTimes(1)
    expect(saveChatToWiki).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'onboarding:sample' })
    )
  })

  it('완료된 걸음의 단추는 테두리 — 채움은 지금 걸음 하나만이다', () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const container = mount({ clippings: 0, ingested: false, merged: false }, session())
    // today done(테두리) + clip current(채움)
    expect(container.querySelector('[data-testid="first-today-open"]')!.className).not.toContain(
      'bg-primary'
    )
    expect(container.querySelector('[data-testid="first-sources"]')!.className).toContain(
      'bg-primary'
    )
  })

  it('오늘 노트 만들기가 지금 단계면 그 단추가 채움이다', () => {
    const container = mount({ clippings: 0, ingested: false, merged: false }, session())
    expect(container.querySelector('[data-testid="first-today-chat"]')!.className).toContain(
      'bg-primary'
    )
  })
})
