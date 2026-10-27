// @vitest-environment jsdom
// 설정 채팅 칸 — 권한 모드 기본값. 저장된 값이 손잡이에 먼저 보인다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ChatDefaultsSection from './chat-defaults-section'
import { applyLanguage } from '../lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  act(() => applyLanguage('ko'))
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const mount = (): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<ChatDefaultsSection />))
  return container
}

describe('ChatDefaultsSection', () => {
  it('저장된 기본값이 손잡기에 먼저 보인다', async () => {
    window.api = {
      getChatDefaults: vi.fn(async () => ({ permissionMode: 'edits' })),
      setChatDefaults: vi.fn(async (next: unknown) => next)
    } as unknown as typeof window.api
    const container = mount()
    await act(async () => undefined)
    expect(
      container
        .querySelector('[data-testid="chat-default-mode-edits"]')
        ?.getAttribute('aria-checked')
    ).toBe('true')
    expect(container.querySelector('[data-testid="chat-default-source-only"]')).toBeNull()
  })

  it('고르면 저장하고, 실패하면 되돌린다', async () => {
    const setChatDefaults = vi.fn(async (next: unknown) => next)
    window.api = {
      getChatDefaults: vi.fn(async () => ({ permissionMode: 'ask' })),
      setChatDefaults
    } as unknown as typeof window.api
    const container = mount()
    await act(async () => undefined)
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="chat-default-mode-all"]')?.click()
    })
    expect(setChatDefaults).toHaveBeenCalledWith({ permissionMode: 'all' })
  })

  it('저장이 실패하면 손잡이가 이전 값으로 돌아가고 사유를 보인다', async () => {
    window.api = {
      getChatDefaults: vi.fn(async () => ({ permissionMode: 'ask' })),
      setChatDefaults: vi.fn(async () => {
        throw new Error('끊겼다')
      })
    } as unknown as typeof window.api
    const container = mount()
    await act(async () => undefined)
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="chat-default-mode-all"]')?.click()
    })
    await act(async () => undefined)
    expect(
      container.querySelector('[data-testid="chat-default-mode-ask"]')?.getAttribute('aria-checked')
    ).toBe('true')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('저장하지 못했어요')
  })

  it('읽기가 실패하면 기본값으로 두고 사유를 보인다', async () => {
    window.api = {
      getChatDefaults: vi.fn(async () => {
        throw new Error('끊겼다')
      }),
      setChatDefaults: vi.fn(async (next: unknown) => next)
    } as unknown as typeof window.api
    const container = mount()
    await act(async () => undefined)
    expect(
      container.querySelector('[data-testid="chat-default-mode-ask"]')?.getAttribute('aria-checked')
    ).toBe('true')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('읽지 못했어요')
  })

  it('언어를 바꾸면 손잡이 이름과 설명이 그 언어로 다시 그려진다', async () => {
    window.api = {
      getChatDefaults: vi.fn(async () => ({ permissionMode: 'ask' })),
      setChatDefaults: vi.fn(async (next: unknown) => next)
    } as unknown as typeof window.api
    const container = mount()
    await act(async () => undefined)
    expect(container.textContent).toMatch(/[가-힣]/)

    act(() => applyLanguage('en'))

    expect(container.textContent).not.toMatch(/[가-힣]/)
  })
})
