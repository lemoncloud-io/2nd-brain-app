// @vitest-environment jsdom
// 그래프 툴바의 성장 재생 버튼 — 이름과 눌림 상태가 재생 여부를 그대로 말한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { buildGraph } from '../../../shared/wiki/graph'
import type { GrowthState } from '../lib/graph-growth'
import { GraphToolbar } from './graph-toolbar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const graph = buildGraph([
  { rel: 'wiki/a.md', slug: 'a', frontmatter: {}, links: [{ target: 'b' }] },
  { rel: 'wiki/b.md', slug: 'b', frontmatter: {}, links: [] }
])

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (growth: GrowthState, onGrowth = vi.fn()): HTMLButtonElement => {
  act(() =>
    root.render(
      <GraphToolbar
        graph={graph}
        filter={{ kinds: new Set(['page', 'system', 'ghost']), community: null }}
        onFilter={vi.fn()}
        onRefresh={vi.fn()}
        onFit={vi.fn()}
        growth={growth}
        onGrowth={onGrowth}
      />
    )
  )
  return container.querySelector('[data-testid="graph-growth"]') as HTMLButtonElement
}

describe('GraphToolbar 성장 재생 버튼', () => {
  it('멈춰 있으면 "성장 재생" 이고 눌리지 않은 상태다', () => {
    const onGrowth = vi.fn()
    const button = render('idle', onGrowth)
    expect(button.getAttribute('aria-label')).toBe('성장 재생')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    act(() => button.click())
    expect(onGrowth).toHaveBeenCalledOnce()
  })

  it('재생 중이면 이름은 그대로 두고 눌린 상태로 말한다', () => {
    const button = render('playing')
    expect(button.getAttribute('aria-label')).toBe('성장 재생')
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('자리가 잡히기 전에는 누를 수 없다', () => {
    const onGrowth = vi.fn()
    const button = render('unready', onGrowth)
    expect(button.disabled).toBe(true)
    act(() => button.click())
    expect(onGrowth).not.toHaveBeenCalled()
  })

  it('성장 재생은 더 보기 없이 바로 보인다', () => {
    render('idle')
    expect(container.querySelector('[data-testid="graph-more"]')).toBeNull()
    expect(container.querySelector('[data-testid="graph-growth"]')).not.toBeNull()
  })

  it('한 줄이다 — 줄바꿈 없이 가로 한 줄로만 흐른다', () => {
    render('idle')
    const bar = container.firstElementChild
    expect(bar?.className).toContain('flex-nowrap')
    expect(bar?.className).not.toContain('flex-wrap')
  })

  it('필터 칩은 점검과 같은 rounded-sm이다 (알약 rounded-full 밖)', () => {
    render('idle')
    const chips = [...container.querySelectorAll('[data-testid^="graph-kind-"]')]
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      expect(chip.className).toContain('rounded-sm')
      expect(chip.className).not.toContain('rounded-full')
    }
  })
})

const renderGraph = (g: typeof graph): void => {
  act(() =>
    root.render(
      <GraphToolbar
        graph={g}
        filter={{ kinds: new Set(['page', 'system', 'ghost']), community: null }}
        onFilter={vi.fn()}
        onRefresh={vi.fn()}
        onFit={vi.fn()}
        growth="idle"
        onGrowth={vi.fn()}
      />
    )
  )
}

describe('GraphToolbar 개수 말', () => {
  it('수는 종류 칩이 들고 있어 개수 줄을 두지 않는다 — test: toolbar counts', () => {
    render('idle')
    expect(container.querySelector('[data-testid="graph-counts"]')).toBeNull()
    expect(container.querySelector('[data-testid="graph-kind-page"]')).not.toBeNull()
  })

  it('범례에 중간값이 보인다 — test: toolbar legend mid', () => {
    render('idle')
    expect(container.querySelector('[data-testid="graph-stellar-legend"]')?.textContent).toContain(
      '중간'
    )
  })

  it('상한을 넘는 허브가 있으면 실제 최대 수를 적는다 — test: toolbar legend max', () => {
    const spokes = Array.from({ length: 60 }, (_, i) => ({
      rel: `wiki/n${i}.md`,
      slug: `n${i}`,
      frontmatter: {},
      links: [{ target: 'hub' }]
    }))
    renderGraph(
      buildGraph([{ rel: 'wiki/hub.md', slug: 'hub', frontmatter: {}, links: [] }, ...spokes])
    )
    expect(container.querySelector('[data-testid="graph-stellar-legend"]')?.textContent).toContain(
      '60개'
    )
  })

  it('주제 무리 고르개는 상위 30개만 — test: toolbar community top', () => {
    const isolated = Array.from({ length: 40 }, (_, i) => ({
      rel: `wiki/p${i}.md`,
      slug: `p${i}`,
      frontmatter: {},
      links: []
    }))
    renderGraph(buildGraph(isolated))
    const options = container.querySelectorAll('[data-testid="graph-community"] option')
    expect(options.length).toBeLessThanOrEqual(31)
    expect(options.length).toBeGreaterThan(1)
  })

  it('범례는 그림으로 읽힌다 — test: toolbar legend role', () => {
    render('idle')
    const legend = container.querySelector('[data-testid="graph-stellar-legend"]')
    expect(legend?.getAttribute('role')).toBe('img')
    expect(legend?.getAttribute('aria-label')).toContain('중간')
  })
})
