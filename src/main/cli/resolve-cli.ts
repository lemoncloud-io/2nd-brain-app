// CLI 실행 파일 탐지·실행 — Dock 최소 PATH 와 Windows(PATHEXT·npm .cmd shim) 탐지가 여기 모인다. Claude·Codex 가 같이 쓴다.
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import crossSpawn from 'cross-spawn'
import { existsSync } from 'node:fs'
import { posix, win32 } from 'node:path'
import { gitRuntime } from '../git'
import { mainT } from '../i18n'

export type ResolvedCli = { path: string; version: string } | { missing: true; reason: string }

/**
 * CLI 가 받는 환경 — 앱 번들 git 을 PATH 에 둔다(에이전트의 `git` 호출). Windows 의 Claude Code 는 Git Bash 를
 * 요구하므로 번들 git 에 bash 가 있으면 CLAUDE_CODE_GIT_BASH_PATH 로 알려 준다(dugite MinGit 배치 미검증 — 있을 때만).
 */
export const cliEnv = (base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const { file, env } = gitRuntime(base)
  if (process.platform !== 'win32' || env.CLAUDE_CODE_GIT_BASH_PATH || file === 'git') return env
  const root = win32.dirname(win32.dirname(file))
  const bash = [
    win32.join(root, 'usr', 'bin', 'bash.exe'),
    win32.join(root, 'bin', 'bash.exe')
  ].find((candidate) => existsSync(candidate))
  return bash ? { ...env, CLAUDE_CODE_GIT_BASH_PATH: bash } : env
}

/**
 * CLI 를 띄운다. Windows 에서 npm 이 까는 `.cmd` shim 은 셸 없이 spawn 하면 EINVAL 이다(Node 보안 수정) —
 * cross-spawn 이 cmd.exe 경유 실행과 인자 escape 를 맡는다. 다른 OS 에서는 node spawn 과 같다.
 */
export const spawnCli = (file: string, args: string[], options: SpawnOptions): ChildProcess =>
  crossSpawn(file, args, { windowsHide: true, ...options, env: options.env ?? cliEnv() })

/**
 * 브라우저 로그인 흐름을 띄우고 기다리지 않는다 — 끝났는지는 화면이 상태를 다시 물어 안다.
 * Windows 의 detached 는 새 콘솔 창을 띄우므로 끈다.
 */
export const launchLogin = (cliPath: string, args: string[]): void => {
  const child = spawnCli(cliPath, args, {
    detached: process.platform !== 'win32',
    stdio: 'ignore'
  })
  child.on('error', (error) => console.error('login run failed', cliPath, error))
  child.unref()
}

export const execFile = (
  file: string,
  args: string[],
  timeoutMs = 10_000
): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((resolve) => {
    const child = spawnCli(file, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      // spawn 실패 원인을 버리면 EACCES도 미설치로 뭉개진다 — stderr에 남긴다
      const cause = error instanceof Error ? error.message : String(error)
      resolve({ code: -1, stdout, stderr: stderr ? `${stderr}\n${cause}` : cause })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })

const probe = async (
  path: string
): Promise<{ version: string } | { spawnError: string } | null> => {
  const { code, stdout, stderr } = await execFile(path, ['--version'])
  const spawnMatch = /spawn .* ((?:ENOENT|EACCES|EINVAL|EPERM)[^\n]*)/.exec(stderr)
  if (code === -1 && spawnMatch?.[1]) return { spawnError: spawnMatch[1] }
  if (code !== 0) return null
  const version = stdout.trim().split('\n')[0]?.trim()
  return version ? { version } : null
}

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

/**
 * 후보 경로를 우선순위대로 낸다(존재 여부는 보지 않는다): 설정값 → PATH → 알려진 설치 경로.
 * Windows 는 `;` 구분 PATH 에 PATHEXT 확장자를 붙여 찾고, 공식 설치기(`~\.local\bin\<name>.exe`)와
 * npm 전역(`%APPDATA%\npm\<name>.cmd`), Codex 설치 스크립트 위치를 본다.
 * Windows env 키는 대소문자를 가리지 않아 `Path` 도 읽는다.
 */
export const cliCandidates = (
  name: string,
  override: string | undefined,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): string[] => {
  const windows = platform === 'win32'
  const path = windows ? win32 : posix
  const names = windows
    ? (env.PATHEXT ?? DEFAULT_PATHEXT)
        .split(';')
        .filter(Boolean)
        .map((ext) => `${name}${ext.toLowerCase()}`)
    : [name]
  const home = windows ? env.USERPROFILE : env.HOME
  const known = windows
    ? [
        home ? path.join(home, '.local', 'bin', `${name}.exe`) : null,
        env.APPDATA ? path.join(env.APPDATA, 'npm', `${name}.cmd`) : null,
        // Codex 공식 설치 스크립트의 Windows 설치 위치(2026-09-21 chatgpt.com/codex/install.ps1 재확인 —
        // `$env:LOCALAPPDATA\Programs\OpenAI\Codex\bin` 정션, 실체는 `~\.codex\packages\standalone`).
        // 설치기가 PATH 를 고쳐도 이미 떠 있는 앱의 PATH 는 그대로라 직접 본다.
        name === 'codex' && env.LOCALAPPDATA
          ? path.join(env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')
          : null
      ]
    : [
        // Claude·Codex 공식 설치기가 둘 다 여기 놓는다(2026-09-21 두 install.sh 를 임시 HOME 에 돌려 실측)
        home ? path.join(home, '.local/bin', name) : null,
        `/opt/homebrew/bin/${name}`,
        `/usr/local/bin/${name}`
      ]

  const candidates: string[] = []
  const add = (candidate: string | null | undefined): void => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate)
  }
  add(override)
  for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    if (!dir) continue
    for (const file of names) add(path.join(dir, file))
  }
  for (const candidate of known) add(candidate)
  return candidates
}

// 각 후보를 `<name> --version` 성공으로 검증해 첫 번째를 채택한다. 설정값은 없어도 시도한다(검증이 판정).
export const resolveCli = async (
  name: string,
  override: string | undefined,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): Promise<ResolvedCli> => {
  let firstSpawnError: string | null = null
  for (const candidate of cliCandidates(name, override, env, platform)) {
    if (candidate !== override && !existsSync(candidate)) continue
    const probed = await probe(candidate)
    if (probed !== null && 'version' in probed) return { path: candidate, version: probed.version }
    if (probed !== null && 'spawnError' in probed && firstSpawnError === null)
      firstSpawnError = `${candidate}: ${probed.spawnError}`
  }
  const label = name === 'codex' ? 'Codex' : name === 'claude' ? 'Claude' : name
  if (firstSpawnError !== null)
    return {
      missing: true,
      reason: mainT().engineMain.cli.spawnFailed(label, firstSpawnError)
    }
  return {
    missing: true,
    reason: mainT().engineMain.cli.notInstalled(label)
  }
}
