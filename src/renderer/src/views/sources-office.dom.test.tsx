// @vitest-environment jsdom
// 워드·파워포인트 미리보기 — 받은 HTML 은 권한 없는 iframe 에, 실패는 상태별 문구와 기본 앱으로 여는 단추로.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { OfficePreview } from './sources-office'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
const openInBrowser = vi.fn(() => Promise.resolve())

const show = async (response: Response | Error): Promise<HTMLElement> => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)))
  )
  window.api = { openInBrowser } as unknown as typeof window.api
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<OfficePreview rel="raw/a.docx" />))
  await vi.waitFor(() => expect(container.querySelector('[role="status"]')).toBeNull())
  return container
}

describe('OfficePreview', () => {
  it('?preview 로 받은 HTML 을 sandbox="" iframe 에 띄운다', async () => {
    const view = await show(new Response('<p>본문</p>', { status: 200 }))
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('vault://local/raw/a.docx?preview')
    const frame = view.querySelector<HTMLIFrameElement>('[data-testid="sources-office"]')
    expect(frame?.getAttribute('sandbox')).toBe('')
    expect(frame?.getAttribute('srcdoc')).toBe('<p>본문</p>')
  })

  it.each([
    [413, '20MB가 넘는 문서는'],
    [404, '문서를 찾지 못했어요'],
    [422, '이 문서를 읽지 못했어요']
  ])('%i 이면 "%s…" 문구와 기본 앱으로 여는 단추', async (status, text) => {
    const view = await show(new Response('', { status }))
    expect(view.querySelector('[data-testid="sources-office-error"]')?.textContent).toContain(text)
    expect(view.querySelector('[data-testid="sources-office"]')).toBeNull()
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="sources-office-open"]')?.click()
    )
    expect(openInBrowser).toHaveBeenCalledWith('raw/a.docx')
  })

  it('요청이 실패해도 읽지 못했다고 알린다', async () => {
    const view = await show(new Error('net down'))
    expect(view.querySelector('[data-testid="sources-office-error"]')?.textContent).toContain(
      '이 문서를 읽지 못했어요'
    )
  })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  openInBrowser.mockClear()
  vi.unstubAllGlobals()
})
