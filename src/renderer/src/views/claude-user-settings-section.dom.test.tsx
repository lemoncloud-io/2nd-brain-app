// @vitest-environment jsdom
// 설정 → 고급 → 내 Claude 설정 — 저장된 값이 먼저 보이고, 끄면 그 값만 보낸다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ClaudeUserSettingsSection from './claude-user-settings-section'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const mount = (): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<ClaudeUserSettingsSection />))
  return container
}

const box = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('[data-testid="chat-default-user-settings"]')

describe('ClaudeUserSettingsSection', () => {
  it('옛 설정에는 값이 없어 켜져 보이고, 끄면 이 값만 저장한다', async () => {
    const setChatDefaults = vi.fn(async () => ({ permissionMode: 'all', userSettings: false }))
    window.api = {
      getChatDefaults: vi.fn(async () => ({ permissionMode: 'all' })),
      setChatDefaults
    } as unknown as typeof window.api
    const container = mount()
    await act(async () => undefined)
    expect(box(container)?.getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      box(container)?.click()
    })
    expect(setChatDefaults).toHaveBeenCalledWith({ userSettings: false })
    expect(box(container)?.getAttribute('aria-checked')).toBe('false')
  })

  it('저장이 실패하면 이전 값으로 돌아가고 사유를 보인다', async () => {
    window.api = {
      getChatDefaults: vi.fn(async () => ({ permissionMode: 'ask', userSettings: true })),
      setChatDefaults: vi.fn(async () => {
        throw new Error('끊겼다')
      })
    } as unknown as typeof window.api
    const container = mount()
    await act(async () => undefined)
    await act(async () => {
      box(container)?.click()
    })
    expect(box(container)?.getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '이 설정을 저장하지 못했어요'
    )
  })
})
