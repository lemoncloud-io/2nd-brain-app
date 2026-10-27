// @vitest-environment jsdom
// 위키 검색 호출 규칙 — 검색 뷰와 ⌘K 팔레트가 같은 훅을 쓴다. 늦은 응답이 새 질의를 덮지 않음,
// 실패를 빈 값으로 뭉개지 않음, 빈 질의 리셋을 현재 동작에 핀으로 박는다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useEffect } from 'react'
import type { SearchHit } from '../../../shared/wiki/search'
import { useWikiSearch, type WikiSearch } from './use-wiki-search'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type SearchResult = SearchHit[] | { error: string }
const api = { searchWiki: vi.fn<(query: string, limit: number) => Promise<SearchResult>>() }
;(window as unknown as { api: typeof api }).api = api

const hit = (rel: string): SearchHit => ({ rel, title: rel, score: 1, snippet: '...' })

let latest: WikiSearch | null = null
const Probe = (): null => {
  const search = useWikiSearch()
  useEffect(() => {
    latest = search
  })
  return null
}

let root: Root | null = null
let host: HTMLDivElement | null = null

const mount = async (): Promise<void> => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<Probe />)
  })
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  host?.remove()
  root = null
  host = null
  latest = null
  api.searchWiki.mockReset()
  vi.useRealTimers()
})

const run = async (query: string): Promise<void> => {
  await act(async () => {
    await latest!.run(query)
  })
}

describe('useWikiSearch', () => {
  it('성공하면 그 질의의 결과를 싣는다', async () => {
    api.searchWiki.mockResolvedValue([hit('wiki/a.md')])
    await mount()
    await run('정리')
    expect(api.searchWiki).toHaveBeenCalledWith('정리', 20)
    expect(latest!.hits).toEqual([hit('wiki/a.md')])
    expect(latest!.hitsFor).toBe('정리')
    expect(latest!.searched).toBe(true)
    expect(latest!.error).toBeNull()
    expect(latest!.pending).toBe(false)
  })

  it('늦게 온 이전 질의 응답은 버린다', async () => {
    let resolveSlow!: (v: SearchResult) => void
    api.searchWiki.mockImplementationOnce(
      () => new Promise<SearchResult>((resolve) => (resolveSlow = resolve))
    )
    api.searchWiki.mockResolvedValueOnce([hit('wiki/fast.md')])
    await mount()
    let first: Promise<void>
    await act(async () => {
      first = latest!.run('느림')
      await latest!.run('빠름')
    })
    await act(async () => {
      resolveSlow([hit('wiki/slow.md')])
      await first
    })
    expect(latest!.hits).toEqual([hit('wiki/fast.md')])
    expect(latest!.hitsFor).toBe('빠름')
  })

  it('{error} 결과는 실패로 싣고 결과는 비운다', async () => {
    api.searchWiki.mockResolvedValue({ error: '인덱스가 없어요' })
    await mount()
    await run('정리')
    expect(latest!.hits).toBeNull()
    expect(latest!.error).not.toBeNull()
    expect(latest!.pending).toBe(false)
  })

  it('던지면 실패로 싣고 결과는 비운다', async () => {
    api.searchWiki.mockRejectedValue(new Error('boom'))
    await mount()
    await run('정리')
    expect(latest!.hits).toBeNull()
    expect(latest!.error).not.toBeNull()
    expect(latest!.pending).toBe(false)
  })

  it('빈 질의는 부르지 않고 비운다', async () => {
    api.searchWiki.mockResolvedValue([hit('wiki/a.md')])
    await mount()
    await run('정리')
    expect(latest!.hits).not.toBeNull()
    await run('   ')
    expect(api.searchWiki).toHaveBeenCalledTimes(1)
    expect(latest!.hits).toBeNull()
    expect(latest!.searched).toBe(false)
    expect(latest!.error).toBeNull()
  })

  it('타자는 150ms 뒤 한 번만 돈다', async () => {
    vi.useFakeTimers()
    api.searchWiki.mockResolvedValue([hit('wiki/a.md')])
    await mount()
    act(() => {
      latest!.schedule('정')
      latest!.schedule('정리')
    })
    expect(api.searchWiki).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(api.searchWiki).toHaveBeenCalledTimes(1)
    expect(api.searchWiki).toHaveBeenCalledWith('정리', 20)
  })
})
