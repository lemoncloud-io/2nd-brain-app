// @vitest-environment jsdom
// 북마크 칸 — 이름이 같은 문서 둘을 달아도 줄만 보고 어느 문서인지 가릴 수 있는가.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../../store/workbench'
import { SidebarPanes } from './sidebar-panes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    listTags: () => Promise.resolve([]),
    onWikiChanged: () => () => {}
  }
  useWorkbench.setState({ sidebarPane: 'bookmarks', tree: [], bookmarks: [] })
})

const mount = (): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<SidebarPanes />))
  return container
}

const rows = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-testid^="bookmark:"]')].map((el) => el.textContent ?? '')

describe('북마크 칸', () => {
  it('다른 폴더의 같은 이름 문서 둘은 서로 다른 글자로 보인다', () => {
    useWorkbench.setState({
      bookmarks: ['projects/dm-leave-rejoin/PLAN.md', 'projects/app-docs-tree/PLAN.md']
    })
    const [first, second] = rows(mount())
    expect(first).not.toBe(second)
  })
})

describe('보기 전환', () => {
  const tab = (c: HTMLElement, id: string): HTMLElement | null =>
    c.querySelector(`[data-testid="sidebar-pane-${id}"]`)

  const click = (el: HTMLElement): void => {
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it('파일·태그·북마크가 글자로 보인다', () => {
    const container = mount()
    expect(tab(container, 'files')?.textContent).toContain('파일')
    expect(tab(container, 'tags')?.textContent).toContain('태그')
    expect(tab(container, 'bookmarks')?.textContent).toContain('북마크')
  })

  it('태그 칸에 친 거르개는 보기를 오가도 남는다', async () => {
    window.api = {
      listTags: () => Promise.resolve([{ tag: '회의', count: 2 }]),
      onWikiChanged: () => () => {}
    } as unknown as typeof window.api
    useWorkbench.setState({ sidebarPane: 'tags' })
    const container = mount()
    const filter = container.querySelector<HTMLInputElement>('[data-testid="tag-filter"]')!
    // React 제어 입력 — 네이티브 setter 로 값을 넣어야 onChange 가 돈다
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    act(() => {
      nativeSetter?.call(filter, '회의')
      filter.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(tab(container, 'files')!)
    click(tab(container, 'tags')!)
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.querySelector<HTMLInputElement>('[data-testid="tag-filter"]')?.value).toBe(
      '회의'
    )
  })

  it('북마크 지우기는 올려놓지 않아도 보인다', () => {
    useWorkbench.setState({ bookmarks: ['readme.md'] })
    const container = mount()
    const remove = container.querySelector('[data-testid="bookmark-remove:readme.md"]')
    expect(remove).not.toBeNull()
    // hover 때만 보이는 투명은 발견 불가 — 터치·키보드도 보여야 한다
    expect(remove!.className).not.toMatch(/opacity-0/)
  })
})
