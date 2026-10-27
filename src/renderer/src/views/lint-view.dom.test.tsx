// @vitest-environment jsdom
// 점검 탭 — 고치고 돌아오면 목록이 최신이고, 다시 점검이 항상 닿으며, 만든 노트는 알린다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../store/workbench'
import { LintView } from './lint-view'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let changed: ((rels: string[]) => void) | null = null
const api = {
  lintWiki: vi.fn<() => Promise<unknown>>(),
  lintAiPages: vi.fn<() => Promise<number>>().mockResolvedValue(0),
  lintAiRun: vi.fn<() => Promise<unknown>>(),
  onLintAiEvent: (): (() => void) => () => undefined,
  onWikiChanged: (listener: (rels: string[]) => void): (() => void) => {
    changed = listener
    return () => {
      changed = null
    }
  }
}
;(window as unknown as { api: typeof api }).api = api

const report = { structure: [], verify: { status: 'pass' } }

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  api.lintWiki.mockReset()
  api.lintWiki.mockResolvedValue(report)
  changed = null
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useWorkbench.setState({ view: 'knowledge', knowledgeSection: 'lint', pages: [] })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const byTestId = (id: string): HTMLElement | null => host.querySelector(`[data-testid="${id}"]`)

describe('LintView', () => {
  it('목록이 있으면 다시 점검이 항상 닿는다', async () => {
    await act(async () => root.render(<LintView />))
    expect(byTestId('lint-refresh')).not.toBeNull()
    api.lintWiki.mockClear()
    await act(async () => byTestId('lint-refresh')?.click())
    expect(api.lintWiki).toHaveBeenCalledTimes(1)
  })

  it('옆 칸에서 고치고 돌아오면 목록을 다시 받는다 — 한 번에 한 번만', async () => {
    await act(async () => root.render(<LintView />))
    expect(api.lintWiki).toHaveBeenCalledTimes(1)
    await act(async () => changed?.(['wiki/a.md']))
    expect(api.lintWiki).toHaveBeenCalledTimes(2)
  })

  it('보고 있지 않을 때는 바뀌어도 다시 받지 않는다 — 돌아오면 진입 효과가 받는다', async () => {
    await act(async () => root.render(<LintView />))
    expect(api.lintWiki).toHaveBeenCalledTimes(1)
    await act(async () => useWorkbench.setState({ knowledgeSection: 'search' }))
    api.lintWiki.mockClear()
    await act(async () => changed?.(['wiki/a.md']))
    expect(api.lintWiki).not.toHaveBeenCalled()
    // 돌아오면 진입 효과가 처음부터 다시 받는다
    await act(async () => useWorkbench.setState({ knowledgeSection: 'lint' }))
    expect(api.lintWiki).toHaveBeenCalledTimes(1)
  })

  it('필터 뜻은 title이 아니라 읽히는 이름으로 간다', async () => {
    await act(async () => root.render(<LintView />))
    const filters = host.querySelector('[data-testid="lint-filters"]')
    expect(filters?.querySelector('[title]')).toBeNull()
    expect(filters?.textContent).toContain('어디에서도 안 열리는 페이지')
  })

  it('중간 등급 배지는 밝은 면에서 읽히는 primary-ink 글자다', async () => {
    api.lintAiRun.mockResolvedValue({
      status: 'found',
      findings: [
        { severity: 'medium', kind: 'suggestion', title: '제안', rel: 'a.md', detail: '내용' }
      ]
    })
    await act(async () => root.render(<LintView />))
    await act(async () => host.querySelector<HTMLElement>('[data-testid="lint-ai-start"]')?.click())
    await act(async () => host.querySelector<HTMLElement>('[data-testid="lint-ai-go"]')?.click())
    const badge = host.querySelector('[data-testid="lint-severity"]')!
    expect(badge.textContent).toBe('보통')
    expect(badge.classList.contains('text-primary-ink')).toBe(true)
    expect(badge.classList.contains('text-primary')).toBe(false)
  })

  it('구조 목록을 다시 받아도 진행 중인 AI 점검은 죽지 않는다', async () => {
    // 끝나지 않는 실행 — 바뀌는 동안에도 진행 표시가 살아 있어야 한다
    api.lintAiRun.mockReturnValue(new Promise<unknown>(() => {}))
    await act(async () => root.render(<LintView />))
    await act(async () => host.querySelector<HTMLElement>('[data-testid="lint-ai-start"]')?.click())
    await act(async () => host.querySelector<HTMLElement>('[data-testid="lint-ai-go"]')?.click())
    expect(host.querySelector('[data-testid="lint-ai-running"]')).not.toBeNull()
    // 옆에서 저장돼 구조 목록이 다시 와도 AI 칸은 그대로다
    await act(async () => changed?.(['wiki/a.md']))
    await act(async () => Promise.resolve())
    expect(host.querySelector('[data-testid="lint-ai-running"]')).not.toBeNull()
  })
})
