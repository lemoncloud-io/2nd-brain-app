// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../store/workbench'
import { useVaultSwitch } from './use-vault-switch'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('useVaultSwitch', () => {
  let root: Root | null = null
  const onSwitch = vi.fn()

  const Probe = (): null => {
    useVaultSwitch(onSwitch)
    return null
  }

  beforeEach(() => {
    onSwitch.mockClear()
    useWorkbench.setState({ vaultDir: null })
    root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root?.render(createElement(Probe)))
  })

  afterEach(() => {
    act(() => root?.unmount())
    document.body.innerHTML = ''
  })

  it('처음 읽는 것은 전환이 아니다', () => {
    act(() => useWorkbench.setState({ vaultDir: '/vault/a' }))
    expect(onSwitch).not.toHaveBeenCalled()
  })

  it('다른 보관함으로 바뀌면 한 번 부른다', () => {
    act(() => useWorkbench.setState({ vaultDir: '/vault/a' }))
    act(() => useWorkbench.setState({ vaultDir: '/vault/b' }))
    act(() => useWorkbench.setState({ vaultDir: '/vault/b' }))
    expect(onSwitch).toHaveBeenCalledTimes(1)
  })
})
