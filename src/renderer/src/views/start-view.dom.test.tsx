// @vitest-environment jsdom
// 시작하기 화면 — 제목 위계(h1 text-title, 섹션 h2, 건너뜀 없음)와
// 채움 단추는 상황에 맞는 하나(다음 할 일)뿐이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../hooks/use-setup'
import type { SetupState } from '../hooks/use-setup-state'
import type { Journey, VaultTreeEntry } from '../../../shared/ipc-contract'
import { ChatContext } from './chat/chat-context'
import type { ChatSession } from './chat/use-chat-session'
import { ViewContext } from '../components/layout/view-id'
import { useWorkbench } from '../store/workbench'
import { StartView } from './start-view'
import { dateKey } from '../lib/today-note'
import { applyLanguage } from '../lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const session = (): ChatSession => ({ draft: '', setDraft: vi.fn() }) as unknown as ChatSession

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

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    saveChatToWiki: vi.fn(async () => ({ ok: true as const, path: 'Clippings/sample.md' })),
    readWikiPage: async () => ({ error: '없음' }),
    getVaultStatus: async () => ({ vaultDir: '/tmp/vault' }),
    getOnboardingPurpose: async () => null
  }
  useWorkbench.setState({
    view: 'start',
    selectedPage: null,
    chatOpen: true,
    chatTab: 'chat',
    knowledgeSection: 'sources',
    tree: [],
    editorDirty: false
  })
})

afterEach(() => {
  act(() => applyLanguage('ko'))
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  delete (window as unknown as { api?: unknown }).api
  localStorage.clear()
})

const mountStart = (journey: Journey | null): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <SetupContext.Provider value={setup(journey)}>
        <ChatContext.Provider value={session()}>
          <ViewContext.Provider value="start">{<StartView />}</ViewContext.Provider>
        </ChatContext.Provider>
      </SetupContext.Provider>
    )
  })
  return container
}

const headingLevels = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('h1, h2, h3, h4')].map((el) => el.tagName)

/** 완료 배너 + 처음 3걸음 안에서 채움 단추가 몇 개인가 — 화면의 Spark 는 하나다 */
const filledCount = (container: HTMLElement): number =>
  [
    ...container.querySelectorAll(
      '[data-testid="start-complete"] button, [data-testid="start-first-steps"] button'
    )
  ].filter((el) => el.className.includes('bg-primary')).length

describe('시작하기', () => {
  it('제목은 h1 text-title에서 h2로 이어지고 건너뜀이 없다', () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const container = mountStart({ clippings: 0, ingested: false, merged: false })
    const h1 = container.querySelector('h1')!
    expect(h1.textContent).toBe('시작하기')
    expect(h1.className).toContain('text-title')
    expect(container.querySelectorAll('h4')).toHaveLength(0)
    const levels = headingLevels(container)
    expect(levels[0]).toBe('H1')
    let maxSeen = 1
    for (const tag of levels) {
      const n = Number(tag.slice(1))
      expect(n).toBeLessThanOrEqual(maxSeen + 1)
      maxSeen = Math.max(maxSeen, n)
    }
  })

  it('걸음이 남았으면 채움은 지금 걸음 하나 — 완료 배너는 테두리다', () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const container = mountStart({ clippings: 0, ingested: false, merged: false })
    // today done + clip current: 채움은 자료 넣기 하나
    expect(container.querySelector('[data-testid="first-sources"]')!.className).toContain(
      'bg-primary'
    )
    const banner = container.querySelector('[data-testid="start-complete"] button')!
    expect(banner.className).not.toContain('bg-primary')
    expect(filledCount(container)).toBe(1)
  })

  it('오늘 노트가 없으면 채팅 만들기가 채움 — 배너는 테두리다', () => {
    const container = mountStart({ clippings: 0, ingested: false, merged: false })
    expect(container.querySelector('[data-testid="first-today-chat"]')!.className).toContain(
      'bg-primary'
    )
    const banner = container.querySelector('[data-testid="start-complete"] button')!
    expect(banner.className).not.toContain('bg-primary')
    expect(filledCount(container)).toBe(1)
  })

  it('다 끝났으면 완료 배너가 채움이다', () => {
    useWorkbench.setState({ tree: [noteEntry] })
    const container = mountStart({ clippings: 0, ingested: true, merged: true })
    const banner = container.querySelector('[data-testid="start-complete"] button')!
    expect(banner.className).toContain('bg-primary')
    expect(filledCount(container)).toBe(1)
  })

  it('설정에서 왔으면 설정으로 돌아가는 단추가 있고, 누르면 돌아간다', () => {
    useWorkbench.setState({ startFrom: 'settings' })
    const container = mountStart({ clippings: 0, ingested: false, merged: false })
    const back = container.querySelector<HTMLElement>('[data-testid="back-to-settings"]')
    expect(back).not.toBeNull()
    act(() => back!.click())
    expect(useWorkbench.getState().view).toBe('settings')
    expect(useWorkbench.getState().startFrom).toBeNull()
  })

  it('처음 온 시작하기에는 돌아가기 단추가 없다', () => {
    useWorkbench.setState({ startFrom: null })
    const container = mountStart({ clippings: 0, ingested: false, merged: false })
    expect(container.querySelector('[data-testid="back-to-settings"]')).toBeNull()
  })
})

describe('첫 실행 시작하기 — 질문 → AI 연결 → GitHub → 보관함', () => {
  const firstRunSetup = (over: Partial<SetupState>): SetupState => ({
    ...setup(null),
    vault: 'none',
    engine: 'ok',
    github: { loggedIn: false },
    ...over
  })

  const mountFirstRun = async (
    over: Partial<SetupState>,
    api: Record<string, unknown> = {}
  ): Promise<HTMLElement> => {
    Object.assign((window as unknown as { api: Record<string, unknown> }).api, api)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    await act(async () => {
      root.render(
        <SetupContext.Provider value={firstRunSetup(over)}>
          <ChatContext.Provider value={session()}>
            <ViewContext.Provider value="start">{<StartView />}</ViewContext.Provider>
          </ChatContext.Provider>
        </SetupContext.Provider>
      )
    })
    return container
  }

  const byTestId = (container: HTMLElement, id: string): HTMLElement | null =>
    container.querySelector(`[data-testid="${id}"]`)
  const stateOf = (container: HTMLElement, step: string): string | null =>
    byTestId(container, `start-step-${step}`)!.getAttribute('data-state')

  it('답이 없으면 질문부터 묻고, 머리에 몇 단계 중 몇 단계인지 보인다', async () => {
    const container = await mountFirstRun({ engine: 'missing' })
    expect(stateOf(container, 'purpose')).toBe('current')
    expect(byTestId(container, 'purpose-ask')).not.toBeNull()
    expect(container.querySelector('header, h1')!.parentElement!.textContent).toContain(
      '5단계 중 1단계'
    )
  })

  it('질문에 답하면 저장하고 다음 단계로 간다 — AI가 연결돼 있으면 github 로그인이다', async () => {
    const setOnboardingPurpose = vi.fn(async (text: string) => text)
    const container = await mountFirstRun({}, { setOnboardingPurpose })
    const input = byTestId(container, 'purpose-answer') as HTMLInputElement
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setValue.call(input, '팀 운영 지식 모으기')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => byTestId(container, 'purpose-save')!.click())
    expect(setOnboardingPurpose).toHaveBeenCalledWith('팀 운영 지식 모으기')
    expect(stateOf(container, 'purpose')).toBe('done')
    expect(byTestId(container, 'start-step-purpose')!.textContent).toContain('팀 운영 지식 모으기')
    expect(stateOf(container, 'github')).toBe('current')
    expect(byTestId(container, 'github-private-note')!.textContent).toContain('비공개 저장소')
  })

  it('github 나중에 하기를 누르면 로그인 없이 이 컴퓨터에 보관함을 만든다', async () => {
    const createStarterVault = vi.fn(async () => ({
      vaultDir: '/docs/2nd-brain',
      valid: true,
      missing: [],
      starter: { via: 'local' as const }
    }))
    const container = await mountFirstRun(
      {},
      { getOnboardingPurpose: async () => '답', createStarterVault }
    )
    expect(stateOf(container, 'github')).toBe('current')
    act(() => byTestId(container, 'github-later')!.click())
    expect(stateOf(container, 'github')).toBe('done')
    expect(stateOf(container, 'vault')).toBe('current')
    // 폴더를 고르지 않는다 — 고르기는 접힌 칸에 있다
    await act(async () => byTestId(container, 'vault-starter-create')!.click())
    expect(createStarterVault).toHaveBeenCalledWith({ github: false, pickParent: false })
  })

  it('github 에 로그인했으면 보관함을 내 GitHub 에 만든다고 밝히고 만든다', async () => {
    const createStarterVault = vi.fn(async () => ({
      vaultDir: '/docs/2nd-brain',
      valid: true,
      missing: [],
      starter: { via: 'template' as const, repo: 'kim/2nd-brain' }
    }))
    const container = await mountFirstRun(
      { github: { loggedIn: true, login: 'kim' } },
      { getOnboardingPurpose: async () => '답', createStarterVault }
    )
    expect(stateOf(container, 'github')).toBe('done')
    expect(stateOf(container, 'vault')).toBe('current')
    const step = byTestId(container, 'start-step-vault')!
    expect(step.textContent).toContain('비공개 저장소')
    await act(async () => byTestId(container, 'vault-starter-create')!.click())
    expect(createStarterVault).toHaveBeenCalledWith({ github: true, pickParent: false })
  })

  it('github 에 올리지 못했으면 보관함은 열고 무엇이 안 됐는지 보인다', async () => {
    const createStarterVault = vi.fn(async () => ({
      vaultDir: '/docs/2nd-brain',
      valid: true,
      missing: [],
      starter: { via: 'skeleton' as const, publishError: '저장소를 만들지 못했어요' }
    }))
    const container = await mountFirstRun(
      { github: { loggedIn: true, login: 'kim' } },
      { getOnboardingPurpose: async () => '답', createStarterVault }
    )
    await act(async () => byTestId(container, 'vault-starter-create')!.click())
    expect(byTestId(container, 'starter-publish-error')!.textContent).toContain(
      'GitHub에 올리지 못했어요'
    )
  })

  it('github 에 못 올렸어도 원격이 붙어 있으면 낡은 실패 알림을 보이지 않는다', async () => {
    const createStarterVault = vi.fn(async () => ({
      vaultDir: '/docs/2nd-brain',
      valid: true,
      missing: [],
      starter: { via: 'skeleton' as const, publishError: '저장소를 만들지 못했어요' }
    }))
    const container = await mountFirstRun(
      {
        github: { loggedIn: true, login: 'kim' },
        remote: {
          url: 'https://github.com/kim/2nd-brain.git',
          webUrl: 'https://github.com/kim/2nd-brain'
        }
      },
      { getOnboardingPurpose: async () => '답', createStarterVault }
    )
    await act(async () => byTestId(container, 'vault-starter-create')!.click())
    expect(byTestId(container, 'starter-publish-error')).toBeNull()
  })

  it('보관함을 만들지 못하면 사유와 다시 만들기를 보인다', async () => {
    const createStarterVault = vi.fn(async () => ({
      vaultDir: null,
      valid: false,
      missing: [],
      error: 'GitHub 로그인을 확인하지 못했어요'
    }))
    const container = await mountFirstRun(
      { github: { loggedIn: true, login: 'kim' } },
      { getOnboardingPurpose: async () => '답', createStarterVault }
    )
    await act(async () => byTestId(container, 'vault-starter-create')!.click())
    expect(byTestId(container, 'vault-error')!.textContent).toContain('GitHub 로그인을 확인하지')
    expect(byTestId(container, 'vault-starter-create')!.textContent).toContain('다시 만들기')
  })

  it('시작하기를 끝낸 적 있는 사람은 질문·github 단계를 보지 않는다', async () => {
    localStorage.setItem('second-brain.start.done', '1')
    const container = await mountFirstRun({ vault: 'none' })
    expect(byTestId(container, 'start-step-purpose')).toBeNull()
    expect(byTestId(container, 'start-step-github')).toBeNull()
    expect(stateOf(container, 'vault')).toBe('current')
    // 예전처럼 고른 곳에 만드는 보관함 만들기다
    expect(byTestId(container, 'vault-create')).not.toBeNull()
    expect(byTestId(container, 'vault-starter-create')).toBeNull()
  })
})

describe('GitHub에 올리기 — 원격 없는 준비 완료 보관함', () => {
  const mountReady = async (remote: SetupState['remote']): Promise<HTMLElement> => {
    localStorage.setItem('second-brain.start.done', '1')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    await act(async () => {
      root.render(
        <SetupContext.Provider
          value={{
            ...setup(null),
            remote,
            sync: {
              ahead: 0,
              aheadFiles: [],
              newDocs: [],
              conflicts: []
            } as unknown as SetupState['sync']
          }}
        >
          <ChatContext.Provider value={session()}>
            <ViewContext.Provider value="start">{<StartView />}</ViewContext.Provider>
          </ChatContext.Provider>
        </SetupContext.Provider>
      )
    })
    return container
  }
  const step = (container: HTMLElement): HTMLElement =>
    container.querySelector('[data-testid="start-step-publish"]')!

  it('원격이 없으면 GitHub에 올리기가 지금 걸음이고 올리기 칸이 펼쳐져 있다', async () => {
    const container = await mountReady(null)
    expect(step(container).getAttribute('data-state')).toBe('current')
    expect(step(container).textContent).toContain('GitHub에 올리기')
    expect(step(container).querySelector('[data-testid="team-repo"]')).not.toBeNull()
    // 접힌 팀 저장소 칸과 겹쳐 그리지 않는다 — 같은 칸이 두 벌이면 폴링도 겹친다
    expect(container.querySelector('[data-testid="start-team-toggle"]')).toBeNull()
  })

  it('원격이 붙어 있으면 끝난 걸음이고 어느 저장소인지 보인다', async () => {
    const container = await mountReady({
      url: 'https://github.com/kim/notes.git',
      webUrl: 'https://github.com/kim/notes'
    })
    expect(step(container).getAttribute('data-state')).toBe('done')
    expect(step(container).textContent).toContain('kim/notes')
  })

  it('이 화면에서 올렸으면 걸음은 끝나도 올리기 칸을 접지 않는다 — 성공 줄이 남는다', async () => {
    localStorage.setItem('second-brain.start.done', '1')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    const render = (remote: SetupState['remote']): void =>
      root.render(
        <SetupContext.Provider
          value={{
            ...setup(null),
            remote,
            sync: {
              ahead: 0,
              aheadFiles: [],
              newDocs: [],
              conflicts: []
            } as unknown as SetupState['sync']
          }}
        >
          <ChatContext.Provider value={session()}>
            <ViewContext.Provider value="start">{<StartView />}</ViewContext.Provider>
          </ChatContext.Provider>
        </SetupContext.Provider>
      )
    await act(async () => render(null))
    const before = step(container).querySelector('[data-testid="team-repo"]')
    await act(async () =>
      render({ url: 'https://github.com/kim/notes.git', webUrl: 'https://github.com/kim/notes' })
    )
    expect(step(container).getAttribute('data-state')).toBe('done')
    // 같은 걸음 안의 칸이 그대로 — 접힌 칸으로 옮겨 새로 그리면 방금 올린 결과 줄이 사라진다(e2e loginAndConnect)
    expect(before).not.toBeNull()
    expect(step(container).querySelector('[data-testid="team-repo"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="start-team-toggle"]')).toBeNull()
  })

  it('머리에 GitHub에 올리기는 나중에 해도 된다고 말한다 — 준비는 끝났다', async () => {
    const container = await mountReady(null)
    expect(container.querySelector('header')!.textContent).toContain('준비를 마쳤어요')
    expect(container.querySelector('header')!.textContent).toContain('나중에 해도 돼요')
  })
})

describe('시작하기 — 언어 고르기', () => {
  it('저장에 실패하면 바꾼 언어로 알리고, 다시 눌러 저장되면 알림을 걷는다', async () => {
    const setLanguage = vi
      .fn<(language: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('EACCES'))
      .mockResolvedValue(undefined)
    ;(window as unknown as { api: Record<string, unknown> }).api.setLanguage = setLanguage
    const container = mountStart({ clippings: 0, ingested: false, merged: false })
    const click = async (testId: string): Promise<void> => {
      await act(async () => {
        container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click()
      })
    }

    await click('start-language-en')
    const error = container.querySelector('[data-testid="start-language-error"]')
    expect(error?.textContent).toContain("Couldn't save this setting")
    expect(container.querySelector('h1')!.textContent).toBe('Get started')

    await click('start-language-en')
    expect(container.querySelector('[data-testid="start-language-error"]')).toBeNull()
    expect(setLanguage).toHaveBeenCalledTimes(2)
  })
})
