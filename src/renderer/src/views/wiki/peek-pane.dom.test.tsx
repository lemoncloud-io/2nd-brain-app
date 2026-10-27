// @vitest-environment jsdom
// 참고한 페이지 칸 — 열기 전 탭으로 돌아가는 길, 답 칩의 "전체를 참고" 한 줄, 본문 뒤에 접힌 이어진 페이지.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../../store/workbench'
import { PeekPane } from './peek-pane'

vi.mock('./use-wiki-read', () => ({
  usePageIndex: () => [],
  useConnections: () => [{ rel: 'wiki/b.md', title: 'B', way: 'out' }],
  useWikiRead: (rel: string) => ({
    read: {
      page: { rel, slug: 'a', title: 'A 문서', frontmatter: null, body: '본문 글', links: [] },
      text: '본문 글',
      hash: 'h'
    },
    error: null,
    reload: () => undefined
  }),
  withoutTitleHeading: (body: string) => body,
  scrollToSourceLine: () => undefined
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useWorkbench.setState({ chatOpen: true, chatTab: 'ingest', peek: null, peekFrom: null })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const byTestId = (id: string): HTMLElement | null => host.querySelector(`[data-testid="${id}"]`)

describe('PeekPane', () => {
  it('연 탭 이름으로 돌아가는 단추를 달고, 누르면 근거를 남긴 채 그 탭으로 간다', async () => {
    act(() => useWorkbench.getState().openPeek('wiki/a.md'))
    await act(async () => root.render(<PeekPane />))

    const peek = byTestId('wiki-peek')
    expect(peek?.getAttribute('role')).toBe('region')
    expect(peek?.getAttribute('aria-label')).toBe('참고한 페이지: A 문서')
    expect(byTestId('wiki-peek-back')?.textContent).toContain('위키 초안으로')
    // 검색·점검에서 연 근거에는 "전체를 참고" 를 말하지 않는다
    expect(byTestId('wiki-peek-whole')).toBeNull()

    act(() => byTestId('wiki-peek-back')?.click())
    expect(useWorkbench.getState().chatTab).toBe('ingest')
    expect(useWorkbench.getState().peek?.rel).toBe('wiki/a.md')
  })

  it('답 칩으로 열면 페이지 전체를 참고했다고 한 줄 단다', async () => {
    useWorkbench.setState({ chatTab: 'chat' })
    act(() => useWorkbench.getState().openPeek('wiki/a.md', null, true))
    await act(async () => root.render(<PeekPane />))
    expect(byTestId('wiki-peek-whole')?.textContent).toBe('답이 이 페이지 전체를 참고했어요')
    expect(byTestId('wiki-peek-back')?.textContent).toContain('채팅으로')
  })

  it('이어진 페이지는 본문 뒤에 접혀 있고, 펴면 보인다', async () => {
    act(() => useWorkbench.getState().openPeek('wiki/a.md'))
    await act(async () => root.render(<PeekPane />))

    const reader = byTestId('wiki-peek-reader')
    const section = byTestId('wiki-peek-connections')
    expect(reader?.lastElementChild).toBe(section)
    const toggle = byTestId('wiki-peek-connections-toggle')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(byTestId('wiki-peek-connection')).toBeNull()

    act(() => toggle?.click())
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(byTestId('wiki-peek-connection')?.textContent).toContain('B')
  })

  it('밖에서 근거를 열면 칸에 초점이 가고, 쓰는 중에는 뺏지 않는다', async () => {
    act(() => useWorkbench.getState().openPeek('wiki/a.md'))
    await act(async () => root.render(<PeekPane />))
    expect(document.activeElement).toBe(byTestId('wiki-peek'))
  })

  it('입력칸에 쓰는 중에는 초점을 뺏지 않는다', async () => {
    // root.render 가 host 안을 비우므로 입력칸은 밖에 둔다 — 채팅 입력칸과 같은 자리
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    act(() => useWorkbench.getState().openPeek('wiki/a.md'))
    await act(async () => root.render(<PeekPane />))
    expect(document.activeElement).toBe(input)
    input.remove()
  })
})
