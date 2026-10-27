// @vitest-environment jsdom
// main 이 보낸 오류 문장은 받은 때의 언어다 — 화면 언어를 바꾸면 실패해 둔 목록을 다시 읽어 새 언어로 받는다
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkbench } from './workbench'
import { applyLanguage, getLanguage } from '../lib/i18n'

const NO_VAULT = { ko: '열린 자료 보관함이 없어요', en: 'No library is open' }

afterEach(() => {
  applyLanguage('ko')
  delete (window as unknown as { api?: unknown }).api
})

describe('화면 언어를 바꾸면', () => {
  it('실패해 둔 트리·문서·위키 목록을 다시 읽어 오류를 새 언어로 받는다', async () => {
    const reply = (): { error: string } => ({ error: NO_VAULT[getLanguage()] })
    const api = {
      getVaultStatus: vi.fn(async () => ({ vaultDir: null })),
      listVaultTree: vi.fn(async () => reply()),
      listVaultDocs: vi.fn(async () => reply()),
      listWikiPages: vi.fn(async () => reply())
    }
    ;(window as unknown as { api: unknown }).api = api
    const store = useWorkbench.getState()
    await Promise.all([store.refreshTree(), store.refreshDocs(), store.refreshPages()])
    expect(useWorkbench.getState().treeError).toBe(NO_VAULT.ko)

    applyLanguage('en')
    await vi.waitFor(() => {
      const s = useWorkbench.getState()
      expect([s.treeError, s.docsError, s.pagesError]).toEqual([
        NO_VAULT.en,
        NO_VAULT.en,
        NO_VAULT.en
      ])
    })
  })

  it('실패가 없으면 다시 읽지 않는다', async () => {
    const api = {
      getVaultStatus: vi.fn(async () => ({ vaultDir: '/v' })),
      listVaultTree: vi.fn(async () => []),
      listVaultDocs: vi.fn(async () => []),
      listWikiPages: vi.fn(async () => [])
    }
    ;(window as unknown as { api: unknown }).api = api
    useWorkbench.setState({ treeError: null, docsError: null, pagesError: null })
    applyLanguage('en')
    await Promise.resolve()
    expect(api.listVaultTree).not.toHaveBeenCalled()
    expect(api.listVaultDocs).not.toHaveBeenCalled()
    expect(api.listWikiPages).not.toHaveBeenCalled()
  })
})
