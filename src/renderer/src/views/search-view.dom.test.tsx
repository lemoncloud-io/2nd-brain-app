// @vitest-environment jsdom
// 검색 타자 중 옛 결과가 보이면 안 된다 — hitsFor 가 입력과 다르면 목록을 숨긴다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChatContext } from './chat/chat-context'
import type { ChatSession } from './chat/use-chat-session'
import type { WikiSearch } from '../lib/use-wiki-search'
import { useWorkbench } from '../store/workbench'
import { SearchView } from './search-view'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const searchState = vi.hoisted(() => vi.fn())
vi.mock('../lib/use-wiki-search', () => ({ useWikiSearch: searchState }))

const HIT = { rel: 'wiki/a.md', title: '정리 정돈', score: 1, snippet: '정리 이야기' }

const base: WikiSearch = {
  hits: null,
  hitsFor: '',
  searched: false,
  error: null,
  pending: false,
  run: vi.fn(),
  schedule: vi.fn()
}

const chat = { setDraft: vi.fn() } as unknown as ChatSession

let root: Root
let host: HTMLDivElement

const renderView = async (): Promise<void> => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <ChatContext.Provider value={chat}>
        <SearchView />
      </ChatContext.Provider>
    )
  })
}

const typeQuery = (value: string): void => {
  const input = document.querySelector<HTMLInputElement>('[data-testid="search-input"]')!
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  searchState.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
})

describe('SearchView', () => {
  it('입력 바뀐 뒤 답 오기 전에는 옛 목록을 숨긴다', async () => {
    searchState.mockReturnValue({
      ...base,
      hits: [HIT],
      hitsFor: '정',
      searched: true,
      pending: true
    })
    await renderView()
    typeQuery('정리')
    expect(document.querySelector('[data-testid="search-hit:wiki/a.md"]')).toBeNull()
    expect(document.querySelector('[data-testid="search-pending"]')).not.toBeNull()
  })

  it('답이 입력과 같은 세대면 목록을 보여준다', async () => {
    searchState.mockReturnValue({ ...base, hits: [HIT], hitsFor: '정리', searched: true })
    await renderView()
    typeQuery('정리')
    expect(document.querySelector('[data-testid="search-hit:wiki/a.md"]')).not.toBeNull()
  })

  it('옛 빈 결과도 새 입력 앞에서는 내놓지 않는다', async () => {
    searchState.mockReturnValue({ ...base, hits: [], hitsFor: '정', searched: true, pending: true })
    await renderView()
    typeQuery('정리')
    expect(document.querySelector('[data-testid="search-empty"]')).toBeNull()
  })

  it('지우기 단추는 title 없이 읽힌다', async () => {
    searchState.mockReturnValue({ ...base })
    await renderView()
    typeQuery('정리')
    const clear = document.querySelector('[data-testid="search-clear"]')
    expect(clear?.getAttribute('aria-label')).toBe('검색어 지우기')
    expect(clear?.getAttribute('title')).toBeNull()
  })

  it('처음에는 빈칸 대신 무엇을 적을지 말한다', async () => {
    searchState.mockReturnValue({ ...base })
    await renderView()
    expect(document.querySelector('[data-testid="search-hint"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="search-empty"]')).toBeNull()
  })

  describe('종류 단추', () => {
    const file = (rel: string): unknown => ({
      rel,
      kind: 'file',
      ext: rel.slice(rel.lastIndexOf('.')),
      mtimeMs: 0,
      size: 0
    })
    const pick = (kind: string): void => {
      act(() => {
        document.querySelector<HTMLButtonElement>(`[data-testid="search-kind:${kind}"]`)!.click()
      })
    }
    const shown = (prefix: string): string[] =>
      Array.from(document.querySelectorAll(`[data-testid^="${prefix}:"]`)).map(
        (el) => el.getAttribute('data-testid') ?? ''
      )
    beforeEach(() => {
      useWorkbench.setState({
        tree: [file('raw/정리 보고서.pdf'), file('raw/정리.png'), file('wiki/a.md')] as never
      })
    })
    afterEach(() => {
      useWorkbench.setState({ tree: null })
    })

    it('전체에서는 이름이 맞는 파일이 문서 결과 위에 같이 나온다', async () => {
      searchState.mockReturnValue({ ...base, hits: [HIT], hitsFor: '정리', searched: true })
      await renderView()
      typeQuery('정리')
      expect(shown('search-file')).toEqual([
        'search-file:raw/정리.png',
        'search-file:raw/정리 보고서.pdf'
      ])
      expect(shown('search-hit')).toEqual(['search-hit:wiki/a.md'])
    })

    it('PDF 를 고르면 낱말 없이도 PDF 만 보이고, 누르면 문서 자리에 열린다', async () => {
      searchState.mockReturnValue({ ...base, hits: [HIT], hitsFor: '', searched: true })
      await renderView()
      pick('pdf')
      expect(shown('search-file')).toEqual(['search-file:raw/정리 보고서.pdf'])
      expect(shown('search-hit')).toEqual([])
      act(() => {
        document
          .querySelector<HTMLButtonElement>('[data-testid="search-file:raw/정리 보고서.pdf"]')!
          .click()
      })
      expect(useWorkbench.getState().selectedSource).toBe('raw/정리 보고서.pdf')
    })

    it('고른 종류에 맞는 파일이 없으면 그렇게 말한다', async () => {
      searchState.mockReturnValue({ ...base, hits: [HIT], hitsFor: '없는말', searched: true })
      await renderView()
      pick('image')
      typeQuery('없는말')
      expect(document.querySelector('[data-testid="search-kind-empty"]')).not.toBeNull()
      expect(document.querySelector('[data-testid="search-empty"]')).toBeNull()
    })

    it('문서를 고르면 파일은 빠지고 본문 결과만 남는다', async () => {
      searchState.mockReturnValue({ ...base, hits: [HIT], hitsFor: '정리', searched: true })
      await renderView()
      pick('doc')
      typeQuery('정리')
      expect(shown('search-file')).toEqual([])
      expect(shown('search-hit')).toEqual(['search-hit:wiki/a.md'])
    })
  })
})
