// build/uninstall-mac.command 를 임시 HOME·임시 Applications 에서 실제로 돌린다 — 지우는 스크립트라 mock 이 아니라 격리로 검증한다
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve('build/uninstall-mac.command')
const APP_ID = 'io.lemoncloud.2nd-brain-desktop'

describe.skipIf(process.platform === 'win32')('uninstall-mac.command', () => {
  let root: string
  let home: string
  let apps: string
  let app: string
  let userData: string

  const run = (
    args: string[],
    env: Record<string, string | undefined> = {}
  ): ReturnType<typeof spawnSync> =>
    spawnSync('bash', [SCRIPT, ...args], {
      env: {
        PATH: '/usr/bin:/bin',
        TMPDIR: root,
        HOME: home,
        SECOND_BRAIN_APPLICATIONS_DIR: apps,
        ...env
      },
      encoding: 'utf8'
    })

  const file = (path: string): void => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, '')
  }
  const marker = (name: string): void => file(join(userData, 'installed-cli', name))
  /** 번들 흉내 — 스크립트는 지우기 전에 Info.plist 의 CFBundleIdentifier 를 대조한다 */
  const bundle = (path: string, id = APP_ID): void => {
    mkdirSync(join(path, 'Contents', 'MacOS'), { recursive: true })
    writeFileSync(
      join(path, 'Contents', 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string></dict></plist>
`
    )
  }

  /** 설치기가 남기는 트리 전부(uninstall-targets.json 의 mac 경로) */
  const plantAll = (): void => {
    bundle(app)
    file(join(userData, 'settings.json'))
    file(join(home, 'Library/Preferences', `${APP_ID}.plist`))
    file(join(home, 'Library/Caches', APP_ID, 'x'))
    file(join(home, 'Library/Saved Application State', `${APP_ID}.savedState`, 'x'))
    file(join(home, '.local/bin/claude'))
    file(join(home, '.local/share/claude/versions/1'))
    file(join(home, '.local/state/claude/locks/x'))
    file(join(home, '.cache/claude/staging/x'))
    file(join(home, '.claude/settings.json'))
    file(join(home, '.claude.json'))
    file(join(home, '.codex/packages/standalone/current/bin/codex'))
    file(join(home, '.codex/config.toml'))
    file(join(home, '.local/bin/codex'))
    file(join(home, '.local/bin/codex-code-mode-host'))
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'uninstall-mac-'))
    home = join(root, 'home')
    apps = join(root, 'Applications')
    app = join(apps, '2nd-brain.app')
    userData = join(home, 'Library/Application Support/2nd-brain-app')
    mkdirSync(home)
    mkdirSync(apps)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('마커가 둘 다 있으면 앱·앱 데이터·CLI·설정까지 전부 지우고 --check 가 0 이다', () => {
    plantAll()
    for (const name of ['claude', 'claude.config', 'codex', 'codex.config']) marker(name)
    const vault = join(home, 'Documents/vault/note.md')
    file(vault)

    const result = run(['--yes'])
    expect(result.status, String(result.stderr)).toBe(0)
    expect(existsSync(app)).toBe(false)
    expect(existsSync(userData)).toBe(false)
    expect(existsSync(join(home, '.claude'))).toBe(false)
    expect(existsSync(join(home, '.codex'))).toBe(false)
    expect(existsSync(join(home, '.local/bin/codex-code-mode-host'))).toBe(false)
    // 볼트는 어떤 경로에서도 삭제 대상이 아니다
    expect(existsSync(vault)).toBe(true)

    const check = run(['--check'])
    expect(check.status).toBe(0)
    expect(check.stdout).toContain('잔여물 없음')
  })

  it('바이너리 마커만 있으면 CLI 는 지우고 설정(~/.claude · ~/.codex)은 남긴다', () => {
    plantAll()
    marker('claude')
    marker('codex')

    expect(run(['--yes']).status).toBe(0)
    expect(existsSync(join(home, '.local/bin/claude'))).toBe(false)
    expect(existsSync(join(home, '.local/share/claude'))).toBe(false)
    expect(existsSync(join(home, '.claude/settings.json'))).toBe(true)
    expect(existsSync(join(home, '.claude.json'))).toBe(true)
    // Codex 는 실체가 ~/.codex 안에 있다 — 그 폴더만 비우고 설정은 남긴다
    expect(existsSync(join(home, '.codex/packages/standalone'))).toBe(false)
    expect(existsSync(join(home, '.codex/config.toml'))).toBe(true)
    expect(existsSync(join(home, '.local/bin/codex'))).toBe(false)
  })

  it('마커가 없으면 앱과 앱 데이터만 지우고 CLI·설정은 전부 남긴다', () => {
    plantAll()
    // 끊긴 설치의 기록은 마커가 아니다
    marker('claude.pending')
    marker('claude.config.pending')

    expect(run(['--yes']).status).toBe(0)
    expect(existsSync(app)).toBe(false)
    expect(existsSync(userData)).toBe(false)
    for (const path of [
      '.local/bin/claude',
      '.local/share/claude',
      '.claude',
      '.claude.json',
      '.codex/packages/standalone',
      '.local/bin/codex'
    ]) {
      expect(existsSync(join(home, path)), path).toBe(true)
    }
    // 남은 CLI 는 --check 에 잔여물로 보인다 — 마커와 무관하게 목록 전체를 본다
    const check = run(['--check'])
    expect(check.status).toBeGreaterThan(0)
    expect(check.stdout).toContain(join(home, '.claude'))
  })

  // dmg 를 버린 사용자는 번들 안(Contents/Resources)의 사본을 돌린다 — 그 번들이 곧 지울 앱이다
  it('앱 번들 안에서 돌면 $TMPDIR 로 옮겨 그 번들을 지우고 사본은 남기지 않는다', () => {
    const bundled = join(root, 'Elsewhere', '2nd-brain.app')
    bundle(bundled)
    const script = join(bundled, 'Contents', 'Resources', 'Uninstall 2nd-brain.command')
    mkdirSync(join(script, '..'), { recursive: true })
    copyFileSync(SCRIPT, script)
    bundle(app)

    const result = spawnSync('bash', [script, '--yes'], {
      env: { PATH: '/usr/bin:/bin', TMPDIR: root, HOME: home, SECOND_BRAIN_APPLICATIONS_DIR: apps },
      encoding: 'utf8'
    })
    expect(result.status, String(result.stderr)).toBe(0)
    expect(existsSync(bundled)).toBe(false)
    // /Applications 쪽은 이 번들이 아니다
    expect(existsSync(app)).toBe(true)
    expect(readdirSync(root).filter((name) => name.startsWith('uninstall-2nd-brain.'))).toEqual([])
  })

  it('--check 는 아무것도 지우지 않는다 — 자기 자신도', () => {
    plantAll()
    const script = join(root, 'copy.command')
    copyFileSync(SCRIPT, script)
    const result = spawnSync('bash', [script, '--check'], {
      env: { PATH: '/usr/bin:/bin', TMPDIR: root, HOME: home, SECOND_BRAIN_APPLICATIONS_DIR: apps },
      encoding: 'utf8'
    })
    expect(result.status).toBeGreaterThan(0)
    expect(existsSync(script)).toBe(true)
    expect(existsSync(app)).toBe(true)
    // 재배치 신호는 인자가 아니다 — 넘기면 모르는 인자
    expect(run(['--relocated', '--check']).status).toBe(64)
  })

  // 앱 경로는 환경(UNINSTALL_ORIGIN·SECOND_BRAIN_APPLICATIONS_DIR)에서 온다 — 다른 앱을 가리키면 지우지 않는다
  it('가리킨 번들이 이 앱이 아니면(다른 CFBundleIdentifier) 아무것도 지우지 않고 exit 2 다', () => {
    plantAll()
    const victim = join(root, 'Victim.app')
    bundle(victim, 'com.example.victim')
    const origin = join(victim, 'Contents', 'Resources', 'x.command')
    const result = run(['--yes'], { UNINSTALL_ORIGIN: origin })
    expect(result.status).toBe(66)
    expect(result.stderr).toContain('com.example.victim')
    expect(existsSync(victim)).toBe(true)
    expect(existsSync(userData)).toBe(true)
    // Info.plist 가 없는 폴더도 이 앱이 아니다
    rmSync(join(app, 'Contents', 'Info.plist'))
    expect(run(['--yes']).status).toBe(66)
    expect(existsSync(userData)).toBe(true)
  })

  it('--check 와 --yes 를 같이 주면 거절한다', () => {
    plantAll()
    expect(run(['--check', '--yes']).status).toBe(64)
    expect(run(['--yes', '--check']).status).toBe(64)
    expect(existsSync(app)).toBe(true)
  })

  it('HOME 이 비었거나 / 면 아무것도 지우지 않고 exit≠0 이다', () => {
    plantAll()
    for (const bad of ['', '/']) {
      const result = run(['--yes'], { HOME: bad })
      // --check 의 exit code(잔여물 개수)와 겹치지 않는 값
      expect(result.status).toBe(65)
      expect(result.stderr).toContain('HOME')
      expect(existsSync(app)).toBe(true)
    }
  })

  it('터미널 없이 확인을 받을 수 없으면 --yes 를 안내하고 지우지 않는다', () => {
    plantAll()
    const result = run([])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--yes')
    expect(existsSync(app)).toBe(true)
  })
})
