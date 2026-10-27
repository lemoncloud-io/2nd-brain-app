// @vitest-environment jsdom
// 언어 단추 — main 이 새 언어를 먼저 알아야 바뀐 직후 다시 읽은 오류도 새 언어로 온다
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LanguagePicker } from './language-picker'
import { useWorkbench } from '../store/workbench'
import { applyLanguage } from '../lib/i18n'
import type { Language } from '../../../shared/language'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const NO_VAULT = { ko: '열린 자료 보관함이 없어요', en: 'No library is open' }

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  applyLanguage('ko')
  delete (window as unknown as { api?: unknown }).api
})

describe('LanguagePicker', () => {
  it('main 언어를 바꾼 뒤 화면을 바꿔, 다시 읽은 위키 목록 오류가 새 언어다', async () => {
    // main 은 renderer 와 따로 언어를 든다 — 요청을 받은 순서대로 답한다
    let mainLanguage: Language = 'ko'
    ;(window as unknown as { api: unknown }).api = {
      setLanguage: vi.fn(async (language: Language) => {
        mainLanguage = language
        return language
      }),
      getVaultStatus: vi.fn(async () => ({ vaultDir: null })),
      listVaultTree: vi.fn(async () => ({ error: NO_VAULT[mainLanguage] })),
      listVaultDocs: vi.fn(async () => ({ error: NO_VAULT[mainLanguage] })),
      listWikiPages: vi.fn(() => Promise.resolve({ error: NO_VAULT[mainLanguage] }))
    }
    useWorkbench.setState({ pagesError: NO_VAULT.ko })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(<LanguagePicker onSaved={() => {}} onSaveFailed={() => {}} />))

    const english = container.querySelector<HTMLButtonElement>('[data-testid="language-en"]')
    act(() => english?.click())
    await vi.waitFor(() => expect(useWorkbench.getState().pagesError).toBe(NO_VAULT.en))
  })
})
