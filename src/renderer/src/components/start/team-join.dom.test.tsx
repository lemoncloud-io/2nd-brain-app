// @vitest-environment jsdom
// 팀 들어가기 — 로그아웃에도 자리가 비지 않고, 주소 받기는 로그인 전 잠긴다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../../hooks/use-setup'
import type { SetupState } from '../../hooks/use-setup-state'
import { TeamVaultList } from './team-vault-list'
import { VaultCreate } from './vault-create'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const setup = (): SetupState =>
  ({
    github: { loggedIn: false },
    refreshGithub: vi.fn(),
    refresh: vi.fn(),
    refreshJourney: vi.fn()
  }) as unknown as SetupState

const mount = (node: React.ReactNode): HTMLElement => {
  ;(window as unknown as { api: unknown }).api = {
    githubAuthStart: vi.fn(async () => ({ ok: false as const, reason: 'x' })),
    openExternal: vi.fn(async () => undefined),
    githubAuthFinish: vi.fn(async () => ({ ok: false as const, reason: 'x' })),
    githubTeamVaults: vi.fn(async () => ({ ok: true as const, vaults: [], invitations: [] }))
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(<SetupContext.Provider value={setup()}>{node}</SetupContext.Provider>)
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

describe('TeamJoin', () => {
  it('로그아웃에도 목록 자리가 남아 로그인을 예고한다', () => {
    const container = mount(<TeamVaultList busy={false} onPick={() => undefined} />)
    const soon = byTestId(container, 'team-vaults-soon')
    expect(soon).not.toBeNull()
    expect(soon!.textContent).toContain('로그인하면')
  })

  it('로그아웃에는 주소로 받기가 잠기고 사유를 말한다', () => {
    const container = mount(<VaultCreate onResult={() => undefined} />)
    act(() => {
      byTestId(container, 'vault-import-open')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    act(() => {
      byTestId(container, 'vault-import-url-open')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    const input = byTestId(container, 'vault-import-url') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, 'https://github.com/acme/2nd-brain')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const start = byTestId(container, 'vault-import-start') as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(start.title).toContain('GitHub에 로그인')
    const note = byTestId(container, 'vault-import-login-note')
    expect(note).not.toBeNull()
    expect(note!.textContent).toContain('GitHub에 로그인')
  })

  it('만들기를 누르면 경과가 보이는 진행줄이 뜬다', () => {
    ;(window as unknown as { api: unknown }).api = {
      createVault: vi.fn(() => new Promise(() => {}))
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => {
      root.render(
        <SetupContext.Provider value={setup()}>
          <VaultCreate onResult={() => undefined} />
        </SetupContext.Provider>
      )
    })
    act(() => {
      byTestId(container, 'vault-create')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const progress = byTestId(container, 'vault-create-progress')
    expect(progress).not.toBeNull()
    expect(progress!.textContent).toContain('만드는 중')
  })

  it('로그인하면 주소로 받기가 열린다', () => {
    const logged = {
      github: { loggedIn: true },
      refreshGithub: vi.fn(),
      refresh: vi.fn(),
      refreshJourney: vi.fn()
    } as unknown as SetupState
    ;(window as unknown as { api: unknown }).api = {
      githubTeamVaults: async () => ({ ok: true as const, vaults: [], invitations: [] })
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => {
      root.render(
        <SetupContext.Provider value={logged}>
          <VaultCreate onResult={() => undefined} />
        </SetupContext.Provider>
      )
    })
    act(() => {
      byTestId(container, 'vault-import-open')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    act(() => {
      byTestId(container, 'vault-import-url-open')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    const input = byTestId(container, 'vault-import-url') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, 'https://github.com/acme/2nd-brain')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect((byTestId(container, 'vault-import-start') as HTMLButtonElement).disabled).toBe(false)
  })
})
