// @vitest-environment jsdom
// 폴링 생명주기 — inactive 무시·간격 tick·limit 1회·마운트 해제 정리를 핀한다(회귀).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { usePoll } from './use-poll'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const probe = (
  active: boolean,
  tick: () => void,
  options: { intervalMs: number; limitMs: number },
  onLimit?: () => void
): (() => void) => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  const Probe = (): null => {
    usePoll(active, tick, options, onLimit)
    return null
  }
  act(() => {
    root.render(<Probe />)
  })
  return () => {
    act(() => {
      root.unmount()
    })
    el.remove()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('usePoll', () => {
  it('inactive면 타이머를 잡지 않는다', () => {
    const tick = vi.fn()
    const stop = probe(false, tick, { intervalMs: 100, limitMs: 1000 })
    try {
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(tick).not.toHaveBeenCalled()
    } finally {
      stop()
    }
  })

  it('간격마다 tick을 부른다', () => {
    const tick = vi.fn()
    const stop = probe(true, tick, { intervalMs: 100, limitMs: 1000 })
    try {
      act(() => {
        vi.advanceTimersByTime(350)
      })
      expect(tick.mock.calls.length).toBeGreaterThanOrEqual(3)
    } finally {
      stop()
    }
  })

  it('limit을 넘기면 멈추고 onLimit을 한 번 부른다', () => {
    const tick = vi.fn()
    const onLimit = vi.fn()
    const stop = probe(true, tick, { intervalMs: 100, limitMs: 250 }, onLimit)
    try {
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(onLimit).toHaveBeenCalledTimes(1)
      const afterLimit = tick.mock.calls.length
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(tick.mock.calls.length).toBe(afterLimit)
    } finally {
      stop()
    }
  })

  it('마운트를 풀면 tick이 멈춘다', () => {
    const tick = vi.fn()
    const stop = probe(true, tick, { intervalMs: 100, limitMs: 10000 })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    stop()
    const count = tick.mock.calls.length
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(tick.mock.calls.length).toBe(count)
  })
})
