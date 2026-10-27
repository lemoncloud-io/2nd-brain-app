// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { InlineEditBar } from './inline-edit-bar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const typeInto = (input: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('InlineEditBar', () => {
  it('고치기가 실패하면 엔진 원문 대신 할 일 문장을 보이고 원문은 "자세히" 에 접는다', async () => {
    const raw = 'TypeError: cannot read properties of undefined\n    at runInline (cli.js:10:4)'
    vi.stubGlobal('api', {
      inlineEdit: vi.fn().mockResolvedValue({ error: raw }),
      cancelInlineEdit: vi.fn()
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <InlineEditBar
          rel="wiki/a.md"
          target={{ from: 0, to: 2, selection: '하나' }}
          docText={() => '하나 둘'}
          onAccept={vi.fn()}
          onClose={vi.fn()}
        />
      )
    )
    const input = container.querySelector<HTMLInputElement>('[data-testid="ai-edit-instruction"]')!
    act(() => typeInto(input, '더 짧게'))
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="ai-edit-run"]')!.click()
    })
    const error = container.querySelector('[data-testid="ai-edit-error"]')
    expect(error?.getAttribute('role')).toBe('alert')
    expect(error?.querySelector('p')?.textContent).toContain('고치지 못했어요')
    expect(error?.querySelector('details pre')?.textContent).toBe(raw)
  })
})
