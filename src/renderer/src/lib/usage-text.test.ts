import { describe, expect, it } from 'vitest'
import { EMPTY_ACCOUNT_USAGE } from '../../../shared/account-usage'
import { resetsIn, usageParts } from './usage-text'

const now = Date.parse('2026-09-21T12:00:00Z')

describe('resetsIn', () => {
  it('남은 시간을 사람이 쓰는 단위로 줄인다', () => {
    expect(resetsIn('2026-09-21T12:20:00Z', now)).toBe('20m')
    expect(resetsIn('2026-09-21T17:00:00Z', now)).toBe('5h')
    expect(resetsIn('2026-09-24T12:00:00Z', now)).toBe('3d')
    expect(resetsIn('2026-09-21T13:32:00Z', now)).toBe('1h 32m')
    expect(resetsIn('2026-09-28T05:00:00Z', now)).toBe('6d 17h')
  })

  it('모르는 시각·이미 지난 시각은 말하지 않는다', () => {
    expect(resetsIn(null, now)).toBeNull()
    expect(resetsIn('곧', now)).toBeNull()
    expect(resetsIn('2026-09-21T11:00:00Z', now)).toBeNull()
  })
})

describe('usageParts', () => {
  it('쓴 비율로 말하고 괄호는 다시 채워지기까지 남은 시간이다', () => {
    expect(
      usageParts(
        {
          fiveHour: 42,
          sevenDay: 69,
          fiveHourResetsAt: '2026-09-21T17:00:00Z',
          sevenDayResetsAt: '2026-09-24T12:00:00Z',
          scoped: [{ name: 'Opus', percent: 32 }]
        },
        now
      )
    ).toEqual([
      { label: '5h', used: 42, when: '5h' },
      { label: '7d', used: 69, when: '3d' },
      { label: 'Opus', used: 32, when: null }
    ])
  })

  it('모르는 값은 칸을 만들지 않는다', () => {
    expect(usageParts(null, now)).toEqual([])
    expect(usageParts(EMPTY_ACCOUNT_USAGE, now)).toEqual([])
    expect(usageParts({ ...EMPTY_ACCOUNT_USAGE, sevenDay: 90 }, now)).toEqual([
      { label: '7d', used: 90, when: null }
    ])
  })
})
