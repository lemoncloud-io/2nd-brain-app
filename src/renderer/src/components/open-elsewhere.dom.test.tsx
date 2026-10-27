// @vitest-environment jsdom
// Finder(파일 탐색기)에서 보기 — 미리보기 종류와 무관하게 같은 버튼이다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RevealButton } from './open-elsewhere'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const mount = (platform: string): HTMLDivElement => {
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    getAppInfo: () => Promise.resolve({ platform }),
    revealInFinder: vi.fn(() => Promise.resolve())
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<RevealButton rel="wiki/a.md" testId="reveal" />))
  return container
}

describe('RevealButton', () => {
  it('macOS 에서는 Finder에서 보기라고 말한다', async () => {
    const container = mount('darwin')
    await act(async () => undefined)
    expect(container.querySelector('[data-testid="reveal"]')?.getAttribute('aria-label')).toBe(
      'Finder에서 보기'
    )
  })

  it('Windows 에서는 파일 탐색기에서 보기라고 말한다', async () => {
    const container = mount('win32')
    await act(async () => undefined)
    expect(container.querySelector('[data-testid="reveal"]')?.getAttribute('aria-label')).toBe(
      '파일 탐색기에서 보기'
    )
  })

  it('누르면 그 파일을 보여 달라고 한다', async () => {
    const container = mount('darwin')
    await act(async () => undefined)
    act(() => container.querySelector<HTMLElement>('[data-testid="reveal"]')?.click())
    const api = (window as unknown as { api: { revealInFinder: ReturnType<typeof vi.fn> } }).api
    expect(api.revealInFinder).toHaveBeenCalledWith('wiki/a.md')
  })
})
