// @vitest-environment jsdom
// 탭 띠가 store 와 같은 것을 보이는가 — 켜진 탭의 이름은 접어 둔 칸이 아니라 지금 자리에서 온다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../../store/workbench'
import { EMPTY_HISTORY } from '../../store/history'
import { emptyTab } from '../../store/tabs'
import { DocTabs } from './doc-tabs'

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
    history: EMPTY_HISTORY,
    selectedPage: null,
    selectedSource: null,
    docMode: 'page',
    editing: null,
    editorDirty: false,
    pendingNavigation: null,
    pages: [{ rel: 'wiki/a.md', title: 'A' }] as never
  })
})

const mount = (): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<DocTabs />))
  return container
}

const labels = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-testid="doc-tab"]')].map((el) => el.textContent ?? '')

describe('탭 띠', () => {
  it('탭은 문서 자리 패널을 가리킨다 — 스크린리더가 탭과 자리를 잇는다', () => {
    const container = mount()
    const tab = container.querySelector('[data-testid="doc-tab"]')
    expect(tab?.getAttribute('role')).toBe('tab')
    expect(tab?.getAttribute('aria-controls')).toBe('doc-panel')
  })

  it('탭 이름은 전체 자리까지 읽힌다', () => {
    act(() => useWorkbench.getState().navigate('wiki/a.md'))
    const container = mount()
    const tab = container.querySelector('[data-testid="doc-tab"]')
    expect(tab?.getAttribute('title')).toBeNull()
    expect(tab?.getAttribute('aria-label')).toContain('wiki/a.md')
  })
  it('켜진 탭의 이름은 지금 보고 있는 문서다', () => {
    const container = mount()
    expect(labels(container)).toEqual(['새 탭'])
    act(() => useWorkbench.getState().navigate('wiki/a.md'))
    expect(labels(container)).toEqual(['a'])
  })

  it('새 탭을 누르면 한 장이 늘고 그 탭이 켜진다', () => {
    act(() => useWorkbench.getState().navigate('wiki/a.md'))
    const container = mount()
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="doc-tab-new"]')!.click())
    expect(labels(container)).toEqual(['a', '새 탭'])
    expect(
      container.querySelectorAll('[data-testid="doc-tab"]')[1].getAttribute('aria-selected')
    ).toBe('true')
  })

  it('탭을 누르면 그 탭이 보던 문서로 돌아간다', () => {
    act(() => useWorkbench.getState().navigate('wiki/a.md'))
    act(() => useWorkbench.getState().openFile('projects/p/plan.md', true))
    const container = mount()
    expect(labels(container)).toEqual(['a', 'plan'])
    act(() => (container.querySelectorAll('[data-testid="doc-tab"]')[0] as HTMLElement).click())
    expect(useWorkbench.getState().selectedPage).toBe('wiki/a.md')
  })

  it('다른 폴더의 같은 이름 문서 둘을 띄우면 탭이 서로 다른 글자로 보인다', () => {
    act(() => useWorkbench.getState().openFile('projects/dm-leave-rejoin/PLAN.md'))
    act(() => useWorkbench.getState().openFile('projects/app-docs-tree/PLAN.md', true))
    const [first, second] = labels(mount())
    expect(first).not.toBe(second)
  })

  it('닫기 단추는 한 장뿐일 때 숨는다 — 눌러도 그대로인 단추를 두지 않는다', () => {
    const container = mount()
    expect(container.querySelectorAll('[data-testid="doc-tab-close"]')).toHaveLength(0)
    act(() => useWorkbench.getState().newTab())
    expect(container.querySelectorAll('[data-testid="doc-tab-close"]')).toHaveLength(2)
    act(() =>
      (container.querySelectorAll('[data-testid="doc-tab-close"]')[1] as HTMLElement).click()
    )
    expect(useWorkbench.getState().tabs).toHaveLength(1)
  })

  it('tablist 직속 자식은 tab뿐이다 — 닫기는 탭 안에 든다 (axe aria-required-children)', () => {
    act(() => useWorkbench.getState().newTab())
    const container = mount()
    const tablist = container.querySelector('[data-testid="doc-tabs"]')!
    expect(tablist.querySelectorAll('[role="presentation"]')).toHaveLength(0)
    const kids = [...tablist.children]
    expect(kids.length).toBeGreaterThan(0)
    for (const kid of kids) expect(kid.getAttribute('role')).toBe('tab')
    const tabs = [...tablist.querySelectorAll('[data-testid="doc-tab"]')]
    expect(tabs).toHaveLength(2)
  })

  it('닫기 단추는 자기 탭 안에 있다 — 누르면 그 탭만 닫힌다', () => {
    act(() => useWorkbench.getState().newTab())
    const container = mount()
    const tablist = container.querySelector('[data-testid="doc-tabs"]')!
    const closes = [...tablist.querySelectorAll('[data-testid="doc-tab-close"]')]
    expect(closes).toHaveLength(2)
    const tabs = [...tablist.querySelectorAll('[data-testid="doc-tab"]')]
    closes.forEach((close, i) => {
      expect(close.closest('[data-testid="doc-tab"]')).toBe(tabs[i])
      expect(close.getAttribute('role')).toBeNull()
    })
  })

  it('닫기 단추는 32px(size-8)이고 줄 높이는 음수 여백으로 유지한다', () => {
    act(() => useWorkbench.getState().newTab())
    const container = mount()
    const close = container.querySelector('[data-testid="doc-tab-close"]')!
    expect(close.className).toMatch(/(?:^|\s)size-8(?:\s|$)/)
    expect(close.className).toMatch(/-my-\d/)
  })

  it('←→는 탭을 옮기고 Delete는 초점 탭을 닫는다 — tablist 키 규약', () => {
    act(() => useWorkbench.getState().navigate('wiki/a.md'))
    act(() => useWorkbench.getState().openFile('projects/p/plan.md', true))
    const container = mount()
    const tablist = container.querySelector('[data-testid="doc-tabs"]')!
    act(() => {
      tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(useWorkbench.getState().selectedPage).toBe('wiki/a.md')
    const tabId = useWorkbench.getState().tabs[useWorkbench.getState().tabAt].id
    const tab = document.getElementById(`doc-tab-${tabId}`)!
    act(() => tab.focus())
    act(() => {
      tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })
    expect(useWorkbench.getState().tabs).toHaveLength(1)
  })

  it('탭 띠에 체계 밖 radius(3px·5px)가 없고 rounded-sm·rounded-md만 쓴다', () => {
    act(() => useWorkbench.getState().newTab())
    const container = mount()
    const tablist = container.querySelector('[data-testid="doc-tabs"]')!
    expect(tablist.innerHTML).not.toContain('rounded-[3px]')
    expect(tablist.innerHTML).not.toContain('rounded-[5px]')
    expect(container.innerHTML).not.toContain('rounded-[3px]')
    expect(container.innerHTML).not.toContain('rounded-[5px]')
  })

  it('Enter·Space도 다른 탭을 연다 — 칸이라 키를 직접 받는다', () => {
    act(() => useWorkbench.getState().navigate('wiki/a.md'))
    act(() => useWorkbench.getState().openFile('projects/p/plan.md', true))
    const container = mount()
    const first = container.querySelectorAll('[data-testid="doc-tab"]')[0] as HTMLElement
    act(() => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(useWorkbench.getState().selectedPage).toBe('wiki/a.md')
  })

  it('닫기 단추의 Enter는 칸으로 번지지 않는다 — 켜진 탭이 바뀌지 않는다', () => {
    act(() => useWorkbench.getState().navigate('wiki/a.md'))
    act(() => useWorkbench.getState().openFile('projects/p/plan.md', true))
    const container = mount()
    const close = container.querySelectorAll('[data-testid="doc-tab-close"]')[0] as HTMLElement
    act(() => {
      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(useWorkbench.getState().tabs).toHaveLength(2)
    expect(useWorkbench.getState().selectedPage).toBe('projects/p/plan.md')
  })
})
