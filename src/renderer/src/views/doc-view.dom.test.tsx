// @vitest-environment jsdom
// 문서 자리 — 탭 띠가 가리키는 패널이 정확히 하나 있고, 좁은 분할은 쌓인다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../store/workbench'
import { DocView } from './doc-view'

vi.mock('./wiki/wiki-view', () => ({ WikiView: () => <div data-testid="mock-wiki" /> }))
vi.mock('./source-preview', () => ({
  SourcePreview: ({ rel }: { rel: string }) => <div data-testid="mock-preview">{rel}</div>
}))
vi.mock('./wiki/split-pane', () => ({
  SplitPane: ({ rel }: { rel: string }) => <div data-testid="mock-split">{rel}</div>
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useWorkbench.setState({
    view: 'doc',
    docMode: 'page',
    selectedPage: 'wiki/a.md',
    selectedSource: null,
    split: null
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('DocView', () => {
  it('문서 자리 패널이 정확히 하나다 — 분할해도 마찬가지다', async () => {
    await act(async () => root.render(<DocView />))
    expect(host.querySelectorAll('#doc-panel')).toHaveLength(1)
    expect(host.querySelector('#doc-panel')?.getAttribute('role')).toBe('tabpanel')

    await act(async () => useWorkbench.setState({ split: 'wiki/b.md' }))
    expect(host.querySelectorAll('#doc-panel')).toHaveLength(1)
    expect(host.querySelector('[data-testid="mock-split"]')).not.toBeNull()
  })
})
