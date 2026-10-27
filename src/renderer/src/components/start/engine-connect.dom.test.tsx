// @vitest-environment jsdom
// 엔진 연결 — 없음·로그인 대기 두 자리에서 같은 가입 링크를 보인다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../../hooks/use-setup'
import type { SetupState } from '../../hooks/use-setup-state'
import { ENGINE_META } from '../../lib/install-guide'
import { EngineConnect } from './engine-connect'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const setup = (engine: string): SetupState =>
  ({
    engine,
    engineKind: 'claude',
    engineStatus: null,
    refresh: vi.fn()
  }) as unknown as SetupState

const mount = (engine: string): HTMLElement => {
  ;(window as unknown as { api: unknown }).api = {
    onInstallEvent: () => () => undefined,
    getAppInfo: async () => ({ platform: 'darwin' })
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <SetupContext.Provider value={setup(engine)}>
        <EngineConnect />
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

describe('EngineConnect', () => {
  it.each(['missing', 'logged-out'])('%s 자리에서 가입 링크가 같은 주소다', (engine) => {
    const container = mount(engine)
    const link = container.querySelector('[data-testid="engine-join"]')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe(ENGINE_META.claude.joinUrl)
  })
})
