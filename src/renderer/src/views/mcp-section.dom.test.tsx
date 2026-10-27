// @vitest-environment jsdom
// MCP 서버 — 지우기는 확인을 거쳐야 바로 지워지지 않는다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import McpSection from './mcp-section'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const server = {
  name: 'gh',
  enabled: true,
  kind: 'stdio' as const,
  command: 'npx',
  args: ['-y', 'x'],
  env: {},
  url: ''
}

const setMcpServers = vi.fn()

const mount = async (): Promise<HTMLElement> => {
  ;(window as unknown as { api: unknown }).api = {
    getMcpServers: async () => [server],
    setMcpServers: (next: unknown) => {
      setMcpServers(next)
      return Promise.resolve([])
    },
    probeMcpServer: async () => ({ ok: true as const })
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<McpSection />)
  })
  return container
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  delete (window as unknown as { api?: unknown }).api
})

const byTestId = (container: HTMLElement, id: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${id}"]`)

const click = (el: HTMLElement): void => {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('McpSection', () => {
  it('지우기를 누르면 확인이 먼저 뜨고, 확인해야 지워진다', async () => {
    setMcpServers.mockClear()
    const container = await mount()
    click(byTestId(container, 'mcp-remove:gh')!)
    // Radix 대화상자는 포털에 달리므로 document 에서 찾는다
    const dialog = (): HTMLElement | null =>
      document.querySelector('[data-testid="mcp-remove-confirm"]')
    expect(dialog()).not.toBeNull()
    expect(setMcpServers).not.toHaveBeenCalled()
    click(document.querySelector('[data-testid="mcp-remove-confirm-ok"]')!)
    await act(async () => undefined)
    expect(setMcpServers).toHaveBeenCalledWith([])
  })

  it('예시 채우기가 이름·대상 입력칸을 채운다', async () => {
    const container = await mount()
    click(byTestId(container, 'mcp-preset-stdio')!)
    expect((byTestId(container, 'mcp-name') as HTMLInputElement).value).toContain('local-tools')
    expect((byTestId(container, 'mcp-target') as HTMLInputElement).value).toContain('npx')
  })

  it('연결 확인을 누르면 결과가 줄에 보인다', async () => {
    const container = await mount()
    click(byTestId(container, 'mcp-probe:gh')!)
    await act(async () => undefined)
    const result = byTestId(container, 'mcp-probe-result:gh')
    expect(result).not.toBeNull()
    expect(result!.textContent).toContain('닿았어요')
  })
})
