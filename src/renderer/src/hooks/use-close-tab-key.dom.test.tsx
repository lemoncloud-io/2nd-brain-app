// @vitest-environment jsdom
// main이 가로챈 ⌘W — 창 대신 탭을 닫는다. Alt+⌘W 명령과 같은 closeTab 한 곳으로 간다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkbench } from '../store/workbench'
import { useCloseTabKey } from './use-close-tab-key'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
let push: (() => void) | null = null

const Host = (): null => {
  useCloseTabKey()
  return null
}

const mount = (): void => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<Host />))
}

describe('useCloseTabKey', () => {
  it('main 푸시가 오면 켜진 탭을 닫는다', () => {
    push = null
    window.api = {
      onCloseCurrentTab: vi.fn((listener: () => void) => {
        push = listener
        return () => undefined
      })
    } as unknown as typeof window.api
    mount()
    act(() => useWorkbench.getState().newTab())
    expect(useWorkbench.getState().tabs).toHaveLength(2)
    act(() => push?.())
    expect(useWorkbench.getState().tabs).toHaveLength(1)
  })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  push = null
})
