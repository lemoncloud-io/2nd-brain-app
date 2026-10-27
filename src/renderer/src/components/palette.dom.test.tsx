// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SearchHit } from '../../../shared/wiki/search'
import { useWorkbench } from '../store/workbench'
import { Palette } from './palette'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom 에는 없다 — 화살표 이동이 켜진 행을 보이게 하는 호출
Element.prototype.scrollIntoView = () => undefined

type Deferred = { resolve: (hits: SearchHit[]) => void }
const calls: { query: string; deferred: Deferred }[] = []
const searchWiki = vi.fn(
  (query: string) =>
    new Promise<SearchHit[]>((resolve) => {
      calls.push({ query, deferred: { resolve } })
    })
)
const hit = (rel: string, title: string): SearchHit => ({
  rel,
  title,
  score: 1,
  snippet: `${title} 본문`
})
const pages = [
  { rel: 'wiki/alpha.md', title: '알파', slug: 'alpha' },
  { rel: 'wiki/beta.md', title: '베타', slug: 'beta' },
  { rel: 'wiki/gamma.md', title: '감마', slug: 'gamma' }
]

const roots: Root[] = []
beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
  searchWiki.mockClear()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      searchWiki
    }
  })
  useWorkbench.setState({
    pages: pages as never,
    docs: [],
    tree: [],
    recent: [],
    view: 'doc',
    selectedPage: 'wiki/alpha.md',
    peek: null,
    findFor: null
  })
})
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  useWorkbench.setState({ paletteOpen: false, paletteSeed: '' })
  vi.useRealTimers()
})

const mount = (seed = ''): void => {
  useWorkbench.setState({ paletteOpen: true, paletteSeed: seed })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<Palette />))
}
const input = (): HTMLInputElement =>
  document.querySelector('[data-testid="palette-input"]') as HTMLInputElement
const type = (value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input(), value)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const key = (k: string): void => {
  act(() => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  })
}
const options = (): string[] =>
  Array.from(document.querySelectorAll('[role="option"]')).map(
    (el) => el.getAttribute('data-testid') ?? ''
  )
const debounce = (): void => {
  act(() => {
    vi.advanceTimersByTime(150)
  })
}
const resolve = (index: number, hits: SearchHit[]): Promise<void> =>
  act(async () => {
    calls[index].deferred.resolve(hits)
    await Promise.resolve()
  })

describe('Palette 문서 모드 — test: palette.tsx', () => {
  it('제목 일치는 즉시, 150ms 뒤 본문 검색 결과가 "본문·뜻" 구역으로 붙고 같은 문서는 한 번', async () => {
    mount()
    type('알')
    expect(options()).toEqual(['palette-option:wiki/alpha.md', 'palette-option:search'])
    expect(searchWiki).not.toHaveBeenCalled()
    debounce()
    expect(searchWiki).toHaveBeenCalledWith('알', 20)
    await resolve(0, [hit('wiki/alpha.md', '알파'), hit('wiki/gamma.md', '감마')])
    expect(options()).toEqual([
      'palette-option:wiki/alpha.md',
      'palette-option:wiki/gamma.md',
      'palette-option:search'
    ])
    expect(document.body.textContent).toContain('본문')
    expect(document.body.textContent).toContain('감마 본문')
    // ↓ 두 번 뒤 Enter — 본문 행을 연다
    key('ArrowDown')
    key('Enter')
    expect(useWorkbench.getState().selectedPage).toBe('wiki/gamma.md')
    expect(useWorkbench.getState().paletteOpen).toBe(false)
  })

  it('늦게 온 이전 질의 응답은 버리고, 입력이 바뀌면 옛 결과는 보이지 않는다', async () => {
    mount()
    type('알')
    debounce()
    await resolve(0, [hit('wiki/alpha.md', '알파'), hit('wiki/gamma.md', '감마')])
    expect(options()).toContain('palette-option:wiki/gamma.md')
    type('베')
    expect(options()).toEqual(['palette-option:wiki/beta.md', 'palette-option:search'])
    debounce()
    expect(calls.map((c) => c.query)).toEqual(['알', '베'])
    await resolve(1, [hit('wiki/beta.md', '베타'), hit('wiki/gamma.md', '감마')])
    type('알')
    debounce()
    await resolve(2, [hit('wiki/beta.md', '베타')])
    await resolve(1, [hit('wiki/gamma.md', '감마')])
    expect(options()).toEqual([
      'palette-option:wiki/alpha.md',
      'palette-option:wiki/beta.md',
      'palette-option:search'
    ])
  })

  it('검색이 실패하면 입력칸 아래 한 줄로 알리고 제목 일치는 그대로', async () => {
    mount()
    type('알')
    debounce()
    await act(async () => {
      calls[0].deferred.resolve({ error: 'boom' } as never)
      await Promise.resolve()
    })
    expect(document.querySelector('[data-testid="palette-note"]')?.getAttribute('data-state')).toBe(
      'error'
    )
    expect(options()).toEqual(['palette-option:wiki/alpha.md', 'palette-option:search'])
  })

  it('옛 응답 폐기 — 늦게 온 이전 질의 응답', async () => {
    mount()
    type('알')
    debounce()
    type('베')
    debounce()
    await resolve(1, [hit('wiki/beta.md', '베타'), hit('wiki/gamma.md', '감마')])
    await resolve(0, [hit('wiki/alpha.md', '알파')])
    expect(options()).toEqual([
      'palette-option:wiki/beta.md',
      'palette-option:wiki/gamma.md',
      'palette-option:search'
    ])
  })

  it('마지막 행은 검색 뷰로 넘긴다', () => {
    mount()
    type('없는말')
    expect(options()).toEqual(['palette-option:search'])
    key('Enter')
    expect(useWorkbench.getState().searchRequest?.query).toBe('없는말')
    expect(useWorkbench.getState().paletteOpen).toBe(false)
  })
})

describe('Palette 명령 모드 — test: palette.tsx', () => {
  it('> 로 열면 명령 목록이 단축키와 함께 뜨고 본문 검색은 돌지 않는다', () => {
    mount('>')
    expect(document.querySelector('[data-testid="palette-option:today"] kbd')?.textContent).toMatch(
      /T$/
    )
    expect(options()).not.toContain('palette-option:search')
    expect(input().getAttribute('aria-label')).toBe('명령 이름')
    type('>오른쪽')
    debounce()
    expect(searchWiki).not.toHaveBeenCalled()
    expect(options()).toEqual(['palette-option:tab-next'])
    useWorkbench.getState().newTab()
    useWorkbench.getState().openTab(useWorkbench.getState().tabs[0].id)
    expect(useWorkbench.getState().tabAt).toBe(0)
    key('Enter')
    // 명령이 실제로 돌았다 — 오른쪽 탭으로
    expect(useWorkbench.getState().tabAt).toBe(1)
    expect(useWorkbench.getState().paletteOpen).toBe(false)
  })

  it('> 를 지우면 문서 모드로 돌아오고, 없는 명령이면 빈 안내', () => {
    mount('>')
    type('>없는명령')
    expect(document.querySelector('[data-testid="palette-empty"]')?.textContent).toBe(
      '그런 명령이 없어요'
    )
    type('알')
    expect(options()).toEqual(['palette-option:wiki/alpha.md', 'palette-option:search'])
  })
})

describe('palette 실패 안내', () => {
  it('본문 검색 실패는 live 영역으로 알린다 — 축소 결과를 전체로 오해하지 않게', async () => {
    mount()
    type('알')
    debounce()
    await act(async () => {
      calls[0].deferred.resolve({ error: 'boom' } as never)
      await Promise.resolve()
    })
    const note = document.querySelector('[data-testid="palette-note"]')
    expect(note).not.toBeNull()
    expect(note?.getAttribute('role')).toBe('status')
  })
})

describe('Palette 고른 문서 여는 자리 — test: palette.tsx', () => {
  const pickFirst = (text: string): void => {
    mount()
    type(text)
    key('Enter')
  }

  it('고른 문서는 새 탭에 열린다 — 읽던 글은 제 탭에 남는다', () => {
    const { tabs: opened, tabAt: reading } = useWorkbench.getState()
    pickFirst('베')
    const { tabs, tabAt, selectedPage } = useWorkbench.getState()
    expect(tabs).toHaveLength(opened.length + 1)
    expect(tabAt).toBe(opened.length)
    expect(selectedPage).toBe('wiki/beta.md')
    expect(tabs[reading].page).toBe('wiki/alpha.md')
  })

  it('빈 탭에서는 그 탭에 연다', () => {
    useWorkbench.setState({ selectedPage: null, docMode: 'page' })
    const before = useWorkbench.getState().tabs.length
    pickFirst('베')
    expect(useWorkbench.getState().tabs).toHaveLength(before)
    expect(useWorkbench.getState().selectedPage).toBe('wiki/beta.md')
  })

  it('이미 보고 있는 문서를 고르면 탭을 늘리지 않는다', () => {
    const before = useWorkbench.getState().tabs.length
    pickFirst('알')
    expect(useWorkbench.getState().tabs).toHaveLength(before)
    expect(useWorkbench.getState().selectedPage).toBe('wiki/alpha.md')
  })
})

describe('Palette 종류 단추 — test: palette.tsx', () => {
  const file = (rel: string): unknown => ({
    rel,
    kind: 'file',
    ext: rel.slice(rel.lastIndexOf('.')),
    mtimeMs: 0,
    size: 0
  })
  const pick = (kind: string): void => {
    act(() => {
      document.querySelector<HTMLButtonElement>(`[data-testid="palette-kind:${kind}"]`)!.click()
    })
  }
  beforeEach(() => {
    useWorkbench.setState({
      tree: [file('raw/알림 보고서.pdf'), file('raw/shot.png'), file('wiki/alpha.md')] as never
    })
  })

  it('md 아닌 파일도 이름으로 나오고, 고르면 문서 자리에 미리보기로 열린다', () => {
    mount()
    type('알')
    expect(options()).toEqual([
      'palette-option:wiki/alpha.md',
      'palette-option:raw/알림 보고서.pdf',
      'palette-option:search'
    ])
    key('ArrowDown')
    key('Enter')
    expect(useWorkbench.getState().selectedSource).toBe('raw/알림 보고서.pdf')
    expect(useWorkbench.getState().docMode).toBe('source')
  })

  it('PDF 를 고르면 낱말 없이도 그 종류 전부, 본문 검색 행은 없다', async () => {
    mount()
    pick('pdf')
    expect(options()).toEqual(['palette-option:raw/알림 보고서.pdf'])
    type('알')
    debounce()
    await resolve(0, [hit('wiki/gamma.md', '감마')])
    expect(options()).toEqual(['palette-option:raw/알림 보고서.pdf'])
    type('없는말')
    expect(document.querySelector('[data-testid="palette-empty"]')?.textContent).toBe(
      '이 종류에서는 찾지 못했어요'
    )
    pick('all')
    type('알')
    expect(options()).toContain('palette-option:wiki/alpha.md')
  })
})
