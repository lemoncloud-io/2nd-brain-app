import { describe, expect, it, vi } from 'vitest'
import type { SyncState } from '../../shared/ipc-contract'
import {
  createSyncStateStore,
  createSyncStoreRegistry,
  IDLE_SYNC,
  pushBlockedReason,
  type SyncCounts
} from './sync-state'

/** 세기를 손으로 끝내는 가짜 — 끝나는 순서를 테스트가 정한다 */
const manualCount = (): {
  count: () => Promise<SyncCounts>
  finish: (index: number, ahead: number) => void
} => {
  const pending: ((counts: SyncCounts) => void)[] = []
  return {
    count: () => new Promise((done) => pending.push(done)),
    finish: (index, ahead) =>
      pending[index]?.({ ahead, aheadFiles: [], newDocs: [], behind: 0, shared: null })
  }
}

describe('sync state store', () => {
  it('세는 사이 받기가 끝나도 끝난 결과를 받는 중으로 되돌리지 않는다', async () => {
    const counter = manualCount()
    const sent: SyncState[] = []
    const store = createSyncStateStore({ count: counter.count, send: (s) => sent.push(s) })

    const started = store.patch({ running: true })
    const read = store.recount()
    counter.finish(0, 0)
    await started
    const done = store.patch({ running: false, received: 1, at: 1 })
    // 받기가 끝난 뒤, 그 전에 시작한 화면 읽기가 먼저 끝난다
    counter.finish(1, 0)
    const late = await read
    counter.finish(2, 0)
    await done

    expect(late.running).toBe(false)
    expect(store.current()).toMatchObject({ running: false, received: 1 })
    expect(sent.at(-1)?.running).toBe(false)
  })

  it('늦게 시작한 세기가 먼저 끝나면 먼저 시작한 세기의 수는 버린다', async () => {
    const counter = manualCount()
    const store = createSyncStateStore({ count: counter.count, send: () => undefined })
    const older = store.recount()
    const newer = store.recount()
    counter.finish(1, 0)
    await newer
    counter.finish(0, 3)
    await older
    expect(store.current().ahead).toBe(0)
  })

  it('보관함을 바꾸기 전에 시작한 세기는 새 상태에 얹지 않는다', async () => {
    const counter = manualCount()
    const store = createSyncStateStore({ count: counter.count, send: () => undefined })
    const old = store.recount()
    store.reset()
    counter.finish(0, 7)
    await old
    expect(store.current().ahead).toBe(0)
  })

  it('세기가 실패해도 결과는 보내고 지난 수를 둔다', async () => {
    const sent: SyncState[] = []
    let fail = false
    const store = createSyncStateStore({
      count: async () => {
        if (fail) throw new Error('fatal: not a git repository')
        return { ahead: 2, aheadFiles: ['a.md'], newDocs: [], behind: 0, shared: null }
      },
      send: (s) => sent.push(s)
    })
    await store.patch({ running: true })
    fail = true
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const done = await store.patch({ running: false, received: 1 })
    errors.mockRestore()
    expect(done).toMatchObject({ running: false, received: 1, ahead: 2 })
    expect(sent.at(-1)).toMatchObject({ running: false })
  })

  it('보관함이 바뀌면 바로 빈 상태를 보낸다', () => {
    const sent: SyncState[] = []
    const store = createSyncStateStore({
      count: async () => ({ ahead: 2, aheadFiles: ['a.md'], newDocs: [], behind: 0, shared: null }),
      send: (s) => sent.push(s)
    })
    store.reset()
    expect(sent).toEqual([store.current()])
    expect(store.current().ahead).toBe(0)
  })

  it('받은 뒤 앱 밖에서 팀 저장소를 붙였으면 다시 셀 때 "연결 안 됨" 을 걷어낸다', async () => {
    let remote = false
    const store = createSyncStateStore({
      count: async () => ({ ahead: 0, aheadFiles: [], newDocs: [], behind: 1, shared: null }),
      hasRemote: () => remote,
      send: () => {}
    })
    await store.patch({ skipped: 'no-remote' })
    expect(store.current().skipped).toBe('no-remote')

    remote = true
    await store.recount()
    expect(store.current().skipped).toBeNull()
  })
})

describe('pushBlockedReason', () => {
  it('받기가 평소대로 끝났거나 받을 것이 없었으면 올린다', () => {
    expect(pushBlockedReason(IDLE_SYNC)).toBeNull()
    expect(pushBlockedReason({ ...IDLE_SYNC, skipped: 'review-pending' })).toBeNull()
  })

  it('받지 못했으면 그 사유로 멈춘다', () => {
    expect(pushBlockedReason({ ...IDLE_SYNC, error: '팀 저장소에 연결하지 못했다' })).toBe(
      '팀 저장소에 연결하지 못했다'
    )
  })

  it('고르기를 기다리는 문서가 있으면 고른 뒤 올리라고 한다', () => {
    expect(pushBlockedReason({ ...IDLE_SYNC, conflicts: ['wiki/INDEX.md'] })).toContain(
      '승인에서 남길 쪽을 고른 뒤'
    )
  })

  it.each(['stuck', 'switch-blocked'] as const)(
    '보관함이 평소 상태가 아니면(%s) 멈춘다',
    (skipped) => {
      expect(pushBlockedReason({ ...IDLE_SYNC, skipped })).toContain('팀 변경을 받지 못해')
    }
  )
})

describe('createSyncStoreRegistry', () => {
  it('같은 보관함은 같은 스토어, 다른 보관함은 따로 논다 — test: sync-state vault scope', async () => {
    const registry = createSyncStoreRegistry(() =>
      createSyncStateStore({
        count: () =>
          Promise.resolve({ ahead: 0, aheadFiles: [], newDocs: [], behind: 0, shared: null }),
        send: () => {}
      })
    )
    expect(registry.store('/a')).toBe(registry.store('/a'))
    const a = registry.store('/a')
    const b = registry.store('/b')
    expect(a).not.toBe(b)
    await a.patch({ running: true })
    expect(a.current().running).toBe(true)
    expect(b.current().running).toBe(false)
  })
})
