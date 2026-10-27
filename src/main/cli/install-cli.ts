// 엔진 CLI 를 앱이 직접 설치한다 — 벤더 설치 스크립트를 돌리고, 끝나면 CLI 를 다시 찾아 확인한다.
// 돌리는 명령은 src/shared/cli-install.ts 의 표에서만 나온다(렌더러 입력을 실행하지 않는다).
// 설치한 것은 userData/installed-cli 에 마커로 남긴다 — 언인스톨러가 이 마커가 있는 것만 지운다
// (build/uninstall-targets.json). 원래 있던 CLI·설정은 마커가 없어 건드리지 않는다.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineKind } from '../../shared/engine-settings'
import type { InstallResult } from '../../shared/ipc-contract'
import { cliInstallEnv, cliInstallRun } from '../../shared/cli-install'
import { killGroup } from './kill-group'
import { resolveCli } from './resolve-cli'

export interface InstallOptions {
  env: NodeJS.ProcessEnv
  /** userData/installed-cli */
  markerDir: string
  platform?: NodeJS.Platform
  onLine?: (line: string) => void
  /** 테스트·e2e 주입구 — 없으면 정본 표의 명령 */
  command?: { file: string; args: string[] }
  timeoutMs?: number
  /** SIGTERM 뒤 강제 종료까지의 유예 */
  killGraceMs?: number
}

const TIMEOUT_MS = 10 * 60_000
const LINE_MAX = 200
const LINE_INTERVAL_MS = 100
// SIGTERM 을 무시하는 설치기는 close 가 오지 않는다 — 그러면 이 설치의 Promise 와 화면의 스피너가 영영 남는다
const KILL_GRACE_MS = 3000
// 실패 사유로 쓰는 것은 stderr 의 마지막 줄뿐이다
const STDERR_TAIL = 4096

const OVERRIDE_ENV: Record<EngineKind, string> = {
  claude: 'CLAUDE_CLI_PATH',
  codex: 'CODEX_CLI_PATH'
}
/** 엔진이 홈 아래에 두는 설정·기록 — 설치 전에 하나라도 있었으면 우리 것이 아니다 */
const CONFIG_PATHS: Record<EngineKind, string[]> = {
  claude: ['.claude', '.claude.json'],
  codex: ['.codex']
}

interface Slot {
  promise: Promise<InstallResult> | null
  cancelled: boolean
  /** 설치기가 떠 있는 동안만 있다 */
  kill: (() => void) | null
}
const running = new Map<EngineKind, Slot>()

/** 앱이 꺼질 때 — 설치기를 남겨 두면 주인 없는 curl·powershell 이 계속 돈다 */
export const cancelInstalls = (): void => {
  for (const slot of running.values()) {
    slot.cancelled = true
    slot.kill?.()
  }
}

const lastLine = (text: string): string =>
  text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? ''

const run = async (
  engine: EngineKind,
  options: InstallOptions,
  slot: Slot
): Promise<InstallResult> => {
  const { env, markerDir, onLine } = options
  const platform = options.platform ?? process.platform
  const find = (): ReturnType<typeof resolveCli> =>
    resolveCli(engine, env[OVERRIDE_ENV[engine]], env, platform)

  // 지난 설치가 도중에 끊겼으면(크래시·강제 종료) .pending 이 남아 있다. 그 뒤에 보이는 CLI 가 우리가 깐 것인지
  // 사용자가 직접 깐 것인지 가릴 수 없다 — 버린다. 마커가 없는 쪽(언인스톨러가 남긴다)이 되돌릴 수 있는 쪽이다.
  const names = [engine, `${engine}.config`]
  try {
    for (const name of names) rmSync(join(markerDir, `${name}.pending`), { force: true })
  } catch (error) {
    // 확정 마커만 읽히므로 남아도 해가 없다
    console.error('could not clear the interrupted install record', markerDir, error)
  }

  const before = await find()
  if (!('missing' in before)) return { ok: true, version: before.version }
  if (slot.cancelled) return { ok: false, reason: 'cancelled', detail: '' }

  const home = platform === 'win32' ? env.USERPROFILE : env.HOME
  const hadConfig = !home || CONFIG_PATHS[engine].some((name) => existsSync(join(home, name)))

  // 마커는 두 단계다: 설치 전에 .pending 으로 쓰고, 설치를 확인한 뒤 이름을 바꿔 확정한다. 언인스톨러는 확정된 것만 본다.
  // 설치 전에 쓰는 이유 — 기록할 수 없는 자리면 깔지 않는다(깔고 나서 못 쓰면 언인스톨러가 영영 못 지운다).
  // 바로 확정하지 않는 이유 — 설치 도중 앱이 죽으면 CLI 없이 마커만 남고, 나중에 사용자가 직접 깐 CLI 를 지우게 된다.
  // CLI 는 없는데 남아 있는 확정 마커도 같은 이유로 지우고 새로 판정한다.
  const markers = (hadConfig ? [engine] : names).map((name) => join(markerDir, name))
  try {
    for (const name of names) rmSync(join(markerDir, name), { force: true })
    mkdirSync(markerDir, { recursive: true })
    for (const marker of markers) writeFileSync(`${marker}.pending`, '')
  } catch (error) {
    console.error('could not write the install marker', markerDir, error)
    return {
      ok: false,
      reason: 'exit',
      detail: `could not write the install record — ${String(error)}`
    }
  }
  // 설치가 안 됐으면 기록도 없어야 한다
  const failed = (result: Extract<InstallResult, { ok: false }>): InstallResult => {
    for (const marker of markers) {
      try {
        rmSync(`${marker}.pending`, { force: true })
      } catch (error) {
        console.error('could not remove the install marker', marker, error)
      }
    }
    try {
      // 다른 엔진의 마커가 있으면 비어 있지 않아 실패한다 — 그대로 둔다
      rmdirSync(markerDir)
    } catch {
      // 비어 있지 않다
    }
    return result
  }

  const { file, args } = options.command ?? cliInstallRun(engine, platform, env)
  const ended = await new Promise<{
    code: number
    stderr: string
    why: 'exit' | 'timeout' | 'cancelled'
  }>((done) => {
    let child: ChildProcess
    try {
      // POSIX 는 그룹 리더로 띄워야 killGroup 이 설치기가 띄운 curl·tar 까지 끝낸다.
      // Windows 의 detached 는 새 콘솔 창을 띄우므로 끄고 taskkill /T 에 맡긴다.
      child = spawn(file, args, {
        // 프롬프트를 끄는 변수는 주입된 명령(테스트·e2e)에도 얹는다 — 가짜 설치기가 그 존재를 확인한다
        env: { ...env, ...cliInstallEnv(engine) },
        detached: platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      done({ code: -1, stderr: String(error), why: 'exit' })
      return
    }
    let why: 'exit' | 'timeout' | 'cancelled' = 'exit'
    let stderr = ''
    let pending = ''
    let latest: string | null = null
    let flushTimer: NodeJS.Timeout | null = null
    const flush = (): void => {
      flushTimer = null
      if (latest !== null) onLine?.(latest)
      latest = null
    }
    // 설치기는 진행 막대를 초당 수백 줄 쏟는다 — 그대로 IPC 에 실으면 화면이 그 줄들을 그리다 멈춘다
    const feed = (chunk: Buffer): void => {
      const parts = (pending + chunk.toString()).split(/[\r\n]+/)
      pending = parts.pop() ?? ''
      const line = parts
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1)
      if (!line) return
      latest = line.slice(0, LINE_MAX)
      flushTimer ??= setTimeout(flush, LINE_INTERVAL_MS)
    }
    let forceTimer: NodeJS.Timeout | null = null
    const stop = (reason: 'timeout' | 'cancelled'): void => {
      why = reason
      killGroup(child, platform)
      forceTimer ??= setTimeout(
        () => killGroup(child, platform, 'SIGKILL'),
        options.killGraceMs ?? KILL_GRACE_MS
      )
    }
    const timer = setTimeout(() => stop('timeout'), options.timeoutMs ?? TIMEOUT_MS)
    slot.kill = () => stop('cancelled')

    child.stdout?.on('data', feed)
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL)
      feed(chunk)
    })
    const finish = (code: number): void => {
      slot.kill = null
      clearTimeout(timer)
      if (forceTimer) clearTimeout(forceTimer)
      // 개행 없이 끝난 마지막 조각도 줄이다
      feed(Buffer.from('\n'))
      if (flushTimer) clearTimeout(flushTimer)
      flush()
      done({ code, stderr, why })
    }
    child.on('error', (error) => {
      stderr += String(error)
      finish(-1)
    })
    child.on('close', (code) => finish(code ?? -1))
  })

  if (ended.why !== 'exit') return failed({ ok: false, reason: ended.why, detail: '' })
  if (ended.code !== 0) {
    return failed({ ok: false, reason: 'exit', detail: lastLine(ended.stderr) })
  }

  const after = await find()
  // 설치기는 성공했다는데 앱이 아는 자리에 없다 — 성공으로 넘기면 화면이 "설치" 로 되돌아가 같은 버튼만 다시 보인다
  if ('missing' in after) return failed({ ok: false, reason: 'not-found', detail: after.reason })
  for (const marker of markers) {
    try {
      renameSync(`${marker}.pending`, marker)
    } catch (error) {
      // 설치는 된 것이다 — 실패로 알리면 거짓말이다. 마커 없이 남으면 언인스톨러가 이 CLI 를 남긴다(안전한 쪽).
      console.error('could not commit the install marker', marker, error)
    }
  }
  return { ok: true, version: after.version }
}

/** 진행 중에 다시 부르면 같은 설치를 돌려준다 — 창 둘에서 눌러도 설치기는 하나다 */
export const installCli = (engine: EngineKind, options: InstallOptions): Promise<InstallResult> => {
  const current = running.get(engine)?.promise
  if (current) return current
  const slot: Slot = { promise: null, cancelled: false, kill: null }
  running.set(engine, slot)
  const promise = run(engine, options, slot).finally(() => running.delete(engine))
  slot.promise = promise
  return promise
}
