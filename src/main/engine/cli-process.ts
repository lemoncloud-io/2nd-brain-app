// CLI 엔진 공용 실행부 — 볼트 lock, 프로세스 그룹 spawn·취소, stdin 프롬프트, JSONL 줄 파싱, 실패 판정.
// 엔진마다 다른 것(인자·줄 해석)만 주입받는다. Claude·Codex 엔진이 같은 수명 규칙을 쓴다.
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { EngineEvent } from '../../shared/ipc-contract'
import { killGroup } from '../cli/kill-group'
import { spawnCli } from '../cli/resolve-cli'
import { DETAIL_MARK, layeredFailure } from '../../shared/engine-failure'
import type { Engine, IngestJob } from './engine'
import { mainT } from '../i18n'

// job spec 의 lock 경로와 같다 (vault-ingest-agent.md § 절차 2)
export const INGEST_LOCK = join('.locks', 'vault-ingest.lock')

/** 실행 결과 줄 — Claude `result`, Codex `turn.completed`·`turn.failed` */
export type ResultLine = { ok: boolean; message: string }

export type ParsedLine = {
  events: EngineEvent[]
  result?: ResultLine
}

/** JSONL 한 줄을 객체로 — JSON 이 아니거나 객체가 아니면 null */
export const parseJsonObject = (line: string): object | null => {
  try {
    const parsed: unknown = JSON.parse(line)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

export interface CliEngineSpec {
  /** 오류 문구에 쓰는 CLI 이름 */
  name: string
  cliPath: string
  /** 볼트 쓰기 실행(위키화)만 lock 을 잡는다 */
  lock: boolean
  args: (job: IngestJob) => string[]
  parseLine: (line: string) => ParsedLine
  /** 결과 줄 없이 정상 종료했을 때 문구 */
  noResultMessage: string
  /** 전체 상한 — 네트워크가 끊기면 CLI 가 끝나지 않아 무한 대기에 빠진다. 기본 10분(git 과 같은 자) */
  timeoutMs?: number
}

const STDERR_TAIL = 2000

/** 끝나지 않는 실행을 자른 뒤의 말 — 켜 둔 채팅 세션의 턴 시간 초과도 같은 말을 쓴다 */
export const engineTimedOut = (): string => mainT().engineMain.timedOut

const failureOf = (
  spec: CliEngineSpec,
  exit: { code: number | null; error?: Error },
  stderr: string,
  result?: ResultLine
): string | null => {
  // 실패 문구는 "사용자 문장 + 칸막이 + 원문" 두 층이다 — 화면은 앞을 쓰고 원문은 접어 둔다(lib/user-error.ts)
  if (exit.error) return layeredFailure(exit.error.message)
  // CLI 가 실패 사유를 보고했으면 exit code 보다 그 문구가 낫다
  if (result && !result.ok) return layeredFailure(result.message)
  if (exit.code !== 0) {
    return layeredFailure(`${spec.name} exit ${exit.code}${stderr ? ` — ${stderr}` : ''}`)
  }
  if (!result) return `${mainT().engineMain.notFinished}${DETAIL_MARK}${spec.noResultMessage}`
  return null
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM = 다른 사용자의 살아 있는 프로세스
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const lockOwner = (lock: string): number | null => {
  try {
    const pid = Number.parseInt(readFileSync(lock, 'utf8'), 10)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

// lock 에 앱 pid 를 적는다. 주인이 죽은 lock(앱 비정상 종료)은 회수하고, 살아 있으면 거절한다.
const acquireLock = (lock: string): boolean => {
  mkdirSync(dirname(lock), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' })
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const owner = lockOwner(lock)
    if (owner !== null && isAlive(owner)) return false
    rmSync(lock, { force: true })
  }
  return false
}

// 엔진 하나 = 실행 하나. 시작 전에 온 취소도 기억해 CLI 를 띄우지 않는다.
export const createCliEngine = (spec: CliEngineSpec): Engine => {
  let child: ChildProcess | null = null
  let canceled = false

  async function* run(job: IngestJob): AsyncGenerator<EngineEvent> {
    const lock = spec.lock ? join(job.vaultDir, INGEST_LOCK) : null
    if (lock && !acquireLock(lock)) {
      yield { type: 'error', message: mainT().engineMain.ingestRunning }
      yield { type: 'done', ok: false, canceled: false }
      return
    }

    let proc: ChildProcess | null = null
    try {
      if (canceled) {
        yield { type: 'done', ok: false, canceled: true }
        return
      }
      // 프롬프트는 argv 대신 stdin 으로 — Windows CreateProcess 명령줄 상한(32,767자) 회피
      // detached = 그룹 리더(취소 시 그룹 kill). Windows 의 detached 는 새 콘솔 창을 띄우므로 끄고 taskkill 로 끝낸다
      proc = spawnCli(spec.cliPath, spec.args(job), {
        cwd: job.vaultDir,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe']
      })
      child = proc
      const started = proc
      started.stdin?.on('error', () => {
        // fake 처럼 stdin 을 안 읽는 자식의 EPIPE 는 무시한다
      })
      started.stdin?.end(job.prompt)
      let stderr = ''
      started.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL)
      })
      const exited = new Promise<{ code: number | null; error?: Error }>((resolve) => {
        started.once('error', (error) => resolve({ code: null, error }))
        started.once('close', (code) => resolve({ code }))
      })

      let result: ResultLine | undefined
      // 끝나지 않는 실행(끊긴 인터넷에 매달린 CLI)을 자른다 — 줄 고리는 종료가 없어 멈추지 않는다.
      // 시간 초과는 kill 로 끝내고(아래 finally 가 뒷정리), done 앞에 사유를 낸다.
      // 앱 종료를 붙잡지 않게 unref — 작업이 끝나면 clearTimeout 으로 걷는다
      let timedOut = false
      const timer = setTimeout(
        () => {
          timedOut = true
          if (proc) killGroup(proc)
        },
        spec.timeoutMs ?? 10 * 60_000
      )
      timer.unref?.()
      try {
        // readline 이 청크 경계에서 잘린 줄을 이어 붙인다
        for await (const line of createInterface({ input: started.stdout!, crlfDelay: Infinity })) {
          if (timedOut) break
          if (line.trim() === '') continue
          const parsed = spec.parseLine(line)
          result = parsed.result ?? result
          yield* parsed.events
        }
      } finally {
        clearTimeout(timer)
      }
      if (timedOut) {
        yield {
          type: 'error',
          message: mainT().engineMain.timedOut
        }
        yield { type: 'done', ok: false, canceled: false }
        return
      }

      const exit = await exited
      if (canceled) {
        yield { type: 'done', ok: false, canceled: true }
        return
      }
      const failure = failureOf(spec, exit, stderr.trim(), result)
      if (failure) yield { type: 'error', message: failure }
      yield { type: 'done', ok: failure === null, canceled: false }
    } finally {
      // 소비자가 중간에 멈춰도 프로세스와 lock 을 남기지 않는다. 이미 낸 done 을 정리 실패가 뒤집지 않게 삼킨다
      if (proc) killGroup(proc)
      child = null
      if (lock) {
        try {
          rmSync(lock, { force: true })
        } catch (error) {
          console.error('vault-ingest lock release failed', lock, error)
        }
      }
    }
  }

  const cancel = (): void => {
    canceled = true
    if (child) killGroup(child)
  }

  return { run, cancel }
}
