import { describe, expect, it } from 'vitest'
import { withVaultGit } from './vault-queue'

const tick = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

describe('withVaultGit', () => {
  it('받기가 기다리는 동안 들어온 저장은 받기가 끝난 뒤에 돈다', async () => {
    const order: string[] = []
    const sync = withVaultGit('/v', async () => {
      order.push('sync:start')
      await tick(20) // fetch 대기
      order.push('sync:end')
    })
    const save = withVaultGit('/v', () => {
      order.push('save')
    })
    await Promise.all([sync, save])
    expect(order).toEqual(['sync:start', 'sync:end', 'save'])
  })

  it('앞선 일이 실패해도 뒤의 일은 돈다 — 실패는 그 호출자에게만 간다', async () => {
    const failed = withVaultGit('/v', () => {
      throw new Error('boom')
    })
    const next = withVaultGit('/v', () => 'ok')
    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })

  it('다른 보관함끼리는 서로 기다리지 않는다', async () => {
    const order: string[] = []
    const slow = withVaultGit('/a', async () => {
      await tick(20)
      order.push('a')
    })
    const fast = withVaultGit('/b', () => {
      order.push('b')
    })
    await Promise.all([slow, fast])
    expect(order).toEqual(['b', 'a'])
  })
})
