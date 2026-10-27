import { describe, expect, it } from 'vitest'
import { createInFlight } from './in-flight'

describe('createInFlight — 같은 키는 겹쳐 돌지 않는다', () => {
  it('진행 중에 같은 키로 부르면 일을 돌리지 않고 busy 를 준다. 다른 키는 따로 돈다', async () => {
    const once = createInFlight()
    let finish = (): void => {}
    let runs = 0
    const slow = (): Promise<string> =>
      new Promise((done) => {
        runs += 1
        finish = () => done('written')
      })
    const first = once('w1\0tab-1', slow, 'busy')
    expect(await once('w1\0tab-1', slow, 'busy')).toBe('busy')
    const other = once('w1\0tab-2', () => Promise.resolve('other'), 'busy')
    expect(await other).toBe('other')
    finish()
    expect(await first).toBe('written')
    expect(runs).toBe(1)
  })

  it('실패해도 키를 풀어 다시 누를 수 있다', async () => {
    const once = createInFlight()
    await expect(once('k', () => Promise.reject(new Error('x')), 'busy')).rejects.toThrow('x')
    expect(await once('k', () => Promise.resolve('again'), 'busy')).toBe('again')
  })
})
