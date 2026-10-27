// @vitest-environment jsdom
// 옆 칸 알림 — 밖에서 열 때만 한 줄 말하고, 칸 안 탭 이동은 조용하다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../../store/workbench'
import { SidecarAnnounce } from './sidecar-announce'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useWorkbench.setState({ chatOpen: true, chatTab: 'chat', sidecarFocusAt: 0 })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('SidecarAnnounce', () => {
  it('밖에서 열면 탭 이름을 말하고, 탭 직접 이동은 조용하다', async () => {
    await act(async () => root.render(<SidecarAnnounce />))
    const el = host.querySelector('[data-testid="sidecar-announce"]')
    expect(el?.getAttribute('role')).toBe('status')
    expect(el?.textContent).toBe('')

    act(() => useWorkbench.getState().openChat('ingest'))
    expect(el?.textContent).toBe('')

    act(() => useWorkbench.getState().openChat('ingest', { focus: true }))
    expect(el?.textContent).toBe('옆 칸에 위키 초안을 열었어요')

    act(() => useWorkbench.getState().openPeek('wiki/a.md'))
    expect(el?.textContent).toBe('옆 칸에 참고한 페이지를 열었어요')
  })

  it('칸 안에서 옮기면 조용하다', async () => {
    host.setAttribute('data-testid', 'chat-pane')
    await act(async () => root.render(<SidecarAnnounce />))
    const tab = document.createElement('button')
    host.append(tab)
    tab.focus()
    act(() => useWorkbench.getState().openPeek('wiki/a.md'))
    expect(host.querySelector('[data-testid="sidecar-announce"]')?.textContent).toBe('')
  })
})
