// 보관함별 감시자 — 같은 보관함은 하나로 공유하고, 아무도 안 보면 멈춘다.
import { describe, expect, it, vi } from 'vitest'
import { VaultWatchers } from './vault-watchers'

const fakeWatcher = (): { stop: () => void; release: () => void } => ({
  stop: vi.fn(),
  release: vi.fn()
})

describe('VaultWatchers', () => {
  it('같은 보관함은 감시자 하나로 공유한다 — test: vault-watchers.test.ts', () => {
    const create = vi.fn(() => fakeWatcher())
    const watchers = new VaultWatchers(create)
    const first = watchers.ensure('/vaults/a', { onChange: () => {}, onError: () => {} })
    const second = watchers.ensure('/vaults/a', { onChange: () => {}, onError: () => {} })
    expect(second).toBe(first)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('다른 보관함은 따로 만든다', () => {
    const create = vi.fn(() => fakeWatcher())
    const watchers = new VaultWatchers(create)
    watchers.ensure('/vaults/a', { onChange: () => {}, onError: () => {} })
    watchers.ensure('/vaults/b', { onChange: () => {}, onError: () => {} })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('참조가 남아 있으면 멈추지 않고, 0이 되면 멈춘다', () => {
    const watcher = fakeWatcher()
    const watchers = new VaultWatchers(() => watcher)
    const opts = { onChange: () => {}, onError: () => {} }
    watchers.ensure('/vaults/a', opts)
    watchers.ensure('/vaults/a', opts)
    watchers.release('/vaults/a')
    expect(watcher.stop).not.toHaveBeenCalled()
    watchers.release('/vaults/a')
    expect(watcher.stop).toHaveBeenCalledTimes(1)
    expect(watchers.refs('/vaults/a')).toBe(0)
  })

  it('모르는 보관함을 풀어도 조용하다', () => {
    const watchers = new VaultWatchers(() => fakeWatcher())
    expect(() => watchers.release('/vaults/nope')).not.toThrow()
  })

  it('drop은 참조 수와 상관없이 멈추고 잊는다 — 폴더 삭제 신호용', () => {
    const watcher = fakeWatcher()
    const watchers = new VaultWatchers(() => watcher)
    const opts = { onChange: () => {}, onError: () => {} }
    watchers.ensure('/vaults/a', opts)
    watchers.ensure('/vaults/a', opts)
    watchers.drop('/vaults/a')
    expect(watcher.stop).toHaveBeenCalledTimes(1)
    expect(watchers.refs('/vaults/a')).toBe(0)
    expect(watchers.dirs()).toEqual([])
  })

  it('dirs와 peek로 살아 있는 감시를 본다', () => {
    const watcher = fakeWatcher()
    const watchers = new VaultWatchers(() => watcher)
    const opts = { onChange: () => {}, onError: () => {} }
    expect(watchers.peek('/vaults/a')).toBeNull()
    watchers.ensure('/vaults/a', opts)
    expect(watchers.peek('/vaults/a')?.watcher).toBe(watcher)
    expect(watchers.dirs()).toEqual(['/vaults/a'])
  })
})
