// @vitest-environment jsdom
// 설정 맨 아래 '고급' — 개발자용 손잡이는 접혀 있고, 이미 쓰고 있으면 저절로 펼쳐진다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineSettings } from '../../../shared/engine-settings'
import type { EngineStatus } from '../../../shared/ipc-contract'
import type { McpServer } from '../../../shared/mcp-servers'
import { SetupContext } from '../hooks/use-setup'
import type { SetupState } from '../hooks/use-setup-state'
import AdvancedSettings from './advanced-settings'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
const setEngineSettings = vi.fn<(next: EngineSettings) => Promise<EngineSettings>>()

const server = (name: string, enabled: boolean): McpServer => ({
  name,
  enabled,
  kind: 'stdio',
  command: 'npx',
  args: ['-y', name],
  env: {},
  url: ''
})

const mount = async (
  servers: McpServer[],
  engineStatus: EngineStatus | null = null,
  engineSettings: EngineSettings = { engine: 'claude' }
): Promise<HTMLElement> => {
  ;(window as unknown as { api: unknown }).api = {
    getMcpServers: () => Promise.resolve(servers),
    getChatDefaults: () => Promise.resolve({ permissionMode: 'ask', userSettings: true }),
    setMcpServers: (next: McpServer[]) => Promise.resolve(next),
    getEngineSettings: () => Promise.resolve(engineSettings),
    setEngineSettings,
    getDiagnosticsState: () => Promise.resolve({ developerMode: false, traceStartedAt: null })
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  const setup = { engineStatus } as SetupState
  await act(async () =>
    root.render(
      <SetupContext.Provider value={setup}>
        <AdvancedSettings />
      </SetupContext.Provider>
    )
  )
  return container
}

const byTestId = (container: HTMLElement, id: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${id}"]`)

// 접힌 칸 안의 것은 그려져 있어도 hidden 조상 아래라 보이지 않는다
const shown = (el: HTMLElement | null): boolean => !!el && el.closest('[hidden]') === null

const typeInto = (input: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  setEngineSettings.mockReset().mockImplementation((next) => Promise.resolve(next))
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('AdvancedSettings', () => {
  it('처음에는 접혀 있어 MCP·화면 배치 되돌리기가 보이지 않는다', async () => {
    const container = await mount([])
    const toggle = byTestId(container, 'settings-advanced-toggle')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(shown(byTestId(container, 'mcp-name'))).toBe(false)
    expect(shown(byTestId(container, 'panel-reset'))).toBe(false)
  })

  it('누르면 펼쳐져 개발자용 설정이 모두 보인다', async () => {
    const container = await mount([])
    await act(async () => byTestId(container, 'settings-advanced-toggle')?.click())
    expect(byTestId(container, 'settings-advanced-toggle')?.getAttribute('aria-expanded')).toBe(
      'true'
    )
    expect(shown(byTestId(container, 'mcp-name'))).toBe(true)
    expect(shown(byTestId(container, 'panel-reset'))).toBe(true)
    expect(shown(byTestId(container, 'settings-cli-path'))).toBe(true)
  })

  it('고급 토글과 표시 체크박스는 24px 이상 눌린다', async () => {
    const container = await mount([])
    expect(byTestId(container, 'settings-advanced-toggle')?.classList.contains('min-h-6')).toBe(
      true
    )
    await act(async () => byTestId(container, 'settings-advanced-toggle')?.click())
    const box = container.querySelector('[data-testid^="ui-pref:"]')!
    expect(box.className).toContain('before:-inset-1')
  })

  it('켜 둔 MCP 서버가 있으면 저절로 펼쳐진다', async () => {
    const container = await mount([server('github', true)])
    expect(byTestId(container, 'settings-advanced-toggle')?.getAttribute('aria-expanded')).toBe(
      'true'
    )
    expect(shown(byTestId(container, 'mcp-server:github'))).toBe(true)
  })

  it('꺼 둔 서버만 있으면 접힌 채로 둔다', async () => {
    const container = await mount([server('github', false)])
    expect(byTestId(container, 'settings-advanced-toggle')?.getAttribute('aria-expanded')).toBe(
      'false'
    )
  })

  it('접었다 펴도 쓰던 MCP 서버 이름이 남는다', async () => {
    const container = await mount([])
    const toggle = byTestId(container, 'settings-advanced-toggle')
    await act(async () => toggle?.click())
    await act(async () => typeInto(byTestId(container, 'mcp-name') as HTMLInputElement, 'github'))
    await act(async () => toggle?.click())
    await act(async () => toggle?.click())
    expect((byTestId(container, 'mcp-name') as HTMLInputElement).value).toBe('github')
  })

  it('AI 프로그램 위치는 설치 경로를, 못 찾았으면 그 사실을 보인다', async () => {
    const found = await mount([], {
      engine: 'claude',
      cli: { path: '/opt/claude/bin/claude', version: '2.1.0' },
      auth: { loggedIn: true }
    })
    expect(byTestId(found, 'settings-cli-path')?.textContent).toContain('/opt/claude/bin/claude')
    const missing = await mount([], {
      engine: 'claude',
      cli: { missing: true, reason: 'not found' },
      auth: { loggedIn: false }
    })
    expect(byTestId(missing, 'settings-cli-path')?.textContent).toContain('찾지 못했어요')
  })

  it('목록에 없는 모델을 저장해 두었으면 저절로 펼치고 그 이름을 보인다', async () => {
    const container = await mount([], null, { engine: 'claude', model: 'claude-opus-5[1m]' })
    expect(byTestId(container, 'settings-advanced-toggle')?.getAttribute('aria-expanded')).toBe(
      'true'
    )
    expect((byTestId(container, 'engine-model-custom') as HTMLInputElement).value).toBe(
      'claude-opus-5[1m]'
    )
  })

  it('목록의 모델이면 접힌 채로 둔다', async () => {
    const container = await mount([], null, { engine: 'claude', model: 'sonnet' })
    expect(byTestId(container, 'settings-advanced-toggle')?.getAttribute('aria-expanded')).toBe(
      'false'
    )
  })

  it('직접 넣은 이름을 저장하면 지금 엔진에 그 모델 하나로 저장한다', async () => {
    const container = await mount([], null, { engine: 'codex' })
    await act(async () => byTestId(container, 'settings-advanced-toggle')?.click())
    const input = byTestId(container, 'engine-model-custom') as HTMLInputElement
    await act(async () => typeInto(input, ' gpt-5.1-codex '))
    await act(async () => byTestId(container, 'engine-model-custom-save')?.click())
    expect(setEngineSettings).toHaveBeenCalledWith({ engine: 'codex', model: 'gpt-5.1-codex' })
  })

  it('CLI 플래그로 읽힐 이름은 저장하지 못하게 막고 이유를 보인다', async () => {
    const container = await mount([])
    await act(async () => byTestId(container, 'settings-advanced-toggle')?.click())
    await act(async () =>
      typeInto(byTestId(container, 'engine-model-custom') as HTMLInputElement, '--verbose')
    )
    expect((byTestId(container, 'engine-model-custom-save') as HTMLButtonElement).disabled).toBe(
      true
    )
    expect(byTestId(container, 'engine-model-custom-invalid')).not.toBeNull()
  })
})
