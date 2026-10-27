// 앱 로그 — 줄 형식·레벨·console 감싸기. 파일·Electron 은 모른다(sink 로 받는다).
// 줄 형식: `<ISO 시각> [level] [scope] message` — 사람이 읽고 grep 하기 쉬운 한 줄.
import { inspect } from 'node:util'
import { redact, redactWindow } from './redact'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogSink {
  write(line: string): void
  writeSync(line: string): void
}

export interface Logger {
  debug(scope: string, ...args: unknown[]): void
  info(scope: string, ...args: unknown[]): void
  warn(scope: string, ...args: unknown[]): void
  error(scope: string, ...args: unknown[]): void
  /** 프로세스가 곧 죽을 수 있다 — 동기로 쓴다 */
  fatal(scope: string, ...args: unknown[]): void
  setLevel(level: LogLevel): void
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 }

const toText = (arg: unknown): string => {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`
  return inspect(arg, { depth: 3, breakLength: Infinity })
}

/** 한 줄 상한 뒤는 redact 가 버린다 — MB 급 인자(채팅 본문·CLI stderr)를 통째로 이어 붙이지 않는다 */
const format = (arg: unknown): string => {
  const text = toText(arg)
  const window = redactWindow()
  return text.length > window ? text.slice(0, window) : text
}

export const createLogger = (
  sink: LogSink,
  opts: { now?: () => Date; home?: string } = {}
): Logger => {
  const now = opts.now ?? ((): Date => new Date())
  let min: LogLevel = 'info'
  const line = (level: LogLevel, scope: string, args: unknown[]): string =>
    redact(`${now().toISOString()} [${level}] [${scope}] ${args.map(format).join(' ')}`, opts.home)
  const at =
    (level: Exclude<LogLevel, 'fatal'>) =>
    (scope: string, ...args: unknown[]): void => {
      if (RANK[level] >= RANK[min]) sink.write(line(level, scope, args))
    }
  return {
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    fatal: (scope, ...args) => sink.writeSync(line('fatal', scope, args)),
    setLevel: (level) => {
      min = level
    }
  }
}

const CAPTURED = Symbol.for('2nd-brain.console-captured')
const METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const
const LEVEL_OF: Record<(typeof METHODS)[number], Exclude<LogLevel, 'fatal'>> = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug'
}

/**
 * console 을 감싸 원래 출력(개발 터미널)은 그대로 내고 로그에도 남긴다 — 기존 호출처를 고치지 않고 모은다.
 * 두 번 불러도 한 겹이다. 로그 쓰기 중에 다시 console 이 불리면 그 줄은 로그로 보내지 않는다(무한 재진입 방지)
 */
export const captureConsole = (logger: Logger, target: Console = console): void => {
  const marked = target as Console & { [CAPTURED]?: boolean }
  if (marked[CAPTURED]) return
  marked[CAPTURED] = true
  let inside = false
  for (const method of METHODS) {
    const original = target[method].bind(target)
    target[method] = (...args: unknown[]): void => {
      original(...args)
      if (inside) return
      inside = true
      try {
        logger[LEVEL_OF[method]]('console', ...args)
      } catch {
        // 일부러 버린다 — 기록이 실패해도 console 을 부른 코드는 그대로 돌아야 한다
      } finally {
        inside = false
      }
    }
  }
}
