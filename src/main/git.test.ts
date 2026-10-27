import { afterEach, describe, expect, it, vi } from 'vitest'
import * as childProcess from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:net'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  git,
  gitAuthEnv,
  gitRuntime,
  isGithubHttps,
  networkTarget,
  setGithubTokenSource,
  spawnGit,
  withPlainPaths,
  withoutRepoExec
} from './git'

// spawn 에 실제로 넘어간 인자·환경을 본다 — 토큰이 argv 에 실리지 않는지가 이 창구의 약속이다
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn(actual.spawn) }
})
const spawnSpy = vi.mocked(childProcess.spawn)

const dirs: string[] = []
const repo = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'spawn-git-'))
  execFileSync('git', ['init', '-q', '-b', 'main', dir])
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true })
  setGithubTokenSource(() => null)
  spawnSpy.mockClear()
})

const restore = (key: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

describe('spawnGit', () => {
  it('성공하면 표준 출력을 돌려준다', async () => {
    const run = await spawnGit(repo(), ['rev-parse', '--is-inside-work-tree'])
    expect(run).toEqual({ ok: true, stdout: 'true\n', code: 0, truncated: false })
  })

  it('okCodes 로 받아 준 코드는 성공이고, 어느 코드였는지 실어 준다', async () => {
    // `diff --no-index` 는 다르면 1 로 끝난다 — 그 1 을 오류로 읽지 않는 자리
    const dir = repo()
    writeFileSync(join(dir, 'a.txt'), '하나\n')
    writeFileSync(join(dir, 'b.txt'), '둘\n')
    const run = await spawnGit(dir, ['diff', '--no-color', '--no-index', '--', 'a.txt', 'b.txt'], {
      okCodes: [0, 1]
    })
    expect(run.ok).toBe(true)
    if (!run.ok) return
    expect(run.code).toBe(1)
    expect(run.stdout).toContain('+둘')
  })

  it('상한을 넘긴 출력은 잘렸다고 알린다 — 잘린 결과를 온전한 것으로 읽지 않게', async () => {
    const dir = repo()
    writeFileSync(join(dir, 'big.txt'), '가'.repeat(5000) + '\n')
    const run = await spawnGit(dir, ['diff', '--no-index', '--', '/dev/null', 'big.txt'], {
      okCodes: [0, 1],
      cap: 200
    })
    expect(run.ok).toBe(true)
    if (!run.ok) return
    expect(run.truncated).toBe(true)
    expect(run.stdout.length).toBeLessThanOrEqual(200)
  })

  it('실패하면 종료 코드와 stderr 를 돌려준다', async () => {
    const run = await spawnGit(repo(), ['rev-parse', '--verify', 'no-such-ref'])
    expect(run.ok).toBe(false)
    if (run.ok) return
    expect(run.failure).toBe('exit')
    expect(run.code).not.toBe(0)
    expect(run.stderr).not.toBe('')
  })

  // 사용자 전역 helper 가 터미널 입력·브라우저 로그인을 띄우지 않게 helper 목록을 비운다 — 로그인은 앱의 GitHub 토큰 하나다.
  // 전역 helper 를 실제로 깔아 두고 git 자신이 읽은 목록을 되돌려 받는다 — 빈 값이 그 앞의 helper 를 끊는다.
  it('앞선 자격증명 helper 를 끊고 아무것도 남기지 않는다', async () => {
    const dir = repo()
    const globalConfig = join(dir, 'global.gitconfig')
    const systemConfig = join(dir, 'system.gitconfig')
    writeFileSync(globalConfig, '[credential]\n\thelper = store\n')
    writeFileSync(systemConfig, '')
    // 시스템 설정도 비운다 — 번들 git 이 없어 시스템 git 으로 폴백하면 /etc/gitconfig 의 helper 가 앞에 붙는다
    const before = { g: process.env.GIT_CONFIG_GLOBAL, s: process.env.GIT_CONFIG_SYSTEM }
    process.env.GIT_CONFIG_GLOBAL = globalConfig
    process.env.GIT_CONFIG_SYSTEM = systemConfig
    try {
      const run = await spawnGit(dir, ['config', '--get-all', 'credential.helper'])
      expect(run).toEqual({ ok: true, stdout: 'store\n\n', code: 0, truncated: false })
    } finally {
      restore('GIT_CONFIG_GLOBAL', before.g)
      restore('GIT_CONFIG_SYSTEM', before.s)
    }
  })

  it('실행 자체가 실패하면 spawn 갈래로 끝난다', async () => {
    const run = await spawnGit(join(tmpdir(), 'no-such-dir-for-spawn-git'), ['status'])
    expect(run.ok).toBe(false)
    if (run.ok) return
    expect(run.failure).toBe('spawn')
    expect(run.stderr).not.toBe('')
  })

  // 이 창구의 핵심 약속 — 로그인이 없으면 git 이 터미널 입력을 기다리지 않고 실패로 끝난다.
  // git alias 로 자식 프로세스가 실제로 받은 환경을 되읽는다(셸 alias 라 POSIX 셸 기준).
  it('자식 git 의 터미널 입력을 꺼 둔다', async () => {
    const run = await spawnGit(repo(), [
      '-c',
      'alias.envcheck=!printf %s "$GIT_TERMINAL_PROMPT"',
      'envcheck'
    ])
    expect(run).toEqual({ ok: true, stdout: '0', code: 0, truncated: false })
  })

  // 응답하지 않는 서버로 고정한다 — 실제 인터넷에 기대면 즉시 거절하는 망에서 'exit' 로 떨어진다
  it('시간이 지나면 끊는다', async () => {
    const silent: Server = createServer(() => {})
    await new Promise<void>((ready) => silent.listen(0, '127.0.0.1', ready))
    const port = (silent.address() as { port: number }).port
    try {
      const run = await spawnGit(repo(), ['ls-remote', `git://127.0.0.1:${port}/x.git`], {
        timeoutMs: 500
      })
      expect(run.ok).toBe(false)
      if (run.ok) return
      expect(run.failure).toBe('timeout')
    } finally {
      silent.close()
    }
  })
})

// 네트워크 git 은 타임아웃·자격증명 규칙을 타야 한다. 동기 `git()` 은 그 규칙이 없고 main 프로세스를 멈춘다.
describe('네트워크 git 창구', () => {
  // 리터럴 배열만 본다 — 인자를 변수로 넘기는 호출은 잡지 못한다. 실행기 이름은 세 가지 모두 본다.
  const RUNNERS =
    /\b(git|spawnSync|execFileSync)\([^)]*?\[[^\]]*?'(push|fetch|clone|pull|ls-remote)'/s

  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return sources(path)
      return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : []
    })

  it('동기 git() 으로 네트워크를 타는 곳이 없다', () => {
    const offenders = sources(join(__dirname)).filter((path) =>
      RUNNERS.test(readFileSync(path, 'utf8'))
    )
    expect(offenders).toEqual([])
  })
})

describe('networkTarget', () => {
  it('값을 받는 옵션 뒤 토막은 주소가 아니다', () => {
    const url = 'https://github.com/acme/team.git'
    const dir = repo()
    execFileSync('git', ['remote', 'add', 'origin', url], { cwd: dir })
    expect(networkTarget(dir, ['clone', '--depth', '1', url])).toBe(url)
    expect(networkTarget(dir, ['clone', '-b', 'main', url, 'copy'])).toBe(url)
    expect(networkTarget(dir, ['clone', '--config', 'a.b=c', url])).toBe(url)
    // 옛 코드는 여기서 `1` 을 주소로 읽었다 — 이제 origin 을 풀어 url 이 나온다
    expect(networkTarget(dir, ['fetch', '--depth', '1', 'origin', 'main'])).toBe(url)
    expect(networkTarget(dir, ['push', '--porcelain', 'origin', 'main'])).toBe(url)
    expect(networkTarget(dir, ['status', '--porcelain'])).toBeNull()
    expect(networkTarget(dir, ['clone'])).toBeNull()
  })
})

describe('withPlainPaths', () => {
  it('한글 경로를 감싸지 않고 그대로 출력한다 — 사용자 전역 설정이 기본값이어도', () => {
    const dir = repo()
    writeFileSync(join(dir, '그림.png'), 'png')
    // 개발 PC 의 ~/.gitconfig(core.quotePath=false 일 수 있다)를 끊고 git 기본값에서 본다
    const empty = join(dir, '.empty-gitconfig')
    writeFileSync(empty, '')
    const was = process.env['GIT_CONFIG_GLOBAL']
    process.env['GIT_CONFIG_GLOBAL'] = empty
    try {
      expect(git(dir, ['status', '--porcelain', '--', '그림.png'])).toBe('?? 그림.png\n')
    } finally {
      restore('GIT_CONFIG_GLOBAL', was)
    }
  })

  it('이미 있는 GIT_CONFIG_COUNT 뒤에 덧붙인다', () => {
    const env = withPlainPaths({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'user.name',
      GIT_CONFIG_VALUE_0: 'x'
    })
    expect(env).toMatchObject({
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'user.name',
      GIT_CONFIG_KEY_1: 'core.quotePath',
      GIT_CONFIG_VALUE_1: 'false'
    })
  })
})

describe('gitAuthEnv', () => {
  const header = (token: string): string =>
    `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`

  it('github.com 에만 붙는 헤더를 이미 있는 설정 뒤에 덧붙이고 터미널 입력을 끈다', () => {
    const env = gitAuthEnv(withPlainPaths({}), 'gho_abc')
    expect(env).toMatchObject({
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'core.quotePath',
      GIT_CONFIG_KEY_1: 'http.https://github.com/.extraHeader',
      GIT_CONFIG_VALUE_1: header('gho_abc'),
      GIT_TERMINAL_PROMPT: '0'
    })
  })

  // 번들 git(dugite)이 환경 변수 설정을 정말 읽는지 — 읽지 않으면 토큰이 있어도 로그인 실패로 보인다
  it('번들 git 이 환경으로 넘긴 헤더와 기존 설정을 함께 읽는다', () => {
    const { file, env } = gitRuntime()
    const read = (key: string): string =>
      execFileSync(file, ['config', '--get', key], {
        cwd: repo(),
        env: gitAuthEnv(env, 'gho_abc'),
        encoding: 'utf8'
      }).trim()
    expect(read('http.https://github.com/.extraHeader')).toBe(header('gho_abc'))
    expect(read('core.quotePath')).toBe('false')
  })
})

describe('withoutRepoExec', () => {
  // 보관함은 남의 폴더일 수 있다(입양·USB) — 그 안 .git/config·hooks 가 코드를 실행하면 열기만으로 끝난다.
  const markerIn = (): string => {
    const markerDir = mkdtempSync(join(tmpdir(), 'hook-marker-'))
    dirs.push(markerDir)
    return join(markerDir, 'ran')
  }

  const plantExecHook = (path: string, marker: string): void => {
    writeFileSync(path, `#!/bin/sh\ntouch "${marker}"\n`)
    chmodSync(path, 0o700)
  }

  const plantFsmonitor = (dir: string, marker: string): void => {
    const hook = join(dir, 'watch.sh')
    plantExecHook(hook, marker)
    execFileSync('git', ['config', 'core.fsmonitor', hook], { cwd: dir })
  }

  it('저장소 core.fsmonitor 훅을 실행하지 않는다 — status 결과는 그대로', () => {
    const dir = repo()
    const marker = markerIn()
    plantFsmonitor(dir, marker)
    writeFileSync(join(dir, 'a.md'), 'a\n')
    expect(git(dir, ['status', '--porcelain', '--', 'a.md'])).toBe('?? a.md\n')
    expect(existsSync(marker)).toBe(false)
  })

  it('spawnGit 으로도 fsmonitor 훅을 실행하지 않는다', async () => {
    const dir = repo()
    const marker = markerIn()
    plantFsmonitor(dir, marker)
    const run = await spawnGit(dir, ['status', '--porcelain', '-uall', '--no-renames'])
    expect(run.ok).toBe(true)
    expect(existsSync(marker)).toBe(false)
  })

  it('.git/hooks 스크립트를 실행하지 않고 커밋은 성공한다', () => {
    const dir = repo()
    const marker = markerIn()
    plantExecHook(join(dir, '.git', 'hooks', 'pre-commit'), marker)
    writeFileSync(join(dir, 'a.md'), 'a\n')
    execFileSync('git', ['add', '-A'], { cwd: dir })
    git(dir, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'a'])
    expect(existsSync(marker)).toBe(false)
    expect(git(dir, ['log', '--format=%s', '-1'])).toBe('a\n')
  })

  it('hooks 자리는 절대경로·프로세스별 빈 폴더다', () => {
    const valueOf = (env: NodeJS.ProcessEnv, key: string): string | undefined => {
      const count = Number.parseInt(env['GIT_CONFIG_COUNT'] ?? '0', 10) || 0
      for (let i = 0; i < count; i += 1) {
        if (env[`GIT_CONFIG_KEY_${i}`] === key) return env[`GIT_CONFIG_VALUE_${i}`]
      }
      return undefined
    }
    const a = withoutRepoExec({})
    const b = withoutRepoExec({})
    expect(valueOf(a, 'core.fsmonitor')).toBe('false')
    const hooks = valueOf(a, 'core.hooksPath')
    expect(hooks).toBe(valueOf(b, 'core.hooksPath'))
    expect(hooks !== undefined && isAbsolute(hooks)).toBe(true)
    expect(hooks?.startsWith(tmpdir())).toBe(true)
    expect(readdirSync(hooks as string)).toEqual([])
  })
})

describe('isGithubHttps', () => {
  it.each([
    ['https://github.com/acme/team.git', true],
    ['HTTPS://GITHUB.COM/acme/team', true],
    // extraHeader 는 https://github.com/ 에만 실린다 — 헤더가 안 실리는 주소를 GitHub 로 보면 로그인해도 실패한다
    ['https://www.github.com/acme/team.git', false],
    ['git@github.com:acme/team.git', false],
    ['https://gitlab.com/acme/team.git', false],
    ['/tmp/team.git', false]
  ])('%s', (url, expected) => {
    expect(isGithubHttps(url)).toBe(expected)
  })
})

describe('spawnGit — GitHub 로그인', () => {
  const TEAM = 'https://github.com/acme/team.git'

  /** origin 이 github.com 주소이고, 그 주소가 실제로는 로컬 bare 로 가는 보관함 — 네트워크 없이 push 가 돈다 */
  const githubVault = (): { dir: string; bare: string } => {
    const dir = repo()
    const bare = join(dir, '..', `${dir.split('/').pop()}-bare.git`)
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
    dirs.push(bare)
    execFileSync('git', ['remote', 'add', 'origin', TEAM], { cwd: dir })
    execFileSync('git', ['config', `url.${bare}.insteadOf`, TEAM], { cwd: dir })
    writeFileSync(join(dir, 'a.md'), 'a\n')
    execFileSync('git', ['add', '-A'], { cwd: dir })
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'a'], {
      cwd: dir
    })
    return { dir, bare }
  }

  it('토큰은 환경으로만 가고 argv 에는 없다', async () => {
    const { dir } = githubVault()
    setGithubTokenSource(() => 'gho_secret')
    const run = await spawnGit(dir, ['push', '--porcelain', 'origin', 'main'])
    expect(run.ok).toBe(true)
    const [file, args, options] = spawnSpy.mock.calls.at(-1)!
    const argv = [file, ...(args ?? [])].join(' ')
    const encoded = Buffer.from('x-access-token:gho_secret').toString('base64')
    expect(argv).not.toContain('gho_secret')
    expect(argv).not.toContain(encoded)
    expect(Object.values(options?.env ?? {})).toContain(`AUTHORIZATION: basic ${encoded}`)
  })

  it('로그인하지 않았으면 github.com 으로 가는 push·fetch·clone·ls-remote 를 띄우지 않고 로그인 실패로 끝낸다', async () => {
    const { dir } = githubVault()
    const calls = [
      ['push', '--porcelain', 'origin', 'main'],
      ['fetch', 'origin', 'main'],
      ['clone', TEAM, 'copy'],
      ['ls-remote', '--heads', TEAM]
    ]
    for (const args of calls) {
      const run = await spawnGit(dir, args)
      expect(run).toEqual({ ok: false, code: null, stderr: '', failure: 'login' })
    }
    expect(spawnSpy).not.toHaveBeenCalled()
  })

  // ls-remote 도 원격 이름으로 부를 수 있다 — 이름을 주소로 읽으면 로그인 확인과 토큰을 건너뛴다
  it('원격 이름으로 부른 ls-remote 도 그 원격의 주소로 로그인을 본다', async () => {
    const { dir } = githubVault()
    expect(await spawnGit(dir, ['ls-remote', '--heads', 'origin'])).toMatchObject({
      ok: false,
      failure: 'login'
    })
    setGithubTokenSource(() => 'gho_secret')
    expect((await spawnGit(dir, ['ls-remote', '--heads', 'origin'])).ok).toBe(true)
  })

  it('github.com 이 아닌 원격은 로그인 없이 그대로 가고, 토큰도 실어 보내지 않는다', async () => {
    const { dir, bare } = githubVault()
    execFileSync('git', ['remote', 'set-url', 'origin', bare], { cwd: dir })
    setGithubTokenSource(() => 'gho_secret')
    const run = await spawnGit(dir, ['push', '--porcelain', 'origin', 'main'])
    expect(run.ok).toBe(true)
    const [, , options] = spawnSpy.mock.calls.at(-1)!
    expect(JSON.stringify(options?.env)).not.toContain('extraHeader')
  })
})
