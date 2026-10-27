// @vitest-environment jsdom
// 준비 읽기 — 한 곳의 성공이 다른 곳의 실패를 지우면 안 된다(회귀).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SetupState } from './use-setup-state'
import { useSetupStateSource } from './use-setup-state'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Api = Record<string, (...args: never[]) => unknown>

const vaultOk = { vaultDir: '/v', valid: true, missing: [] }
const engineOk = {
  engine: 'claude',
  cli: { path: '/c', version: '2.1.0' },
  auth: { loggedIn: true }
}

const makeApi = (): { api: Api; calls: Api } => {
  const calls: Api = {}
  const api: Api = {
    getVaultStatus: vi.fn(() => Promise.resolve(vaultOk)),
    getEngineStatus: vi.fn(() => Promise.resolve(engineOk)),
    getJourney: vi.fn(() => Promise.resolve(null)),
    getRemote: vi.fn(() => Promise.resolve(null)),
    githubAuthState: vi.fn(() => Promise.resolve({ loggedIn: false })),
    getSyncState: vi.fn(() =>
      Promise.resolve({
        received: 0,
        conflicts: [],
        at: null,
        error: null,
        running: false,
        ahead: 0,
        aheadFiles: [],
        newDocs: [],
        behind: 0,
        shared: null,
        skipped: null,
        held: null,
        via: null
      })
    ),
    syncVault: vi.fn(() =>
      Promise.resolve({
        received: 0,
        conflicts: [],
        at: null,
        error: null,
        running: false,
        ahead: 0,
        aheadFiles: [],
        newDocs: [],
        behind: 0,
        shared: null,
        skipped: null,
        held: null,
        via: null
      })
    ),
    onWikiChanged: vi.fn(() => () => {}),
    onActivityChanged: vi.fn(() => () => {}),
    onSyncChanged: vi.fn(() => () => {})
  }
  void calls
  return { api, calls }
}

let root: Root | null = null
let seen: SetupState | null = null

const renderSource = (api: Api): void => {
  ;(window as unknown as { api: Api }).api = api
  seen = null
  const Probe = (): null => {
    seen = useSetupStateSource()
    return null
  }
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  act(() => {
    root?.render(<Probe />)
  })
}

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('useSetupStateSource error merge', () => {
  it('엔진 실패 뒤 보관함 성공이 와도 에러가 남는다', async () => {
    const { api } = makeApi()
    let rejectEngine!: (e: unknown) => void
    let resolveVault!: (v: unknown) => void
    api.getEngineStatus = vi.fn(
      () =>
        new Promise<never>((_, reject) => {
          rejectEngine = reject
        })
    )
    api.getVaultStatus = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveVault = resolve
        })
    )
    renderSource(api)
    await flush()
    await act(async () => {
      rejectEngine(new Error('AI 연결 끊김'))
      await Promise.resolve()
    })
    await flush()
    expect(seen?.error).not.toBeNull()
    await act(async () => {
      resolveVault(vaultOk)
      await Promise.resolve()
    })
    await flush()
    expect(seen?.error).not.toBeNull()
    expect(seen?.vault).toBe('ok')
  })

  it('보관함 실패 뒤 엔진 성공이 와도 에러가 남는다', async () => {
    const { api } = makeApi()
    let rejectVault!: (e: unknown) => void
    let resolveEngine!: (v: unknown) => void
    api.getVaultStatus = vi.fn(
      () =>
        new Promise<never>((_, reject) => {
          rejectVault = reject
        })
    )
    api.getEngineStatus = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveEngine = resolve
        })
    )
    renderSource(api)
    await flush()
    await act(async () => {
      rejectVault(new Error('보관함 읽기 실패'))
      await Promise.resolve()
    })
    await flush()
    expect(seen?.error).not.toBeNull()
    await act(async () => {
      resolveEngine(engineOk)
      await Promise.resolve()
    })
    await flush()
    expect(seen?.error).not.toBeNull()
    expect(seen?.engine).toBe('ok')
  })

  it('같은 쪽이 다시 성공하면 그 에러는 지워진다', async () => {
    const { api } = makeApi()
    api.getEngineStatus = vi.fn(() => Promise.reject(new Error('AI 연결 끊김')))
    renderSource(api)
    await flush()
    expect(seen?.error).not.toBeNull()
    api.getEngineStatus = vi.fn(() => Promise.resolve(engineOk))
    await act(async () => {
      seen?.refresh()
      await Promise.resolve()
    })
    await flush()
    expect(seen?.engine).toBe('ok')
    expect(seen?.error).toBeNull()
  })

  it('받기 실패는 조용히 넘기지 않고 sync.error에 남는다', async () => {
    const { api } = makeApi()
    api.syncVault = vi.fn(() => Promise.reject(new Error('EACCES')))
    renderSource(api)
    await flush()
    await act(async () => {
      seen?.receiveTeamChanges()
      await Promise.resolve()
    })
    await flush()
    expect(seen?.sync.error).not.toBeNull()
  })
})
