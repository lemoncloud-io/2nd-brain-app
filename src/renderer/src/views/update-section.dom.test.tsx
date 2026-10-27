// @vitest-environment jsdom
// 설정의 앱 업데이트 칸 — 실패마다 할 일 버튼 하나: 확인 실패는 "다시 확인", 설치 실패는 다시 시작 재시도.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { UpdateState } from '../../../shared/ipc-contract'
import { useWorkbench } from '../store/workbench'
import UpdateSection from './update-section'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
const checkUpdate = vi.fn<() => Promise<void>>()
const installUpdate = vi.fn<() => Promise<boolean>>()

const mount = async (
  state: UpdateState | Promise<UpdateState>,
  info: Promise<unknown>
): Promise<HTMLElement> => {
  ;(window as unknown as { api: unknown }).api = {
    getAppInfo: () => info,
    getUpdateState: () => Promise.resolve(state),
    onUpdateChanged: () => () => undefined,
    checkUpdate,
    installUpdate
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<UpdateSection />))
  return container
}

const byTestId = (container: HTMLElement, id: string): HTMLElement | null =>
  container.querySelector(`[data-testid="${id}"]`)

beforeEach(() => {
  checkUpdate.mockReset().mockResolvedValue(undefined)
  installUpdate.mockReset().mockResolvedValue(true)
  useWorkbench.setState({ editorDirty: false, pendingNavigation: null, editing: null })
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('UpdateSection', () => {
  it('확인 실패는 "다시 확인" 을 누르면 지금 다시 본다', async () => {
    const container = await mount(
      { kind: 'failed', during: 'check', detail: 'offline' },
      Promise.resolve({ version: '0.1.0' })
    )
    expect(byTestId(container, 'update-restart')).toBeNull()
    await act(async () => byTestId(container, 'update-check')?.click())
    expect(checkUpdate).toHaveBeenCalledTimes(1)
  })

  it('설치 실패는 다시 시작을 다시 누를 수 있다', async () => {
    const container = await mount(
      { kind: 'failed', during: 'install', detail: 'EACCES' },
      Promise.resolve({ version: '0.1.0' })
    )
    expect(byTestId(container, 'update-check')).toBeNull()
    await act(async () => byTestId(container, 'update-restart')?.click())
    expect(installUpdate).toHaveBeenCalledTimes(1)
  })

  it('버전을 못 읽어도 "불러오는 중" 에 멈추지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const container = await mount({ kind: 'off' }, Promise.reject(new Error('ipc down')))
    expect(byTestId(container, 'update-line')?.textContent).toBe(
      '지금 버전 · 새 버전은 팀에서 보내 드려요'
    )
  })

  it('업데이트 상태를 못 읽으면 확인 실패로 보이고 "다시 확인" 을 준다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const container = await mount(
      Promise.reject(new Error('ipc down')),
      Promise.resolve({ version: '0.1.0' })
    )
    expect(byTestId(container, 'update-line')?.textContent).toContain('확인하지 못했어요')
    expect(byTestId(container, 'update-check')).not.toBeNull()
  })

  it('"다시 확인" 자체가 실패해도 조용히 끝나지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    checkUpdate.mockRejectedValue(new Error('ipc down'))
    const container = await mount(
      { kind: 'failed', during: 'check', detail: 'offline' },
      Promise.resolve({ version: '0.1.0' })
    )
    await act(async () => byTestId(container, 'update-check')?.click())
    expect(container.querySelector('details pre')?.textContent).toBe('ipc down')
  })
})
