// 크기로 회전하는 로그 파일 — `<name>.log` 가 상한을 넘으면 `<name>.1.log` … `<name>.<keep>.log` 로 밀린다.
// 일반 줄은 대기열에 쌓았다가 다음 틱에 묶어 쓰고(부른 쪽을 막지 않게), 죽기 직전 줄은 대기열째 바로 쓴다.
// 쓰기가 실패하면 잠시 쉬었다 다시 시도한다 — 디스크 가득·파일 잠김은 대개 지나간다. 쉬는 동안 버린 줄 수는 다시 쓸 때 남긴다.
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface LogFileOptions {
  dir: string
  name: string
  maxBytes: number
  /** 남길 옛 파일 수 — 넘는 것은 지운다 */
  keep: number
  /** 쓰기가 처음 실패했을 때 한 번 — 다시 살아났다 또 실패해도 다시 부르지 않는다 */
  onError?: (error: unknown) => void
  /** 실패 뒤 다시 시도할 때까지(ms) */
  retryMs?: number
  now?: () => number
}

export interface LogFile {
  write(line: string): void
  /** 대기열을 먼저 비우고 이 줄까지 돌아오기 전에 쓴다 */
  writeSync(line: string): void
  /** 대기열을 동기로 비운다 — 종료 직전 */
  drainSync(): void
  /** 대기열이 빌 때까지 */
  flush(): Promise<void>
  /** 지금 쓰는 파일과 옛 파일 — 새것부터. 돌리는 중이거나 돌리다 멈춘 `.rotating` 파일이 맨 뒤 */
  files(): string[]
  /** 지금 쓰기를 쉬고 있으면 그 사이 버린 줄 수 */
  dropped(): number
}

export const isMissing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException)?.code === 'ENOENT'

export const createLogFile = (opts: LogFileOptions): LogFile => {
  const now = opts.now ?? Date.now
  const retryMs = opts.retryMs ?? 30_000
  const path = (n: number): string =>
    join(opts.dir, n === 0 ? `${opts.name}.log` : `${opts.name}.${n}.log`)
  let size: number | null = null
  let pending: string[] = []
  let scheduled: Promise<void> | null = null
  let reported = false
  let pausedUntil = 0
  let dropped = 0

  const paused = (): boolean => pausedUntil > now()

  const fail = (error: unknown): void => {
    pausedUntil = now() + retryMs
    size = null
    if (reported) return
    reported = true
    opts.onError?.(error)
  }

  // 처음 쓸 때(그리고 실패 뒤 다시 쓸 때) 폴더를 만들고 이미 있는 파일 크기부터 센다 — 재시작해도 상한이 이어진다
  const ensure = (): void => {
    if (size !== null) return
    mkdirSync(opts.dir, { recursive: true, mode: 0o700 })
    try {
      size = statSync(path(0)).size
    } catch (error) {
      if (!isMissing(error)) throw error
      size = 0
    }
  }

  // 지금 파일부터 옆 이름으로 옮겨 본다 — 잠겨서(Windows 백신·다른 앱) 못 옮기면 옛 칸은 건드리지 않고 크기를 그대로 둔다.
  // 다음 덩어리에서 다시 민다. 옛 칸이 비어 있는 것은 정상이다
  const rotate = (): void => {
    const moving = join(opts.dir, `${opts.name}.rotating.log`)
    try {
      renameSync(path(0), moving)
    } catch (error) {
      if (isMissing(error)) size = 0
      return
    }
    try {
      rmSync(path(opts.keep), { force: true })
    } catch {
      // 맨 끝 칸을 못 지우면 아래 rename 이 그 칸을 덮어쓴다
    }
    for (let n = opts.keep - 1; n >= 1; n -= 1) {
      try {
        renameSync(path(n), path(n + 1))
      } catch {
        // 빈 칸이거나 잠긴 칸 — 그 칸은 건너뛴다
      }
    }
    try {
      renameSync(moving, path(1))
    } catch {
      // 옮겨 둔 파일은 .rotating 이름으로 남는다 — 지금 파일은 새로 시작한다
    }
    size = 0
  }

  // 대기열을 파일 하나씩의 덩어리로 나눈다 — 상한을 넘는 줄 앞에서 끊고 회전한다. 한 줄이 상한보다 커도 빈 파일에는 쓴다
  const takeChunk = (): string => {
    ensure()
    let chunk = ''
    while (pending.length > 0) {
      const bytes = Buffer.byteLength(pending[0])
      if ((size ?? 0) > 0 && (size ?? 0) + bytes > opts.maxBytes) {
        if (chunk) break
        // 회전하지 못하면 이 줄은 지금 파일에 그대로 붙인다
        rotate()
      }
      chunk += pending.shift()
      size = (size ?? 0) + bytes
    }
    return chunk
  }

  const resume = (): void => {
    if (dropped === 0) return
    pending.unshift(
      `${new Date(now()).toISOString()} [warn] [log] ${dropped} lines dropped while the log file was unavailable\n`
    )
    dropped = 0
  }

  const accept = (line: string): boolean => {
    if (paused()) {
      dropped += 1
      return false
    }
    resume()
    pending.push(`${line}\n`)
    return true
  }

  const drainSync = (): void => {
    while (pending.length > 0 && !paused()) {
      let chunk = ''
      try {
        chunk = takeChunk()
        if (chunk) appendFileSync(path(0), chunk, { mode: 0o600 })
      } catch (error) {
        // 대기열에 남은 줄과 쓰다 만 덩어리의 줄(한 줄 = 줄바꿈 하나)
        dropped += pending.length + (chunk.match(/\n/g)?.length ?? 0)
        pending = []
        fail(error)
      }
    }
  }

  // 한 틱에 쌓인 줄을 다음 틱에 한 번에 쓴다 — 부른 쪽은 기다리지 않고, 순서는 대기열 그대로다
  const schedule = (): void => {
    if (scheduled) return
    scheduled = new Promise((done) =>
      setImmediate(() => {
        scheduled = null
        // 쓰기가 던져도 flush 를 기다리는 쪽(진단 정보 내보내기)이 멈추지 않게
        try {
          drainSync()
        } finally {
          done()
        }
      })
    )
  }

  return {
    write(line) {
      if (accept(line)) schedule()
    },
    writeSync(line) {
      if (accept(line)) drainSync()
    },
    drainSync,
    async flush() {
      while (scheduled) await scheduled
    },
    files: () => [
      ...Array.from({ length: opts.keep + 1 }, (_, n) => path(n)),
      join(opts.dir, `${opts.name}.rotating.log`)
    ],
    dropped: () => dropped
  }
}
