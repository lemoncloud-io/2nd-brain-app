// @vitest-environment jsdom
// 설정 화면 칸 — 언어를 고르면 그 칸이 바로 그 언어가 되고, 저장에 실패한 알림도 고른 언어로 보인다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import AppearanceSection from './appearance-section'
import { applyLanguage } from '../lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  applyLanguage('ko')
  vi.restoreAllMocks()
})

const mount = (): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<AppearanceSection />))
  return container
}

const byTestId = (container: HTMLElement, id: string): HTMLElement =>
  container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!

describe('AppearanceSection', () => {
  it('English 를 누르면 그 칸이 영어가 되고 고른 언어를 저장한다', async () => {
    const setLanguage = vi.fn(async (lang: string) => lang)
    window.api = { setLanguage } as unknown as typeof window.api
    const container = mount()
    expect(byTestId(container, 'theme-light').textContent).toBe('라이트')
    await act(async () => byTestId(container, 'language-en').click())
    expect(byTestId(container, 'theme-light').textContent).toBe('Light')
    expect(byTestId(container, 'language-en').getAttribute('aria-pressed')).toBe('true')
    expect(setLanguage).toHaveBeenCalledWith('en')
  })

  it('언어 저장이 실패하면 알림이 바꾼 언어로 보이고, 다시 바꾸면 따라간다', async () => {
    window.api = {
      setLanguage: vi.fn(async () => {
        throw new Error('disk full')
      })
    } as unknown as typeof window.api
    const container = mount()
    await act(async () => byTestId(container, 'language-en').click())
    expect(byTestId(container, 'appearance-error').textContent).toContain(
      "Couldn't save this setting"
    )
    act(() => applyLanguage('ko'))
    expect(byTestId(container, 'appearance-error').textContent).toContain(
      '이 설정을 저장하지 못했어요'
    )
  })
})
