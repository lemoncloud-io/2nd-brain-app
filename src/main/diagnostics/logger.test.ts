import { describe, expect, it } from 'vitest'
import { captureConsole, createLogger, type LogSink } from './logger'

const memorySink = (): LogSink & { lines: string[]; fatal: string[] } => {
  const lines: string[] = []
  const fatal: string[] = []
  return {
    lines,
    fatal,
    write: (line) => lines.push(line),
    writeSync: (line) => fatal.push(line)
  }
}

const fixedNow = (): Date => new Date('2026-10-24T03:00:00.000Z')

describe('createLogger', () => {
  it('시각·레벨·영역을 붙이고 비밀을 가린다', () => {
    const sink = memorySink()
    const log = createLogger(sink, { now: fixedNow, home: '/Users/kim' })
    log.error('sync', 'pull failed', 'Bearer abcdefghijklmnop', '/Users/kim/vault')
    expect(sink.lines).toEqual([
      '2026-10-24T03:00:00.000Z [error] [sync] pull failed Bearer [REDACTED] ~/vault'
    ])
  })

  it('Error 는 stack 까지 남긴다', () => {
    const sink = memorySink()
    const log = createLogger(sink, { now: fixedNow })
    const error = new Error('boom')
    log.warn('main', error)
    expect(sink.lines[0]).toContain('[warn] [main] Error: boom')
    expect(sink.lines[0]).toContain('logger.test.ts')
  })

  it('기본 레벨 info 는 debug 를 버리고, debug 로 바꾸면 남긴다', () => {
    const sink = memorySink()
    const log = createLogger(sink, { now: fixedNow })
    log.debug('ipc', 'hidden')
    log.setLevel('debug')
    log.debug('ipc', 'shown')
    expect(sink.lines).toHaveLength(1)
    expect(sink.lines[0]).toContain('shown')
  })

  it('fatal 은 동기 쓰기로 간다', () => {
    const sink = memorySink()
    const log = createLogger(sink, { now: fixedNow })
    log.fatal('main', new Error('dead'))
    expect(sink.fatal[0]).toContain('[fatal] [main] Error: dead')
  })
})

describe('captureConsole', () => {
  const fakeConsole = (): Console & { seen: unknown[][] } => {
    const seen: unknown[][] = []
    const record = (...args: unknown[]): void => {
      seen.push(args)
    }
    return {
      seen,
      log: record,
      info: record,
      warn: record,
      error: record,
      debug: record
    } as unknown as Console & { seen: unknown[][] }
  }

  it('원래 출력은 그대로 내고 로그에도 남긴다', () => {
    const sink = memorySink()
    const target = fakeConsole()
    captureConsole(createLogger(sink, { now: fixedNow }), target)
    target.error('could not read', 'x')
    expect(target.seen).toEqual([['could not read', 'x']])
    expect(sink.lines[0]).toContain('[error] [console] could not read x')
  })

  it('두 번 감싸도 한 줄은 한 번만 남는다', () => {
    const sink = memorySink()
    const target = fakeConsole()
    const log = createLogger(sink, { now: fixedNow })
    captureConsole(log, target)
    captureConsole(log, target)
    target.warn('once')
    expect(sink.lines).toHaveLength(1)
    expect(target.seen).toHaveLength(1)
  })

  it('기록이 던져도 console 을 부른 코드로 새지 않는다', () => {
    const target = fakeConsole()
    const sink: LogSink = {
      write: () => {
        throw new Error('disk gone')
      },
      writeSync: () => {}
    }
    captureConsole(createLogger(sink, { now: fixedNow }), target)
    expect(() => target.error('still fine')).not.toThrow()
    expect(target.seen).toEqual([['still fine']])
  })

  it('로그 쓰기가 console 을 다시 불러도 무한히 돌지 않는다', () => {
    const target = fakeConsole()
    let calls = 0
    const sink: LogSink = {
      write: () => {
        calls += 1
        target.error('sink failed')
      },
      writeSync: () => {}
    }
    captureConsole(createLogger(sink, { now: fixedNow }), target)
    target.error('first')
    expect(calls).toBe(1)
    expect(target.seen).toEqual([['first'], ['sink failed']])
  })
})
