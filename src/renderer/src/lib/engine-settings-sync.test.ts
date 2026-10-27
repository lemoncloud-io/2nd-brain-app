import { afterEach, describe, expect, it, vi } from 'vitest'
import { onEngineSettingsChanged, switchEngine } from './engine-settings-sync'

const listeners = new Map<string, Set<() => void>>()
const fakeWindow = {
  addEventListener: (type: string, fn: () => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type)?.add(fn)
  },
  removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  dispatchEvent: (event: { type: string }) => {
    for (const fn of listeners.get(event.type) ?? []) fn()
    return true
  },
  api: { setEngineSettings: vi.fn((next: unknown) => Promise.resolve(next)) }
}
vi.stubGlobal('window', fakeWindow)

afterEach(() => {
  listeners.clear()
  fakeWindow.api.setEngineSettings.mockClear()
})

describe('switchEngine', () => {
  it('엔진만 저장해 모델을 비우고, 다른 칸이 다시 읽도록 알린다', async () => {
    const heard = vi.fn()
    onEngineSettingsChanged(heard)
    await switchEngine('codex')
    expect(fakeWindow.api.setEngineSettings).toHaveBeenCalledWith({ engine: 'codex' })
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
