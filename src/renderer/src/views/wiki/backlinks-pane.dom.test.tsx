// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BacklinksPane } from './backlinks-pane'
import { parseWikiPage } from '../../../../shared/wiki/parse'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
// 링크 칸은 언급을 main 에 묻는다 — 여기서는 없다고 답한다
Object.assign(window, { api: { unlinkedMentions: vi.fn(async () => []) } })
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const mount = (
  backlinks: { rel: string; title: string }[]
): { onNavigate: ReturnType<typeof vi.fn> } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  const onNavigate = vi.fn()
  const page = parseWikiPage('wiki/x.md', '# X\n\n[[없는 곳]]\n')
  act(() =>
    root.render(
      <BacklinksPane
        page={page}
        hash="h"
        backlinks={backlinks}
        index={[{ rel: 'wiki/x.md', slug: 'x' }]}
        onNavigate={onNavigate}
      />
    )
  )
  return { onNavigate }
}

describe('BacklinksPane — test: backlinks-pane.tsx', () => {
  it('없으면 목록 대신 "아직 없음" 한 줄', () => {
    mount([])
    expect(document.querySelector('[data-testid="wiki-backlinks"]')?.textContent).toContain(
      '아직 없어요'
    )
    expect(document.querySelectorAll('[data-testid="wiki-backlink"]')).toHaveLength(0)
  })

  it('항목을 누르면 그 페이지로 navigate', () => {
    const { onNavigate } = mount([
      { rel: 'wiki/a.md', title: '가' },
      { rel: 'wiki/b.md', title: '나' }
    ])
    const items = document.querySelectorAll<HTMLButtonElement>('[data-testid="wiki-backlink"]')
    expect(items).toHaveLength(2)
    expect(document.querySelector('h2')?.textContent).toBe('여기를 가리키는 페이지 2')
    act(() => items[1].click())
    expect(onNavigate).toHaveBeenCalledWith('wiki/b.md')
  })

  it('가리킨 곳이 없는 링크는 만들기와 함께 보인다', () => {
    mount([])
    expect(document.querySelector('[data-testid="wiki-unresolved-create:없는 곳"]')).not.toBeNull()
  })
})

describe('BacklinksPane 언급 조회 실패', () => {
  const mountAsync = async (): Promise<void> => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    const page = parseWikiPage('wiki/x.md', '# X\n\n[[없는 곳]]\n')
    await act(async () => {
      root.render(
        <BacklinksPane
          page={page}
          hash="h"
          backlinks={[]}
          index={[{ rel: 'wiki/x.md', slug: 'x' }]}
          onNavigate={() => {}}
        />
      )
    })
  }

  const mocked = (): ReturnType<typeof vi.fn> =>
    (window as unknown as { api: { unlinkedMentions: ReturnType<typeof vi.fn> } }).api
      .unlinkedMentions

  it('조회가 거부되면 실패를 알린다', async () => {
    mocked().mockRejectedValueOnce(new Error('boom'))
    await mountAsync()
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('조회가 error 결과를 돌려주면 실패를 알린다', async () => {
    mocked().mockResolvedValueOnce({ error: '읽을 수 없어요' })
    await mountAsync()
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('조회가 성공하면 언급을 보이고 실패 안내를 보이지 않는다', async () => {
    mocked().mockResolvedValueOnce([
      { rel: 'wiki/b.md', title: 'B', line: 3, term: '없는 곳', snippet: '... 없는 곳 ...' }
    ])
    await mountAsync()
    expect(document.querySelector('[data-testid="wiki-mentions"]')).not.toBeNull()
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('조회 실패 뒤 만들기가 성공해도 조회 실패는 그대로 보인다', async () => {
    mocked().mockRejectedValueOnce(new Error('boom'))
    const { useWorkbench } = await import('../../store/workbench')
    useWorkbench.setState({
      newNote: vi.fn(async () => ({ rel: 'wiki/없는 곳.md' }))
    } as never)
    await mountAsync()
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    const button = document.querySelector<HTMLButtonElement>(
      '[data-testid="wiki-unresolved-create:없는 곳"]'
    )
    expect(button).not.toBeNull()
    await act(async () => {
      button?.click()
    })
    // 만들기 성공 뒤에도 조회 실패 안내가 남아 있다 — 실패가 없음으로 바뀌지 않는다
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="wiki-mentions"]')).toBeNull()
  })
})
