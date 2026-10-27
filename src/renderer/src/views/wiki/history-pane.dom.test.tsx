// @vitest-environment jsdom
// 기록 칸 — 가운데 문서의 버전을 누가 · 언제로 보이고, 문서를 옮기면 따라가며, 누르면 그 버전을 고르는가.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DocHistoryResult, DocVersion } from '../../../../shared/ipc-contract'
import { useWorkbench } from '../../store/workbench'
import { HistoryPane } from './history-pane'

vi.mock('./use-wiki-read', () => ({
  useWikiRead: () => ({ read: null, error: null, reload: () => undefined })
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const v = (rev: string, kind: DocVersion['kind'], author = '2nd-brain'): DocVersion => ({
  rev,
  kind,
  author,
  date: '2026-10-02T15:04:00+09:00'
})

const ok = { versions: [], recorded: true, truncated: false, labelsPartial: false }

let changed: ((rels: string[]) => void) | null = null
const api = {
  docHistory: vi.fn<(rel: string) => Promise<DocHistoryResult>>(),
  onWikiChanged: (listener: (rels: string[]) => void): (() => void) => {
    changed = listener
    return () => {
      changed = null
    }
  }
}
;(window as unknown as { api: typeof api }).api = api

let root: Root
let host: HTMLDivElement
const navigate = vi.fn()

beforeEach(() => {
  api.docHistory.mockReset()
  navigate.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useWorkbench.setState({
    versionPick: null,
    view: 'doc',
    docMode: 'page',
    selectedPage: 'wiki/a.md',
    selectedSource: null,
    navigate
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const byTestId = (id: string): HTMLElement | null => host.querySelector(`[data-testid="${id}"]`)

describe('HistoryPane', () => {
  it('가운데 문서의 버전을 누가로 보이고, 누르면 그 버전을 고르고 무엇이 열렸는지 알린다', async () => {
    const list = [v('r2', 'person', 'bob'), v('r1', 'ai')]
    api.docHistory.mockResolvedValue({ ...ok, versions: list, labelsPartial: true })
    await act(async () => root.render(<HistoryPane />))

    expect(api.docHistory).toHaveBeenCalledWith('wiki/a.md')
    expect(byTestId('history-version:0')?.textContent).toContain('bob 고침')
    expect(byTestId('history-version:1')?.textContent).toContain('AI가 씀')
    expect(byTestId('history-labels-partial')).not.toBeNull()
    expect(byTestId('history-announce')?.textContent).toBe('')

    await act(async () => byTestId('history-version:1')?.click())
    // 이미 문서 자리에 그 문서가 있다 — 다시 열지 않는다
    expect(navigate).not.toHaveBeenCalled()
    expect(useWorkbench.getState().versionPick).toEqual({ rel: 'wiki/a.md', version: list[1] })
    expect(byTestId('history-version:1')?.getAttribute('aria-current')).toBe('true')
    expect(byTestId('history-announce')?.textContent).toContain('가운데에 열었어요')
  })

  it('머리의 닫기 단추는 기록을 닫고 열기 전 탭으로 돌아간다', async () => {
    api.docHistory.mockResolvedValue(ok)
    useWorkbench.setState({ chatOpen: true, chatTab: 'ingest', historyFrom: null })
    useWorkbench.getState().toggleHistory()
    await act(async () => root.render(<HistoryPane />))
    const close = host.querySelector<HTMLElement>('[data-testid="history-pane-close"]')
    expect(close?.getAttribute('aria-label')).toBe('기록 닫기')
    act(() => close?.click())
    expect(useWorkbench.getState()).toMatchObject({ chatOpen: true, chatTab: 'ingest' })
  })

  it('밖에서 기록을 열면 제목에 초점이 가고, 칸 안에서 옮기면 그대로다', async () => {
    api.docHistory.mockResolvedValue(ok)
    useWorkbench.setState({ chatOpen: true, chatTab: 'chat', sidecarFocusAt: 0 })
    await act(async () => root.render(<HistoryPane />))
    const title = byTestId('history-title')
    expect(title?.getAttribute('tabindex')).toBe('-1')
    // 밖(가운데 미리보기 단추 자리)에서 열기 — 초점이 따라간다
    act(() => useWorkbench.getState().toggleHistory())
    expect(document.activeElement).toBe(title)
    // 칸 안에서 탭을 옮기면 초점을 뺏지 않는다 — 칸 안에 초점이 있으면 조용하다
    const tab = document.createElement('button')
    host.append(tab)
    host.setAttribute('data-testid', 'chat-pane')
    tab.focus()
    act(() => useWorkbench.getState().openChat('history', { focus: true }))
    expect(document.activeElement).toBe(tab)
    host.removeAttribute('data-testid')
  })

  it('열린 문서가 없는 빈 칸에도 닫기 단추가 있다', async () => {
    useWorkbench.setState({ selectedPage: null })
    await act(async () => root.render(<HistoryPane />))
    expect(host.querySelector('[data-testid="history-pane-close"]')).not.toBeNull()
  })

  it('가운데가 지식 관리면 버전을 누를 때 문서 자리로 돌아온다', async () => {
    api.docHistory.mockResolvedValue({ ...ok, versions: [v('r1', 'me')] })
    useWorkbench.setState({ view: 'knowledge' })
    await act(async () => root.render(<HistoryPane />))
    await act(async () => byTestId('history-version:0')?.click())
    expect(navigate).toHaveBeenCalledWith('wiki/a.md')
  })

  it('가운데 문서를 옮기면 목록도 따라가고, 열린 문서가 없으면 그렇다고 말한다', async () => {
    api.docHistory.mockResolvedValue({ ...ok, versions: [v('r1', 'me')] })
    await act(async () => root.render(<HistoryPane />))
    await act(async () => useWorkbench.setState({ selectedPage: 'wiki/b.md' }))
    expect(api.docHistory).toHaveBeenLastCalledWith('wiki/b.md')
    expect(host.textContent).toContain('b')

    await act(async () => useWorkbench.setState({ selectedPage: null }))
    expect(host.textContent).toContain('문서를 열면 그 문서의 기록이 여기 보여요')
  })

  it('html 을 가운데에 연 채로는 그 파일의 버전을 받고, 누르면 그 파일로 버전을 고른다', async () => {
    api.docHistory.mockResolvedValue({ ...ok, versions: [v('r1', 'ai')] })
    useWorkbench.setState({ docMode: 'source', selectedSource: 'outputs/report.html' })
    await act(async () => root.render(<HistoryPane />))
    expect(api.docHistory).toHaveBeenCalledWith('outputs/report.html')
    await act(async () => byTestId('history-version:0')?.click())
    expect(useWorkbench.getState().versionPick).toEqual({
      rel: 'outputs/report.html',
      version: v('r1', 'ai')
    })

    // 그 파일이 바뀌면 목록을 다시 받는다
    api.docHistory.mockClear()
    await act(async () => changed?.(['outputs/report.html']))
    expect(api.docHistory).toHaveBeenCalledWith('outputs/report.html')
  })

  it('그림처럼 글자가 아닌 파일은 기록을 볼 수 없다고 말한다', async () => {
    useWorkbench.setState({ docMode: 'source', selectedSource: 'attachments/a.png' })
    await act(async () => root.render(<HistoryPane />))
    expect(api.docHistory).not.toHaveBeenCalled()
    expect(byTestId('history-pane')).toBeNull()
    expect(host.textContent).toContain('글자로 된 파일만 기록을 볼 수 있어요')
  })

  it('기록이 없으면 비었다고, 기록을 남기지 않는 문서면 그렇다고, 읽지 못하면 이유를 보인다', async () => {
    api.docHistory.mockResolvedValueOnce(ok)
    useWorkbench.setState({ selectedPage: 'wiki/new.md' })
    await act(async () => root.render(<HistoryPane />))
    expect(byTestId('history-empty')).not.toBeNull()

    // 기록을 남기지 않는 문서는 "저장하면 쌓여요" 라고 하지 않는다
    api.docHistory.mockResolvedValueOnce({ ...ok, recorded: false })
    await act(async () => useWorkbench.setState({ selectedPage: 'private/p.md' }))
    expect(byTestId('history-unrecorded')).not.toBeNull()
    expect(byTestId('history-empty')).toBeNull()

    api.docHistory.mockResolvedValueOnce({ error: '기록을 읽지 못했어요' })
    await act(async () => useWorkbench.setState({ selectedPage: 'wiki/b.md' }))
    expect(byTestId('history-error')?.textContent).toContain('기록을 읽지 못했어요')
  })
})
