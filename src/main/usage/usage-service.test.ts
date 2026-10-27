import { describe, expect, it, vi } from 'vitest'
import { EMPTY_ACCOUNT_USAGE } from '../../shared/account-usage'
import { createUsageReader, parseUsage, type UsageDeps } from './usage-service'

// 참조 구현(tak-cc-statusline/scripts/fetch-usage.sh)이 읽는 필드 그대로다
const body = {
  five_hour: { utilization: 42.4, resets_at: '2026-09-21T15:00:00Z' },
  seven_day: { utilization: 69, resets_at: '2026-09-24T00:00:00Z' },
  limits: [
    {
      kind: 'weekly_scoped',
      percent: 31.7,
      scope: { model: { display_name: 'Opus' } }
    },
    { kind: 'weekly', percent: 12 },
    { kind: 'weekly_scoped', percent: 'many', scope: { model: { display_name: 'Sonnet' } } }
  ]
}

const deps = (over: Partial<UsageDeps> = {}): UsageDeps => ({
  readToken: () => Promise.resolve('tok'),
  ask: () => Promise.resolve({ status: 200, body }),
  now: () => 0,
  ...over
})

describe('parseUsage', () => {
  it('두 창의 비율·리셋 시각과 모델별 주간 한도를 읽는다', () => {
    expect(parseUsage(body)).toEqual({
      fiveHour: 42,
      sevenDay: 69,
      fiveHourResetsAt: '2026-09-21T15:00:00Z',
      sevenDayResetsAt: '2026-09-24T00:00:00Z',
      scoped: [{ name: 'Opus', percent: 32 }]
    })
  })

  // 응답 모양이 바뀌어도 읽을 수 있는 만큼만 읽는다 — 던지면 지표 줄 전체가 사라진다
  it('모양이 달라도 던지지 않는다', () => {
    expect(parseUsage(null)).toEqual(EMPTY_ACCOUNT_USAGE)
    expect(parseUsage('없음')).toEqual(EMPTY_ACCOUNT_USAGE)
    expect(parseUsage({ five_hour: { utilization: '많음' }, limits: '없음' })).toEqual(
      EMPTY_ACCOUNT_USAGE
    )
  })
})

describe('createUsageReader', () => {
  it('60초 안에는 다시 묻지 않는다', async () => {
    const ask = vi.fn(() => Promise.resolve({ status: 200, body }))
    let clock = 0
    const read = createUsageReader(deps({ ask, now: () => clock }))

    await read()
    clock = 59_000
    await read()
    expect(ask).toHaveBeenCalledTimes(1)

    clock = 61_000
    await read()
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('겹친 요청은 하나로 합친다 — 대화 여럿이 같이 묻는다', async () => {
    const ask = vi.fn(() => Promise.resolve({ status: 200, body }))
    const read = createUsageReader(deps({ ask }))

    const [a, b] = await Promise.all([read(), read()])

    expect(ask).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('토큰이 갈렸으면 한 번만 다시 읽는다 — 무한 재조회를 만들지 않는다', async () => {
    const readToken = vi.fn(() => Promise.resolve('tok'))
    const ask = vi.fn(() => Promise.resolve({ status: 401, body: null }))
    const read = createUsageReader(deps({ readToken, ask }))

    expect(await read()).toEqual(EMPTY_ACCOUNT_USAGE)
    expect(readToken).toHaveBeenCalledTimes(2)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('두 번째에 통하면 그 결과를 쓴다', async () => {
    const ask = vi
      .fn()
      .mockResolvedValueOnce({ status: 403, body: null })
      .mockResolvedValueOnce({ status: 200, body })
    const read = createUsageReader(deps({ ask }))

    expect((await read()).sevenDay).toBe(69)
  })

  it('토큰이 없으면 조용히 사용량 없음 — 로그인을 권하지 않는다', async () => {
    const ask = vi.fn()
    const read = createUsageReader(deps({ readToken: () => Promise.resolve(null), ask }))

    expect(await read()).toEqual(EMPTY_ACCOUNT_USAGE)
    expect(ask).not.toHaveBeenCalled()
  })

  // 토큰이 만료돼 있으면 성공이 영영 안 온다 — 기억하지 않으면 물을 때마다 두 번씩 두드린다
  it('실패도 60초 기억한다 — 만료 토큰이 무한 재조회가 되지 않게', async () => {
    const ask = vi.fn(() => Promise.resolve({ status: 401, body: null }))
    let clock = 0
    const read = createUsageReader(deps({ ask, now: () => clock }))

    await read()
    expect(ask).toHaveBeenCalledTimes(2)
    clock = 30_000
    await read()
    expect(ask).toHaveBeenCalledTimes(2)

    clock = 61_000
    await read()
    expect(ask).toHaveBeenCalledTimes(4)
  })

  // 사람이 다시 보기를 누른 것은 "지금 값을 달라" 다 — 기억해 둔 60초를 기다리게 두지 않는다
  it('fresh 면 기억을 건너뛰고 다시 묻는다', async () => {
    let clock = 0
    const ask = vi.fn(() => Promise.resolve({ status: 200, body: {} }))
    const read = createUsageReader(deps({ ask, now: () => clock }))

    await read()
    clock = 30_000
    await read()
    expect(ask).toHaveBeenCalledTimes(1)

    await read(true)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('망이 죽어도 던지지 않고 빈 사용량이다', async () => {
    const ask = vi.fn().mockRejectedValueOnce(new Error('timeout'))
    const read = createUsageReader(deps({ ask }))

    expect(await read()).toEqual(EMPTY_ACCOUNT_USAGE)
  })

  // 자격증명 읽기가 오래 끌면 다시 시도하지 않는다 — 한 번 묻는 데 몇 초씩 걸리면 안 된다
  it('시간 예산을 넘기면 다시 시도하지 않는다', async () => {
    let clock = 0
    const readToken = vi.fn(() => {
      clock += 4000
      return Promise.resolve('tok')
    })
    const ask = vi.fn(() => Promise.resolve({ status: 401, body: null }))
    const read = createUsageReader(deps({ readToken, ask, now: () => clock }))

    expect(await read()).toEqual(EMPTY_ACCOUNT_USAGE)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  // 토큰이 밖으로 새면 화면·로그·저장소 어디서든 읽힌다
  it('돌려주는 값 어디에도 토큰이 없다', async () => {
    const read = createUsageReader(deps({ readToken: () => Promise.resolve('sk-secret-42') }))

    expect(JSON.stringify(await read())).not.toContain('sk-secret-42')
  })
})
