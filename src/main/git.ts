import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, delimiter, join } from 'node:path'
import { resolveGitBinary, setupEnvironment } from 'dugite'

type GitRuntime = { file: string; env: NodeJS.ProcessEnv }

/**
 * 앱에 번들한 git(dugite) 실행 정보. 비개발자 PC 에 git 이 없어도 볼트가 돈다 — macOS 의 git 스텁은
 * Command Line Tools 설치 창을 띄우고 Windows 에는 git 이 없다. 번들이 없는 체크아웃(설치 전)만 시스템 git 을 쓴다.
 * 패키징은 electron-builder.yml asarUnpack 이 node_modules/dugite/git 을 asar 밖에 둔다(dugite 가 unpacked 경로로 바꿔 찾는다).
 */
/** 저장소 설정을 믿지 않는 실행 환경 — quotePath 고정에 실행 무력화를 얹는다 */
const hardenedEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  withoutRepoExec(withPlainPaths(env))

export const gitRuntime = (base: NodeJS.ProcessEnv = process.env): GitRuntime => {
  const file = resolveGitBinary()
  if (!existsSync(file)) return { file: 'git', env: hardenedEnv(base) }
  const { env } = setupEnvironment({}, base)
  // dugite 는 Windows 에서만 PATH 를 붙인다 — CLI 엔진이 띄우는 에이전트의 `git` 도 번들을 쓰게 모든 OS 에서 앞에 둔다
  const bin = dirname(file)
  if (process.platform !== 'win32') env.PATH = [bin, env.PATH].filter(Boolean).join(delimiter)
  return { file, env: hardenedEnv(env) }
}

/**
 * `core.quotePath=false` 를 환경변수(GIT_CONFIG_COUNT/KEY_n/VALUE_n, git 2.31+)로 건다. 기본값(true)이면 git 이
 * 한글 같은 비 ASCII 경로를 `"\354\225\210…"` 처럼 감싸 출력해, `-z` 없이 경로를 읽는 호출(충돌 목록·status)이
 * 실제 파일 이름과 어긋난다. 사용자 전역 설정에 기대지 않는다 — 기본값 PC 에서만 깨진다(2026-10-01 CI 러너에서 드러남).
 * 이미 GIT_CONFIG_COUNT 가 있으면 그 뒤에 덧붙인다.
 */
export const withPlainPaths = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  withGitConfig(env, 'core.quotePath', 'false')

/** 환경 변수 설정 하나를 이미 있는 GIT_CONFIG_COUNT 뒤에 덧붙인다 — 파일에도 argv 에도 남지 않는다 */
const withGitConfig = (env: NodeJS.ProcessEnv, key: string, value: string): NodeJS.ProcessEnv => {
  const count = Number.parseInt(env['GIT_CONFIG_COUNT'] ?? '0', 10) || 0
  return {
    ...env,
    GIT_CONFIG_COUNT: String(count + 1),
    [`GIT_CONFIG_KEY_${count}`]: key,
    [`GIT_CONFIG_VALUE_${count}`]: value
  }
}

/** 훅이 심길 자리 없는 빈 폴더 — 프로세스마다 하나, 예측 불가·0700. tmp 잔여는 OS 회수가 맡는다 */
let noHooksDir: string | undefined
const emptyHooksDir = (): string => {
  noHooksDir ??= mkdtempSync(join(tmpdir(), '2nd-brain-no-hooks-'))
  return noHooksDir
}

/**
 * 보관함 로컬 설정의 코드 실행을 끊는다. 보관함은 남의 폴더일 수 있다(입양·USB 이동):
 * `core.fsmonitor` 훅은 status 계열에서, `.git/hooks` 스크립트는 commit 계열에서 실행된다.
 * 환경 설정은 저장소 `.git/config` 를 이긴다. 훅 자리는 프로세스별 빈 폴더라 심을 곳이 없다.
 */
export const withoutRepoExec = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  withGitConfig(withGitConfig(env, 'core.fsmonitor', 'false'), 'core.hooksPath', emptyHooksDir())

/**
 * GitHub 로그인 토큰을 github.com 으로 가는 요청에만 붙인다 — `http.<url>.extraHeader` 는 그 주소로 시작하는
 * 요청에만 실린다. 토큰은 argv(다른 프로세스가 `ps` 로 본다)에도 `.git/config` 에도 쓰지 않는다.
 */
export const gitAuthEnv = (env: NodeJS.ProcessEnv, token: string): NodeJS.ProcessEnv => ({
  ...withGitConfig(
    env,
    'http.https://github.com/.extraHeader',
    `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`
  ),
  GIT_TERMINAL_PROMPT: '0'
})

/** 로그인 토큰을 읽는 곳 — main 이 시작할 때 꽂는다(`ipc/github-handlers.ts`). 꽂기 전·로그아웃이면 null */
let readToken: () => string | null = () => null

export const setGithubTokenSource = (read: () => string | null): void => {
  readToken = read
}

// extraHeader 키(`http.https://github.com/`)와 같은 접두만 — `www.github.com` 은 헤더가 실리지 않아 GitHub 로 보지 않는다
const GITHUB_HTTPS = /^https:\/\/github\.com\//i

/** 로그인 토큰이 필요한 주소 — https 의 github.com. ssh 주소·다른 호스트·로컬 경로는 아니다 */
export const isGithubHttps = (url: string): boolean => GITHUB_HTTPS.test(url.trim())

/** 이 주소로 가려면 GitHub 로그인부터 해야 하는가 — 로그인하지 않았고 github.com 으로 간다 */
export const needsGithubLogin = (url: string): boolean => isGithubHttps(url) && readToken() === null

const NETWORK = new Set(['push', 'fetch', 'clone', 'ls-remote'])

/** 값을 따로 받는 옵션 — 뒤 한 토막은 주소가 아니다 (`-u`·`--porcelain` 같은 값 없는 깃발은 여기에 없다) */
const VALUE_OPTS = new Set([
  '--depth',
  '--branch',
  '--origin',
  '--upload-pack',
  '--receive-pack',
  '--config',
  '--template',
  '--separate-git-dir',
  '--reference',
  '--jobs',
  '--shallow-since',
  '--shallow-exclude',
  '--filter',
  '--server-option',
  '-b',
  '-o',
  '-c',
  '-j'
])

/**
 * 네트워크 git 이 갈 주소 — 원격 이름(`origin`)이면 사람이 넣은 주소. 네트워크 명령이 아니거나 모르면 null.
 * 값을 받는 옵션(`--depth 1` 등)의 뒤 토막은 건너뛴다 — `clone --depth 1 <url>` 에서 `1` 을 주소로 읽으면
 * 로그인 확인도 토큰도 건너뛰어 엉뚱한 인증 실패가 된다. `--opt=value` 형은 깃발 하나로 끝난다.
 * 테스트에서 직접 본다
 */
export const networkTarget = (dir: string, args: string[]): string | null => {
  const [command, ...rest] = args
  if (command === undefined || !NETWORK.has(command)) return null
  let skipNext = false
  const where = rest.find((arg) => {
    if (skipNext) {
      skipNext = false
      return false
    }
    if (arg.startsWith('-')) {
      if (!arg.includes('=') && VALUE_OPTS.has(arg)) skipNext = true
      return false
    }
    return true
  })
  if (where === undefined) return null
  // clone 은 늘 주소다. 나머지는 주소 모양(`/`·`:`·`\`)이 아니면 원격 이름이다
  if (command === 'clone' || /[/:\\]/.test(where)) return where
  try {
    return git(dir, ['config', '--get', `remote.${where}.url`]).trim()
  } catch {
    return null
  }
}

// 볼트 git 조작 공통 실행기. 출력은 가공하지 않는다 — `-z` 출력·파일 내용을 그대로 쓰는 호출자가 있다.
export const git = (dir: string, args: string[]): string => {
  const { file, env } = gitRuntime()
  return execFileSync(file, args, {
    cwd: dir,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
}

export type GitRun =
  | {
      ok: true
      stdout: string
      /** 종료 코드 — `okCodes` 로 받아 준 실패 코드를 호출자가 다시 가릴 수 있다 */
      code: number
      /** `cap` 에 걸려 앞부분을 버렸다 — 출력이 결과인 호출은 이것을 실패로 읽는다 */
      truncated: boolean
    }
  | {
      ok: false
      code: number | null
      stderr: string
      /** login = GitHub 로 가는데 로그인하지 않아 띄우지 않았다 */
      failure: 'exit' | 'spawn' | 'timeout' | 'login'
    }

export type GitFailure = Extract<GitRun, { ok: false }>

/** 큰 보관함을 처음 올리거나 받는 git 은 오래 걸린다 */
export const GIT_TIMEOUT_MS = 10 * 60_000
const OUTPUT_CAP = 4000

/**
 * 네트워크 git(push·fetch·clone·ls-remote) 단일 창구. 동기 `git()` 과 달리 던지지 않고 결과를 돌려준다.
 * 로그인은 앱의 GitHub 토큰 하나다: github.com 으로 가면 토큰을 환경으로 싣고(`gitAuthEnv`), 로그인하지
 * 않았으면 띄우지 않고 `login` 실패로 끝낸다. credential.helper 를 비운다 — 사용자 전역 helper 가 브라우저
 * 로그인·터미널 입력을 띄우지 않게. GIT_TERMINAL_PROMPT=0: 자격이 모자라면 기다리지 않고 실패로 끝난다.
 */
export const spawnGit = (
  dir: string,
  args: string[],
  /**
   * @param okCodes 성공으로 읽을 종료 코드 — `diff --no-index` 는 차이가 있으면 1 로 끝난다
   * @param cap 모아 둘 출력 길이 — 기본은 사람에게 보일 오류 문구 분량이다. diff 처럼 출력이 결과면 늘린다
   */
  opts: { timeoutMs?: number; okCodes?: number[]; cap?: number } = {}
): Promise<GitRun> => {
  const okCodes = opts.okCodes ?? [0]
  const cap = opts.cap ?? OUTPUT_CAP
  const target = networkTarget(dir, args)
  const token = target !== null && isGithubHttps(target) ? readToken() : null
  if (target !== null && needsGithubLogin(target)) {
    return Promise.resolve({ ok: false, code: null, stderr: '', failure: 'login' })
  }
  const { file, env } = gitRuntime()
  return new Promise((done) => {
    const child = spawn(file, ['-c', 'credential.helper=', ...args], {
      cwd: dir,
      env: token === null ? { ...env, GIT_TERMINAL_PROMPT: '0' } : gitAuthEnv(env, token),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    let truncated = false
    let settled = false
    const settle = (run: GitRun): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done(run)
    }
    // 끊을 때 결과를 바로 낸다 — git 이 띄운 손자 프로세스(git-remote-https)가 파이프를 붙들면
    // 'close' 는 영영 오지 않는다. 죽이는 신호는 보내되 기다리지 않는다.
    // 파이프도 끊는다 — 손자가 붙들고 있으면 프로세스 객체·fd 가 쌓인다
    const timer = setTimeout(() => {
      child.kill()
      child.stdout.destroy()
      child.stderr.destroy()
      settle({ ok: false, code: null, stderr, failure: 'timeout' })
    }, opts.timeoutMs ?? GIT_TIMEOUT_MS)
    // 청크 경계에서 UTF-8 이 갈라지면 한글이 깨진다 — 출력이 사람에게 보일 수 있어 스트림이 이어 붙이게 한다
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      const joined = stdout + chunk
      truncated = truncated || joined.length > cap
      stdout = joined.slice(-cap)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-OUTPUT_CAP)
    })
    child.once('error', (error) => {
      settle({ ok: false, code: null, stderr: error.message, failure: 'spawn' })
    })
    child.once('close', (code) => {
      if (code !== null && okCodes.includes(code)) {
        return settle({ ok: true, stdout, code, truncated })
      }
      settle({ ok: false, code, stderr, failure: 'exit' })
    })
  })
}
