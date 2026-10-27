import { describe, expect, it } from 'vitest'
import type { UpdateState } from '../../shared/ipc-contract'
import { updateReducer, type UpdateEvent } from './update-state'

const run = (start: UpdateState, ...events: UpdateEvent[]): UpdateState =>
  events.reduce(updateReducer, start)

describe('updateReducer', () => {
  it('꺼진 상태는 어떤 이벤트에도 그대로다', () => {
    expect(
      run({ kind: 'off' }, { type: 'check' }, { type: 'downloaded', version: '1.0.0' })
    ).toEqual({ kind: 'off' })
  })

  it('확인 → 새 버전 → 진행률 → 받음', () => {
    expect(
      run(
        { kind: 'idle' },
        { type: 'check' },
        { type: 'available', version: '0.2.0' },
        { type: 'progress', percent: 41.6 }
      )
    ).toEqual({ kind: 'downloading', version: '0.2.0', percent: 42 })
    expect(
      run(
        { kind: 'idle' },
        { type: 'available', version: '0.2.0' },
        { type: 'downloaded', version: '0.2.0' }
      )
    ).toEqual({ kind: 'ready', version: '0.2.0' })
  })

  it('새 버전이 없으면 최신', () => {
    expect(run({ kind: 'idle' }, { type: 'check' }, { type: 'none' })).toEqual({ kind: 'latest' })
  })

  it('받는 중에 주기 확인이 끼어도 진행률을 잃지 않는다', () => {
    const downloading: UpdateState = { kind: 'downloading', version: '0.2.0', percent: 30 }
    expect(updateReducer(downloading, { type: 'check' })).toEqual(downloading)
  })

  it('받아 둔 새 버전은 이후 확인·실패로 사라지지 않는다', () => {
    const ready: UpdateState = { kind: 'ready', version: '0.2.0' }
    expect(
      run(ready, { type: 'check' }, { type: 'error', detail: 'offline' }, { type: 'none' })
    ).toEqual(ready)
  })

  it('설치 실패만 받아 둔 상태를 푼다', () => {
    const ready: UpdateState = { kind: 'ready', version: '0.2.0' }
    expect(updateReducer(ready, { type: 'install-failed', detail: 'EACCES' })).toEqual({
      kind: 'failed',
      during: 'install',
      detail: 'EACCES'
    })
  })

  it('실패는 원문을 들고 있고, 다음 확인에서 다시 시작한다', () => {
    const failed = run(
      { kind: 'idle' },
      { type: 'error', detail: 'net::ERR_INTERNET_DISCONNECTED' }
    )
    expect(failed).toEqual({
      kind: 'failed',
      during: 'check',
      detail: 'net::ERR_INTERNET_DISCONNECTED'
    })
    expect(updateReducer(failed, { type: 'check' })).toEqual({ kind: 'checking' })
  })

  it('같은 확인·같은 실패는 같은 상태를 돌려준다 — 두 번 알리지 않는다', () => {
    const checking: UpdateState = { kind: 'checking' }
    expect(updateReducer(checking, { type: 'check' })).toBe(checking)
    const failed: UpdateState = { kind: 'failed', during: 'check', detail: 'offline' }
    expect(updateReducer(failed, { type: 'error', detail: 'offline' })).toBe(failed)
    expect(updateReducer(failed, { type: 'error', detail: 'timeout' })).toEqual({
      kind: 'failed',
      during: 'check',
      detail: 'timeout'
    })
  })

  it('받는 중에 같은 버전이 다시 알려져도 진행률을 되돌리지 않는다', () => {
    const downloading: UpdateState = { kind: 'downloading', version: '0.2.0', percent: 70 }
    expect(updateReducer(downloading, { type: 'available', version: '0.2.0' })).toBe(downloading)
    expect(updateReducer(downloading, { type: 'available', version: '0.3.0' })).toEqual({
      kind: 'downloading',
      version: '0.3.0',
      percent: 0
    })
  })

  it('진행률은 0~100 정수로 자른다', () => {
    const start: UpdateState = { kind: 'downloading', version: '0.2.0', percent: 0 }
    expect(updateReducer(start, { type: 'progress', percent: 140 })).toMatchObject({ percent: 100 })
    expect(updateReducer(start, { type: 'progress', percent: -3 })).toMatchObject({ percent: 0 })
  })

  it('받는 중이 아닐 때 진행률 이벤트는 무시한다', () => {
    expect(updateReducer({ kind: 'checking' }, { type: 'progress', percent: 50 })).toEqual({
      kind: 'checking'
    })
  })
})
