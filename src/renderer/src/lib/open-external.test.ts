import { beforeEach, describe, expect, it, vi } from 'vitest'

const openWeb = vi.fn()
vi.mock('../store/workbench', () => ({ useWorkbench: { getState: () => ({ openWeb }) } }))
const api = { openExternal: vi.fn(() => Promise.resolve()) }
vi.stubGlobal('window', { api })

const { openExternal } = await import('./open-external')

beforeEach(() => {
  openWeb.mockClear()
  api.openExternal.mockClear()
})

describe('openExternal — 바깥 링크를 어디서 여나', () => {
  it('http(s) 주소는 앱 안의 새 웹 탭으로', () => {
    openExternal('https://a.example/x')
    expect(openWeb).toHaveBeenCalledWith('https://a.example/x')
    expect(api.openExternal).not.toHaveBeenCalled()
  })

  it('⌘/Ctrl+클릭(external)은 기본 브라우저로', () => {
    openExternal('https://a.example/x', { external: true })
    expect(openWeb).not.toHaveBeenCalled()
    expect(api.openExternal).toHaveBeenCalledWith('https://a.example/x')
  })

  it('mailto 는 앱 안에서 열 수 없어 늘 바깥으로', () => {
    openExternal('mailto:a@example.com')
    expect(openWeb).not.toHaveBeenCalled()
    expect(api.openExternal).toHaveBeenCalledWith('mailto:a@example.com')
  })
})
