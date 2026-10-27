// @vitest-environment jsdom
// GitHub 로그인 — 대기 중 취소가 대기 화면을 닫는다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../../hooks/use-setup'
import type { SetupState } from '../../hooks/use-setup-state'
import { GithubLogin } from './github-login'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const setup = (): SetupState =>
  ({
    github: { loggedIn: false },
    refreshGithub: vi.fn()
  }) as unknown as SetupState

const mount = (onLater?: () => void): HTMLElement => {
  ;(window as unknown as { api: unknown }).api = {
    githubAuthStart: vi.fn(async () => ({
      ok: true as const,
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device'
    })),
    openExternal: vi.fn(async () => undefined),
    // 끝나지 않는 승인 대기 — 취소가 아니면 화면이 그대로다
    githubAuthFinish: vi.fn(() => new Promise(() => undefined))
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <SetupContext.Provider value={setup()}>
        <GithubLogin onLater={onLater} />
      </SetupContext.Provider>
    )
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

describe('GithubLogin', () => {
  it('로그인을 누르면 코드·복사·열기·대기가 보이고, 취소가 대기를 닫는다', async () => {
    const container = mount()
    await act(async () => {
      click(byTestId(container, 'github-login-start')!)
    })
    expect(byTestId(container, 'github-user-code')?.textContent).toBe('ABCD-1234')
    expect(byTestId(container, 'github-cancel')).not.toBeNull()
    expect(byTestId(container, 'github-wait-limit')?.textContent).toContain('15분')
    click(byTestId(container, 'github-cancel')!)
    expect(byTestId(container, 'github-user-code')).toBeNull()
    expect(byTestId(container, 'github-login-start')).not.toBeNull()
  })

  it('로그인 전에는 계정 만들기 링크를 함께 보인다', () => {
    const container = mount()
    const link = byTestId(container, 'github-signup')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('https://github.com/signup')
  })

  it('첫 실행의 필수 단계면 내 GitHub 비공개 저장소에 올라간다고 먼저 밝히고, 나중에 하기를 준다', () => {
    const onLater = vi.fn()
    const container = mount(onLater)
    expect(byTestId(container, 'github-private-note')!.textContent).toContain('비공개 저장소')
    expect(byTestId(container, 'github-login-state')!.textContent).not.toContain('팀 보관함')
    click(byTestId(container, 'github-later')!)
    expect(onLater).toHaveBeenCalledOnce()
  })

  it('설정·팀 보관함에서는 나중에 하기가 없다', () => {
    const container = mount()
    expect(byTestId(container, 'github-later')).toBeNull()
    expect(byTestId(container, 'github-private-note')).toBeNull()
  })
})
