import { describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getClaudeAuthStatus, logoutClaude, resolveClaudeCli } from './claude-cli'
import { cliCandidates } from './resolve-cli'
import { loadSettings, saveSettings } from '../settings'

const fixture = (name: string): string => join('test/fixtures/fake-claude', name, 'claude')

describe('resolveClaudeCli', () => {
  it('CLAUDE_CLI_PATH 설정값을 최우선으로 채택한다', async () => {
    const result = await resolveClaudeCli({ CLAUDE_CLI_PATH: fixture('ok') })
    expect(result).toMatchObject({ path: fixture('ok'), version: '2.1.0 (Claude Code)' })
  })

  it('--version 실패 바이너리는 기각하고 알려진 경로로 폴백한다', async () => {
    const result = await resolveClaudeCli({
      CLAUDE_CLI_PATH: fixture('broken'),
      HOME: '/nonexistent',
      PATH: '/nonexistent'
    })
    // broken 설정값은 기각 — 나머지 후보도 전부 실패하므로 missing
    expect(result).toEqual({ missing: true, reason: expect.any(String) })
  })

  it('환경에 후보가 없으면 missing이다', async () => {
    const result = await resolveClaudeCli({ PATH: '/nonexistent', HOME: '/nonexistent' })
    expect('missing' in result && result.missing).toBe(true)
  })
})

describe('logoutClaude', () => {
  it('끝날 때까지 기다린다 — 끊긴 뒤의 상태를 그 자리에서 보여 줘야 한다', async () => {
    await expect(logoutClaude(fixture('logged-in'))).resolves.toBeUndefined()
  })

  it('실패하면 사유를 들고 던진다 — 조용히 성공으로 보이면 사용자는 끊긴 줄 안다', async () => {
    await expect(logoutClaude(fixture('broken'))).rejects.toThrow()
  })
})

describe('getClaudeAuthStatus', () => {
  it('로그인 상태를 파싱한다', async () => {
    const status = await getClaudeAuthStatus(fixture('logged-in'))
    expect(status).toEqual({ loggedIn: true, email: 'user@example.com', authMethod: 'claude.ai' })
  })

  it('미로그인을 파싱한다', async () => {
    const status = await getClaudeAuthStatus(fixture('logged-out'))
    expect(status.loggedIn).toBe(false)
  })

  it('비정상 출력은 에러로 본다', async () => {
    await expect(getClaudeAuthStatus(fixture('broken'))).rejects.toThrow()
  })
})

describe('settings', () => {
  it('저장한 값을 그대로 읽는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-'))
    try {
      saveSettings(dir, { claudePath: '/usr/local/bin/claude', vaultDir: '/vaults/mine' })
      expect(loadSettings(dir)).toEqual({
        claudePath: '/usr/local/bin/claude',
        vaultDir: '/vaults/mine'
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('파일이 없으면 기본값이다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-'))
    try {
      expect(loadSettings(dir)).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('깨진 JSON은 기본값으로 보고 원본을 격리한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-'))
    try {
      writeFileSync(join(dir, 'settings.json'), '{broken')
      expect(loadSettings(dir)).toEqual({})
      const rest = readdirSync(dir)
      expect(rest).not.toContain('settings.json')
      expect(rest.some((f) => f.startsWith('settings.json.corrupt-'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('shape 오류 JSON도 기본값으로 보고 격리한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-'))
    try {
      writeFileSync(join(dir, 'settings.json'), '[1,2]')
      expect(loadSettings(dir)).toEqual({})
      expect(readdirSync(dir).some((f) => f.startsWith('settings.json.corrupt-'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('격리 실패해도 throw 없이 기본값이다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-'))
    try {
      writeFileSync(join(dir, 'settings.json'), '{broken')
      chmodSync(dir, 0o555)
      expect(loadSettings(dir)).toEqual({})
      // root든 아니든 일관성: 원본 남아있음 XOR 격리됨 (둘 다 깨짐·둘 다 존재 불가)
      const rest = readdirSync(dir)
      const kept = rest.includes('settings.json')
      const quarantined = rest.some((f) => f.startsWith('settings.json.corrupt-'))
      expect(kept !== quarantined).toBe(true)
    } finally {
      chmodSync(dir, 0o755)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('격리 후 저장하면 새 파일이 기록되고 격리본은 유지된다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-'))
    try {
      writeFileSync(join(dir, 'settings.json'), '{broken')
      expect(loadSettings(dir)).toEqual({})
      saveSettings(dir, { vaultDir: '/vaults/mine' })
      expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))).toEqual({
        vaultDir: '/vaults/mine'
      })
      expect(readdirSync(dir).some((f) => f.startsWith('settings.json.corrupt-'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('저장 후 파일이 존재한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-'))
    try {
      saveSettings(dir, {})
      expect(readFileSync(join(dir, 'settings.json'), 'utf8')).toContain('{')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cliCandidates', () => {
  it('Windows 는 ; 구분 PATH 에 PATHEXT 확장자를 붙이고 공식 설치기·npm 전역 경로를 본다', () => {
    const candidates = cliCandidates(
      'claude',
      undefined,
      {
        Path: 'C:\\Tools;C:\\nodejs',
        PATHEXT: '.EXE;.CMD',
        USERPROFILE: 'C:\\Users\\kim',
        APPDATA: 'C:\\Users\\kim\\AppData\\Roaming'
      },
      'win32'
    )
    expect(candidates).toEqual([
      'C:\\Tools\\claude.exe',
      'C:\\Tools\\claude.cmd',
      'C:\\nodejs\\claude.exe',
      'C:\\nodejs\\claude.cmd',
      'C:\\Users\\kim\\.local\\bin\\claude.exe',
      'C:\\Users\\kim\\AppData\\Roaming\\npm\\claude.cmd'
    ])
  })

  // 설치기가 PATH 를 고쳐도 이미 떠 있는 앱은 옛 PATH 를 쓴다 — 설치 위치를 직접 봐야 재시작 없이 찾는다
  it('Windows Codex 는 설치 스크립트가 까는 곳도 본다', () => {
    const candidates = cliCandidates(
      'codex',
      undefined,
      {
        Path: 'C:\\Tools',
        PATHEXT: '.EXE',
        USERPROFILE: 'C:\\Users\\kim',
        LOCALAPPDATA: 'C:\\Users\\kim\\AppData\\Local'
      },
      'win32'
    )
    expect(candidates).toEqual([
      'C:\\Tools\\codex.exe',
      'C:\\Users\\kim\\.local\\bin\\codex.exe',
      'C:\\Users\\kim\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe'
    ])
  })

  it('Claude 에는 Codex 전용 경로를 붙이지 않는다', () => {
    const candidates = cliCandidates(
      'claude',
      undefined,
      { Path: '', PATHEXT: '.EXE', LOCALAPPDATA: 'C:\\Users\\kim\\AppData\\Local' },
      'win32'
    )
    expect(candidates).toEqual([])
  })

  it('macOS·Linux 는 : 구분 PATH 와 Dock 이 못 보는 설치 경로를 본다', () => {
    const candidates = cliCandidates(
      'codex',
      '/custom/codex',
      { PATH: '/usr/bin:/bin', HOME: '/Users/kim' },
      'darwin'
    )
    expect(candidates).toEqual([
      '/custom/codex',
      '/usr/bin/codex',
      '/bin/codex',
      '/Users/kim/.local/bin/codex',
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex'
    ])
  })
})
