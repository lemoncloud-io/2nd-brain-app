// @vitest-environment jsdom
// 탭 가드 — 보관함 행방불명 때 다음 행동을 말한다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../hooks/use-setup'
import type { SetupState } from '../hooks/use-setup-state'
import { SetupGate } from './setup-gate'
import { applyLanguage } from '../lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const mount = (): HTMLElement => {
  const setup = {
    vault: 'invalid',
    engine: 'ok',
    engineKind: 'claude',
    refresh: vi.fn()
  } as unknown as SetupState
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <SetupContext.Provider value={setup}>
        <SetupGate id="doc" needs={['vault']}>
          <p data-testid="child">자식</p>
        </SetupGate>
      </SetupContext.Provider>
    )
  })
  return container
}

afterEach(() => {
  act(() => applyLanguage('ko'))
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('SetupGate', () => {
  it('보관함 행방불명 때 설정행과 시작하기 대안을 함께 말한다', () => {
    const container = mount()
    expect(container.querySelector('[data-testid="setup-gate:doc"]')).not.toBeNull()
    expect(container.textContent).toContain('시작하기')
    expect(container.querySelector('[data-testid="child"]')).toBeNull()
  })

  it('이미 떠 있는 안내가 언어를 바꾸면 그 자리에서 영어로 바뀐다', () => {
    const container = mount()
    act(() => applyLanguage('en'))
    expect(container.textContent).toContain("Can't open the library")
    expect(container.textContent).toContain('Go to Settings')
    expect(container.textContent).not.toMatch(/[가-힣]/)
  })
})
