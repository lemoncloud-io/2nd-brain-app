// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TemplateMenu } from './template-menu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
Object.assign(window, { api: { listTemplates: vi.fn(async () => []) } })
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const mocked = (): ReturnType<typeof vi.fn> =>
  (window as unknown as { api: { listTemplates: ReturnType<typeof vi.fn> } }).api.listTemplates

const press = (button: HTMLButtonElement | null): void => {
  // Radix Trigger는 pointerdown에 열린다 — jsdom click만으로는 안 열림
  button?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  button?.click()
}

const open = async (): Promise<void> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<TemplateMenu onPick={() => {}} />)
  })
  await act(async () => {
    press(document.querySelector<HTMLButtonElement>('[data-testid="wiki-template"]'))
  })
}

describe('TemplateMenu 읽기 실패', () => {
  it('못 읽으면 없음이 아니라 실패를 알린다', async () => {
    mocked().mockRejectedValueOnce(new Error('boom'))
    await open()
    expect(document.querySelector('[data-testid="template-menu"]')?.textContent).toContain(
      '읽지 못했어요'
    )
  })

  it('실패 뒤 닫았다 열면 없음이 아니라 읽는 중으로 돌아간다', async () => {
    mocked().mockRejectedValueOnce(new Error('boom'))
    await open()
    expect(document.querySelector('[data-testid="template-menu"]')?.textContent).toContain(
      '읽지 못했어요'
    )
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    mocked().mockImplementationOnce(() => new Promise<never>(() => {}))
    await act(async () => {
      press(document.querySelector<HTMLButtonElement>('[data-testid="wiki-template"]'))
    })
    const text = document.querySelector('[data-testid="template-menu"]')?.textContent ?? ''
    expect(text).toContain('읽는 중')
    expect(text).not.toContain('템플릿이 없어요')
  })

  it('읽어서 비어 있으면 없음으로 보인다 (회귀)', async () => {
    mocked().mockResolvedValueOnce([])
    await open()
    expect(document.querySelector('[data-testid="template-menu"]')?.textContent).toContain(
      '템플릿이 없어요'
    )
  })

  it('읽어서 있으면 고른다 (회귀)', async () => {
    mocked().mockResolvedValueOnce([{ rel: 'templates/a.md', name: 'a' }])
    const picked: string[] = []
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    await act(async () => {
      root.render(<TemplateMenu onPick={(rel) => picked.push(rel)} />)
    })
    await act(async () => {
      press(document.querySelector<HTMLButtonElement>('[data-testid="wiki-template"]'))
    })
    expect(document.querySelector('[data-testid="template-option:templates/a.md"]')).not.toBeNull()
    expect(picked).toEqual([])
  })
})
