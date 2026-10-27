// @vitest-environment jsdom
// 사이드바 받기·보내기 줄 — 막힌 상태에서도 사라지지 않고, 목적지 버튼이 따로 있다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../../hooks/use-setup'
import type { SetupState } from '../../hooks/use-setup-state'
import { useWorkbench } from '../../store/workbench'
import { SyncLine } from './sync-line'
import { ShareLine } from './share-line'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const syncBase = {
  ahead: 0,
  aheadFiles: [],
  newDocs: [],
  held: null,
  skipped: null,
  shared: null,
  running: false,
  conflicts: [],
  received: 0,
  behind: 0,
  error: null,
  via: null,
  at: 'abc'
}

const setupWith = (sync: Record<string, unknown>): SetupState =>
  ({
    sync: { ...syncBase, ...sync },
    receiveTeamChanges: vi.fn(),
    refresh: vi.fn()
  }) as unknown as SetupState

const mount = (node: React.ReactNode, sync: Record<string, unknown>): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(<SetupContext.Provider value={setupWith(sync)}>{node}</SetupContext.Provider>)
  })
  return container
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

const byTestId = (container: HTMLElement, id: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${id}"]`)

const click = (el: HTMLElement): void => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('ShareLine', () => {
  it('승인 대기 중에도 줄이 남아 사유를 말한다', () => {
    const container = mount(<ShareLine />, {
      ahead: 2,
      aheadFiles: ['wiki/a.md'],
      skipped: 'review-pending'
    })
    expect(byTestId(container, 'sidebar-share-line')).not.toBeNull()
    expect(byTestId(container, 'sidebar-share-held')).not.toBeNull()
    expect(container.textContent).toContain('승인')
  })

  it('팀 확인 중에도 줄이 남아 사유를 말한다', () => {
    const container = mount(<ShareLine />, { held: 'docs/x' })
    expect(byTestId(container, 'sidebar-share-line')).not.toBeNull()
    expect(byTestId(container, 'sidebar-share-held')).not.toBeNull()
  })
})

describe('SyncLine', () => {
  it('상태 글자는 단추 안에 있지 않고 동작 버튼이 따로 있다', () => {
    const container = mount(<SyncLine />, { behind: 2 })
    const text = byTestId(container, 'sidebar-sync-text')
    expect(text).not.toBeNull()
    // 글자가 단추 안에 있으면 겉만 봐서는 어디로 가는지 모른다 — 분리해야 한다
    expect(text!.closest('button')).toBeNull()
    const action = byTestId(container, 'sidebar-sync')
    expect(action?.tagName).toBe('BUTTON')
    expect(action!.textContent).toContain('받기')
    expect(action!.classList.contains('min-h-6')).toBe(true)
  })

  it('상태 글자는 동작 버튼의 말을 되풀이하지 않는다', () => {
    const states: Record<string, unknown>[] = [
      { received: 11, via: 'merge' },
      { received: 0 },
      { behind: 2 },
      { error: '팀 변경을 받지 못했어요' },
      { conflicts: ['wiki/a.md'] },
      { skipped: 'signed-out' }
    ]
    for (const sync of states) {
      const container = mount(<SyncLine />, sync)
      const text = byTestId(container, 'sidebar-sync-text')!.textContent
      const label = byTestId(container, 'sidebar-sync')!.textContent
      expect(text).not.toMatch(/ · (다시 확인|다시 받기|받기|고르기|로그인)/)
      expect(label).not.toBe('')
    }
  })

  it('고르기 상태면 동작 버튼이 승인으로 간다', () => {
    useWorkbench.setState({ view: 'doc' })
    const container = mount(<SyncLine />, { conflicts: ['wiki/a.md'] })
    const action = byTestId(container, 'sidebar-sync')!
    expect(action.textContent).toContain('고르기')
    click(action)
    expect(useWorkbench.getState().view).toBe('knowledge')
    expect(useWorkbench.getState().knowledgeSection).toBe('review')
  })

  it('로그아웃 상태면 동작 버튼이 설정 GitHub로 간다', () => {
    useWorkbench.setState({ view: 'doc' })
    const container = mount(<SyncLine />, { skipped: 'signed-out' })
    const action = byTestId(container, 'sidebar-sync')!
    expect(action.textContent).toContain('로그인')
    click(action)
    expect(useWorkbench.getState().view).toBe('settings')
  })
})
