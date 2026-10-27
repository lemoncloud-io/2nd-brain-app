import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { cancelInstalls, installCli } from './install-cli'

const installer = (name: string): { file: string; args: string[] } => ({
  file: resolve('test/fixtures/fake-installer', name),
  args: []
})

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const until = async (check: () => boolean, ms = 3000): Promise<void> => {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 20))
  expect(check()).toBe(true)
}

describe.skipIf(process.platform === 'win32')('installCli', () => {
  let home: string
  let markerDir: string
  const env = (): NodeJS.ProcessEnv => ({ HOME: home, PATH: '/usr/bin:/bin' })
  const marker = (name: string): boolean => existsSync(join(markerDir, name))

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'install-cli-'))
    markerDir = join(home, 'userData', 'installed-cli')
  })
  afterEach(() => {
    cancelInstalls()
    rmSync(home, { recursive: true, force: true })
  })

  it('설치가 끝나면 CLI 를 다시 찾아 버전을 돌려주고, 바이너리·설정 마커를 남긴다', async () => {
    const result = await installCli('claude', { env: env(), markerDir, command: installer('ok') })
    expect(result).toEqual({ ok: true, version: '2.1.0 (Claude Code)' })
    expect(marker('claude')).toBe(true)
    expect(marker('claude.config')).toBe(true)
  })

  // 벤더 install.sh 는 끝에 "Start Codex now?" 를 묻는다 — 변수가 없으면 이 가짜 설치기는 그 자리에서 exit 2
  it('Codex 설치기에는 프롬프트를 끄는 환경변수가 실려 묻지 않고 끝난다', async () => {
    const result = await installCli('codex', {
      env: env(),
      markerDir,
      command: installer('prompting')
    })
    expect(result).toEqual({ ok: true, version: 'codex-cli 0.155.1' })
    expect(marker('codex')).toBe(true)
    expect(marker('codex.config')).toBe(true)
  })

  // VS Code 확장·Claude Desktop 이 먼저 만든 ~/.claude 는 바이너리가 없었어도 남의 것이다
  it('설치 전에 설정 폴더가 있었으면 설정 마커는 남기지 않는다', async () => {
    mkdirSync(join(home, '.claude'))
    await installCli('claude', { env: env(), markerDir, command: installer('ok') })
    expect(marker('claude')).toBe(true)
    expect(marker('claude.config')).toBe(false)
  })

  it('이미 설치돼 있으면 설치기를 돌리지 않고 마커도 남기지 않는다', async () => {
    await installCli('claude', { env: env(), markerDir, command: installer('ok') })
    rmSync(markerDir, { recursive: true })
    // 돌았다면 exit 6 으로 실패했을 설치기
    const result = await installCli('claude', { env: env(), markerDir, command: installer('fail') })
    expect(result).toMatchObject({ ok: true })
    expect(existsSync(markerDir)).toBe(false)
  })

  // 설치 도중 앱이 죽으면 .pending 만 남는다 — 그 뒤 사용자가 직접 깐 CLI 를 우리 것으로 치면 언인스톨러가 지운다
  it('끊긴 설치가 남긴 .pending 은 확정하지 않고 버린다', async () => {
    await installCli('claude', { env: env(), markerDir, command: installer('ok') })
    rmSync(markerDir, { recursive: true })
    mkdirSync(markerDir, { recursive: true })
    writeFileSync(join(markerDir, 'claude.pending'), '')
    writeFileSync(join(markerDir, 'claude.config.pending'), '')

    const result = await installCli('claude', { env: env(), markerDir, command: installer('ok') })
    expect(result).toMatchObject({ ok: true })
    expect(marker('claude')).toBe(false)
    expect(marker('claude.pending')).toBe(false)
    expect(marker('claude.config.pending')).toBe(false)
  })

  // CLI 를 지운 뒤에도 남은 확정 마커는 옛 설치의 것이다 — 그동안 생긴 ~/.claude 까지 우리 것으로 치면 안 된다
  it('CLI 없이 남은 옛 마커는 새 설치가 다시 판정한다', async () => {
    mkdirSync(markerDir, { recursive: true })
    writeFileSync(join(markerDir, 'claude.config'), '')
    mkdirSync(join(home, '.claude'))
    await installCli('claude', { env: env(), markerDir, command: installer('ok') })
    expect(marker('claude')).toBe(true)
    expect(marker('claude.config')).toBe(false)
  })

  it('실패 사유는 길게 쏟아진 stderr 의 마지막 줄이다', async () => {
    const result = await installCli('claude', {
      env: env(),
      markerDir,
      command: installer('long-stderr')
    })
    expect(result).toEqual({ ok: false, reason: 'exit', detail: 'final reason' })
  })

  // 깔고 나서 기록에 실패하면 다음 시도는 "이미 설치됨" 으로 끝나 마커를 쓸 기회가 없다
  it('마커를 못 쓰면 설치기를 돌리지 않고 실패로 알린다', async () => {
    // userData 자리에 파일을 둬 mkdir 을 막는다
    writeFileSync(join(home, 'userData'), '')
    const result = await installCli('claude', { env: env(), markerDir, command: installer('ok') })
    expect(result).toMatchObject({ ok: false, reason: 'exit' })
    expect(existsSync(join(home, '.local/bin/claude'))).toBe(false)
  })

  it('설치기가 실패하면 stderr 마지막 줄을 사유로 돌려주고 마커가 없다', async () => {
    const result = await installCli('claude', { env: env(), markerDir, command: installer('fail') })
    expect(result).toEqual({
      ok: false,
      reason: 'exit',
      detail: 'curl: (6) Could not resolve host: claude.ai'
    })
    expect(existsSync(markerDir)).toBe(false)
  })

  it('설치기는 성공했는데 CLI 를 못 찾으면 not-found 로 실패하고 마커가 없다', async () => {
    const result = await installCli('claude', {
      env: env(),
      markerDir,
      command: installer('no-binary')
    })
    expect(result).toMatchObject({ ok: false, reason: 'not-found' })
    expect(existsSync(markerDir)).toBe(false)
  })

  it('시간이 넘으면 설치기와 그 자식까지 끝낸다', async () => {
    const result = await installCli('claude', {
      env: env(),
      markerDir,
      command: installer('hang'),
      timeoutMs: 400
    })
    expect(result).toMatchObject({ ok: false, reason: 'timeout' })
    expect(existsSync(markerDir)).toBe(false)
    const child = Number(readFileSync(join(home, 'child.pid'), 'utf8'))
    await until(() => !alive(child))
  })

  // close 가 오지 않으면 이 Promise 와 화면의 스피너가 영영 남는다
  it('SIGTERM 을 무시하는 설치기는 유예 뒤 강제로 끝낸다', async () => {
    const result = await installCli('claude', {
      env: env(),
      markerDir,
      command: installer('stubborn'),
      timeoutMs: 300,
      killGraceMs: 200
    })
    expect(result).toMatchObject({ ok: false, reason: 'timeout' })
    const pid = Number(readFileSync(join(home, 'installer.pid'), 'utf8'))
    await until(() => !alive(pid))
  })

  it('앱이 꺼질 때 진행 중인 설치를 끝낸다', async () => {
    const pending = installCli('claude', { env: env(), markerDir, command: installer('hang') })
    await until(() => existsSync(join(home, 'child.pid')))
    cancelInstalls()
    expect(await pending).toMatchObject({ ok: false, reason: 'cancelled' })
    expect(existsSync(markerDir)).toBe(false)
    const child = Number(readFileSync(join(home, 'child.pid'), 'utf8'))
    await until(() => !alive(child))
  })

  it('진행 중에 다시 부르면 같은 설치를 기다린다 — 설치기는 하나만 뜬다', async () => {
    const options = { env: env(), markerDir, command: installer('ok') }
    const first = installCli('claude', options)
    expect(installCli('claude', options)).toBe(first)
    await first
  })

  it('개행 없이 끝난 마지막 출력도 줄로 넘긴다', async () => {
    const lines: string[] = []
    await installCli('claude', {
      env: env(),
      markerDir,
      command: installer('no-newline'),
      onLine: (line) => lines.push(line)
    })
    expect(lines.at(-1)).toBe('last words')
  })

  it('쏟아지는 출력은 묶어서 200자 이하로 넘기고 마지막 줄은 빠뜨리지 않는다', async () => {
    const lines: string[] = []
    await installCli('claude', {
      env: env(),
      markerDir,
      command: installer('noisy'),
      onLine: (line) => lines.push(line)
    })
    expect(lines.length).toBeLessThan(50)
    expect(lines.every((line) => line.length <= 200)).toBe(true)
    expect(lines.at(-1)).toMatch(/^progress 299 /)
  })
})
