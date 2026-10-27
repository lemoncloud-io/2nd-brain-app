// @vitest-environment jsdom
// 다시 시작 버튼 — 받아 두었을 때만 서고, 저장 안 한 편집이 있으면 먼저 묻고, 두 번 눌러도 한 번만 설치한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { UpdateState } from '../../../../shared/ipc-contract'
import { useWorkbench } from '../../store/workbench'
import { UpdateRestart } from './update-restart'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
let push: (state: UpdateState) => void = () => undefined
const installUpdate = vi.fn<() => Promise<boolean>>()

const setApi = (initial: UpdateState): void => {
  ;(window as unknown as { api: unknown }).api = {
    getUpdateState: () => Promise.resolve(initial),
    onUpdateChanged: (listener: (state: UpdateState) => void) => {
      push = listener
      return () => undefined
    },
    installUpdate
  }
}

const mount = async (): Promise<HTMLElement> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<UpdateRestart />))
  return container
}

const button = (container: HTMLElement): HTMLButtonElement | null =>
  container.querySelector('[data-testid="sidebar-update-restart"]')

beforeEach(() => {
  installUpdate.mockReset().mockResolvedValue(true)
  useWorkbench.setState({ editorDirty: false, pendingNavigation: null, editing: null })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('UpdateRestart', () => {
  it('받아 둔 새 버전이 없으면 아무것도 그리지 않는다', async () => {
    setApi({ kind: 'failed', during: 'check', detail: 'offline' })
    const container = await mount()
    expect(button(container)).toBeNull()
  })

  it('상태 푸시로 준비되면 버튼이 선다', async () => {
    setApi({ kind: 'downloading', version: '0.2.0', percent: 90 })
    const container = await mount()
    expect(button(container)).toBeNull()
    await act(async () => push({ kind: 'ready', version: '0.2.0' }))
    expect(button(container)?.textContent).toContain('새 버전 0.2.0 · 다시 시작')
  })

  it('두 번 눌러도 한 번만 설치한다', async () => {
    setApi({ kind: 'ready', version: '0.2.0' })
    const container = await mount()
    await act(async () => {
      button(container)?.click()
      button(container)?.click()
    })
    expect(installUpdate).toHaveBeenCalledTimes(1)
    expect(button(container)?.disabled).toBe(true)
  })

  it('저장 안 한 편집이 있으면 확인 전에는 설치하지 않고, 취소하면 끝까지 안 한다', async () => {
    setApi({ kind: 'ready', version: '0.2.0' })
    useWorkbench.setState({ editorDirty: true })
    const container = await mount()
    await act(async () => button(container)?.click())
    expect(installUpdate).not.toHaveBeenCalled()
    expect(useWorkbench.getState().pendingNavigation).not.toBeNull()
    act(() => useWorkbench.getState().cancelNavigation())
    expect(installUpdate).not.toHaveBeenCalled()
  })

  it('버리기를 고르면 편집 표시를 풀고 설치한다 — 닫기 확인이 설치를 막지 않게', async () => {
    setApi({ kind: 'ready', version: '0.2.0' })
    useWorkbench.setState({ editorDirty: true })
    const container = await mount()
    await act(async () => button(container)?.click())
    await act(async () => useWorkbench.getState().confirmNavigation())
    expect(useWorkbench.getState().editorDirty).toBe(false)
    expect(installUpdate).toHaveBeenCalledTimes(1)
  })

  it('설치가 실패로 돌아오면 버튼을 다시 살린다', async () => {
    setApi({ kind: 'ready', version: '0.2.0' })
    installUpdate.mockResolvedValue(false)
    const container = await mount()
    await act(async () => button(container)?.click())
    expect(button(container)?.disabled).toBe(false)
  })
})
