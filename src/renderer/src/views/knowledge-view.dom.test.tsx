// @vitest-environment jsdom
// 구역을 옮겨도 언마운트하지 않는가 — 돌아왔을 때 그래프 배치·검색 결과·진행 중인 일이 남아야 한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../hooks/use-setup'
import type { SetupState } from '../hooks/use-setup-state'
import { useWorkbench } from '../store/workbench'
import { applyLanguage } from '../lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// 구역의 알맹이는 여기서 볼 것이 아니다 — 마운트가 유지되는지만 본다.
// 각 대역은 몇 번 마운트됐는지 센다
const mounts: Record<string, number> = {}
const probe = (name: string): (() => React.JSX.Element) => {
  const Probe = (): React.JSX.Element => {
    // 렌더가 아니라 마운트를 센다 — 다시 그리는 것은 괜찮고, 다시 마운트되는 것이 문제다
    useEffect(() => {
      mounts[name] = (mounts[name] ?? 0) + 1
    }, [])
    return <p data-testid={`probe-${name}`}>{name}</p>
  }
  Probe.displayName = `Probe(${name})`
  return Probe
}
vi.mock('./sources-section', () => ({ SourcesSection: probe('sources') }))
vi.mock('./search-view', () => ({ SearchView: probe('search') }))
vi.mock('./graph-view', () => ({ GraphView: probe('graph') }))
vi.mock('./lint-view', () => ({ LintView: probe('lint') }))
vi.mock('../pages/ReviewSection', () => ({ ReviewSection: probe('review') }))

const { KnowledgeView } = await import('./knowledge-view')

const roots: Root[] = []
// 구역 탭의 수 — 승인 대기 2, 검토 항목 0(지운 것은 안 센다)
beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    listReview: async () => ({ pages: [{}, {}] }),
    listReviewItems: async () => [{ dismissed: true }],
    onWikiChanged: () => () => undefined
  }
})
afterEach(() => {
  delete (window as unknown as { api?: unknown }).api
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  for (const key of Object.keys(mounts)) delete mounts[key]
})

const mount = (): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<KnowledgeView />))
  return container
}

const panelOf = (container: HTMLElement, id: string): HTMLElement =>
  container.querySelector<HTMLElement>(`#knowledge-panel-${id}`)!

describe('지식 관리', () => {
  it('구역 탭에 그 구역의 쌓인 수가 보인다 — 없는 것은 숫자를 달지 않는다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'sources' })
    const container = mount()
    await act(async () => undefined)
    expect(container.querySelector('[data-testid="knowledge-count-review"]')?.textContent).toBe('2')
    expect(container.querySelector('[data-testid="knowledge-count-lint"]')).toBeNull()
  })

  it('구역 탭 이름은 수의 뜻까지 읽힌다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'sources' })
    const container = mount()
    await act(async () => undefined)
    const review = container.querySelector('[data-testid="knowledge-tab-review"]')
    expect(review?.getAttribute('aria-label')).toContain('승인')
    expect(review?.getAttribute('aria-label')).toContain('2')
  })

  it('화면 언어를 영어로 바꾸면 구역 탭 이름과 수의 뜻이 바로 영어가 된다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'sources' })
    const container = mount()
    await act(async () => undefined)
    try {
      act(() => applyLanguage('en'))
      const review = container.querySelector('[data-testid="knowledge-tab-review"]')
      expect(review?.textContent).toContain('Approvals')
      expect(review?.getAttribute('aria-label')).toBe('Approvals — 2 awaiting approval')
      expect(container.querySelector('[data-testid="knowledge-tab-lint"]')?.textContent).toContain(
        'Check'
      )
    } finally {
      act(() => applyLanguage('ko'))
    }
  })

  it('구역 탭은 체계 radius(sm 4px)를 쓴다 — 5px 임의값 밖이다', async () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'sources' })
    const container = mount()
    await act(async () => undefined)
    const tabs = [...container.querySelectorAll('[data-testid^="knowledge-tab-"]')]
    expect(tabs.length).toBeGreaterThan(0)
    for (const tab of tabs) {
      expect(tab.classList.contains('rounded-sm')).toBe(true)
      expect(tab.className).not.toContain('rounded-[')
    }
  })

  it('구역을 옮겨도 다시 마운트하지 않는다 — 보이기만 바뀐다', () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'sources' })
    const container = mount()
    expect(mounts).toEqual({ sources: 1, search: 1, graph: 1, lint: 1, review: 1 })
    expect(panelOf(container, 'sources').className).toContain('flex')
    expect(panelOf(container, 'graph').className).toContain('hidden')

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="knowledge-tab-graph"]')!.click()
    })
    expect(useWorkbench.getState().knowledgeSection).toBe('graph')
    expect(panelOf(container, 'graph').className).toContain('flex')
    expect(panelOf(container, 'sources').className).toContain('hidden')
    // 마운트 수가 그대로다 = 숨긴 구역이 살아 있다
    expect(mounts).toEqual({ sources: 1, search: 1, graph: 1, lint: 1, review: 1 })
  })

  it('중앙이 지식 관리를 떠나도 구역들은 마운트된 채다 — 다시 오면 그 자리다', () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'lint' })
    mount()
    act(() => useWorkbench.getState().setView('doc'))
    expect(mounts).toEqual({ sources: 1, search: 1, graph: 1, lint: 1, review: 1 })
    expect(useWorkbench.getState().knowledgeSection).toBe('lint')
  })

  it('첫걸음이 남았으면 준비가 끝났어도 처음 3걸음으로 돌아가는 버튼이 있다', () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'sources', tree: [] })
    const setup = {
      vault: 'ok',
      engine: 'ok',
      journey: { clippings: 0, ingested: false, merged: false }
    } as unknown as SetupState
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => {
      root.render(
        <SetupContext.Provider value={setup}>
          <KnowledgeView />
        </SetupContext.Provider>
      )
    })
    const back = container.querySelector<HTMLElement>('[data-testid="knowledge-back-start"]')
    expect(back).not.toBeNull()
    act(() => back!.click())
    expect(useWorkbench.getState().view).toBe('start')
  })

  it('첫걸음을 다 끝냈으면 돌아가기 버튼이 없다', async () => {
    const { dateKey } = await import('../lib/today-note')
    const today = dateKey(new Date())
    useWorkbench.setState({
      view: 'knowledge',
      knowledgeSection: 'sources',
      tree: [{ rel: `private/${today}.md`, kind: 'file', ext: '.md', mtimeMs: 1, size: 0 }]
    })
    const setup = {
      vault: 'ok',
      engine: 'ok',
      journey: { clippings: 0, ingested: true, merged: true }
    } as unknown as SetupState
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => {
      root.render(
        <SetupContext.Provider value={setup}>
          <KnowledgeView />
        </SetupContext.Provider>
      )
    })
    expect(container.querySelector('[data-testid="knowledge-back-start"]')).toBeNull()
  })

  it('확인 중(아직 모름)에는 돌아가기 버튼이 없다', () => {
    useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'sources', tree: null })
    const setup = { journey: null } as unknown as SetupState
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => {
      root.render(
        <SetupContext.Provider value={setup}>
          <KnowledgeView />
        </SetupContext.Provider>
      )
    })
    expect(container.querySelector('[data-testid="knowledge-back-start"]')).toBeNull()
  })
})
