// @vitest-environment jsdom
// 자료 구역 — 읽는 중·없음·있음을 가리고, 쉬운 말로 다음 할 일을 말한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../hooks/use-setup'
import { useWorkbench } from '../store/workbench'
import { SourcesSection } from './sources-section'

vi.mock('../pages/ClipSection', () => ({ ClipSection: () => <div data-testid="mock-clip" /> }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const setup = { journey: { clippings: 0 } } as never

let root: Root
let host: HTMLDivElement

const renderSection = async (): Promise<void> => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <SetupContext.Provider value={setup}>
        <SourcesSection />
      </SetupContext.Provider>
    )
  })
}

beforeEach(() => {
  useWorkbench.setState({ tree: null })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('SourcesSection', () => {
  it('구역 제목은 h1, 기다리는 목록 제목은 h2다 — 다른 구역과 같은 위계다', async () => {
    useWorkbench.setState({ tree: null })
    await renderSection()
    const levels = [...host.querySelectorAll('h1, h2, h3')].map((el) => el.tagName)
    expect(levels).toEqual(['H1', 'H2'])
    expect(host.querySelector('h1')?.textContent).toBe('자료 넣기')
  })

  it('트리를 읽기 전에는 기다림을 말하고 빈 말과 가른다', async () => {
    useWorkbench.setState({ tree: null })
    await renderSection()
    expect(host.querySelector('[data-testid="sources-loading"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="sources-empty"]')).toBeNull()
  })

  it('비었으면 다음 할 일을 말하고 쉬운 말로 쓴다', async () => {
    useWorkbench.setState({ tree: [] })
    await renderSection()
    expect(host.querySelector('[data-testid="sources-loading"]')).toBeNull()
    const empty = host.querySelector('[data-testid="sources-empty"]')
    expect(empty).not.toBeNull()
    expect(host.textContent).not.toContain('바깥 글')
    expect(host.textContent).toContain('파일이나 웹 페이지 주소')
  })

  it('기다리는 자료가 있으면 목록과 위키 초안으로 가는 길이 있다', async () => {
    useWorkbench.setState({
      tree: [{ rel: 'Clippings/a.pdf', kind: 'file', ext: '.pdf', mtimeMs: 3, size: 9 }]
    })
    await renderSection()
    expect(host.querySelector('[data-testid="sources-waiting-list"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="sources-open-ingest"]')).not.toBeNull()
  })
})
