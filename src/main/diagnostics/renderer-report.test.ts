import { describe, expect, it } from 'vitest'
import { createReportGate, MAX_REPORT, normalizeReport } from './renderer-report'

describe('normalizeReport', () => {
  it('level·message·stack 만 받는다', () => {
    expect(normalizeReport({ level: 'warn', message: 'x', stack: 'at y', extra: 1 })).toEqual({
      level: 'warn',
      message: 'x',
      stack: 'at y'
    })
  })

  it('모르는 level 은 error, 문자열이 아니면 버리거나 정해 둔 글로 바꾼다', () => {
    expect(normalizeReport({ level: 'debug', message: 42 })).toEqual({
      level: 'error',
      message: '(no message)'
    })
    expect(normalizeReport({ message: 'm', stack: 7 })).toEqual({ level: 'error', message: 'm' })
  })

  it('줄바꿈으로 다른 기록 줄을 꾸미지 못한다', () => {
    const forged = 'a\n2026-01-01T00:00:00.000Z [fatal] [main] x'
    const out = normalizeReport({ message: forged, stack: 'Error: e\n    at f' })
    expect(out?.message).toBe('a\\n2026-01-01T00:00:00.000Z [fatal] [main] x')
    expect(out?.stack).toBe('Error: e\n  |     at f')
  })

  it('U+2028·U+2029 로도 다른 기록 줄을 꾸미지 못한다', () => {
    const out = normalizeReport({ message: 'a\u2028b\u2029c', stack: 'Error: e\u2028    at f' })
    expect(out?.message).toBe('a\\nb\\nc')
    expect(out?.stack).toBe('Error: e\n  |     at f')
  })

  it('객체가 아니면 받지 않는다', () => {
    expect(normalizeReport('boom')).toBeNull()
    expect(normalizeReport(null)).toBeNull()
  })

  it('긴 글은 상한에서 자른다', () => {
    const out = normalizeReport({
      message: 'm'.repeat(MAX_REPORT * 3),
      stack: 's'.repeat(MAX_REPORT * 3)
    })
    expect(out?.message.length).toBe(MAX_REPORT)
    expect(out?.stack?.length).toBe(MAX_REPORT)
  })
})

describe('createReportGate', () => {
  it('창 안에서 상한까지만 통과시키고, 창이 끝날 때 버린 수를 한 번 알린다', () => {
    let clock = 0
    const timers: { run: () => void; ms: number }[] = []
    const seen: number[] = []
    const gate = createReportGate({
      max: 3,
      windowMs: 1000,
      now: () => clock,
      setTimer: (run, ms) => timers.push({ run, ms }),
      onSuppressed: (n) => seen.push(n)
    })
    clock = 200
    expect([1, 2, 3, 4, 5].map(() => gate.take())).toEqual([true, true, true, false, false])
    expect(timers).toHaveLength(1)
    expect(timers[0].ms).toBe(800)
    timers[0].run()
    expect(seen).toEqual([2])
    clock = 1500
    expect(gate.take()).toBe(true)
  })
})
