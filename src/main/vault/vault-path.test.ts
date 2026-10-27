import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openableInVault, resolveInVault } from './vault-path'

let vault: string

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'vault-path-'))
  mkdirSync(join(vault, 'wiki'))
  mkdirSync(join(vault, '.git'))
  writeFileSync(join(vault, 'wiki', '한글-페이지.md'), '# 한글')
  writeFileSync(join(vault, '.git', 'config'), '[core]')
  // 볼트 밖 대상
  const outside = mkdtempSync(join(tmpdir(), 'vault-out-'))
  writeFileSync(join(outside, 'secret.md'), 'secret')
  symlinkSync(join(outside, 'secret.md'), join(vault, 'wiki', 'evil.md'))
  ;(globalThis as Record<string, unknown>).__outside = outside
})

afterAll(() => {
  rmSync(vault, { recursive: true, force: true })
  rmSync(String((globalThis as Record<string, unknown>).__outside), {
    recursive: true,
    force: true
  })
})

describe('resolveInVault', () => {
  it('정상 한글 경로 허용', () => {
    const r = resolveInVault(vault, 'wiki/한글-페이지.md')
    expect(r).toBe(join(vault, 'wiki', '한글-페이지.md'))
  })

  it('`../x` 거절', () => {
    expect(resolveInVault(vault, '../x')).toBeNull()
  })

  it('절대경로 `/etc/passwd` 거절', () => {
    expect(resolveInVault(vault, '/etc/passwd')).toBeNull()
  })

  it('볼트 밖 심볼릭 링크 거절', () => {
    expect(resolveInVault(vault, 'wiki/evil.md')).toBeNull()
  })

  it('`wiki/../.git/config` 거절', () => {
    expect(resolveInVault(vault, 'wiki/../.git/config')).toBeNull()
  })

  it('`.GIT/config` 거절 (대소문자 무시)', () => {
    expect(resolveInVault(vault, '.GIT/config')).toBeNull()
  })

  it('`wiki\\..\\x` Windows 구분자 거절', () => {
    expect(resolveInVault(vault, 'wiki\\..\\x')).toBeNull()
  })

  it('존재하지 않는 파일도 볼트 안이면 허용 (부모 realpath + basename)', () => {
    const r = resolveInVault(vault, 'wiki/없는-페이지.md')
    expect(r).toBe(join(vault, 'wiki', '없는-페이지.md'))
  })

  it('`.git` 을 가리키는 볼트 안 심볼릭 링크 경유 거절', () => {
    symlinkSync(join(vault, '.git'), join(vault, 'wiki', 'g'))
    expect(resolveInVault(vault, 'wiki/g/config')).toBeNull()
  })

  it('두 단계 이상 없는 경로도 볼트 안이면 허용 (가장 가까운 조상)', () => {
    expect(resolveInVault(vault, 'wiki/a/b/c.md')).toBe(join(vault, 'wiki', 'a', 'b', 'c.md'))
  })
})

describe('openableInVault', () => {
  it('html·워드는 열고, 이름만 .docx 인 링크가 실행 파일을 가리키면 열지 않는다', () => {
    writeFileSync(join(vault, 'wiki', '보고.docx'), 'docx')
    writeFileSync(join(vault, 'wiki', 'run.command'), 'echo hi')
    symlinkSync(join(vault, 'wiki', 'run.command'), join(vault, 'wiki', '가짜.docx'))
    const kinds = ['html', 'office'] as const
    expect(openableInVault(vault, 'wiki/보고.docx', kinds)).toBe(join(vault, 'wiki', '보고.docx'))
    expect(openableInVault(vault, 'wiki/가짜.docx', kinds)).toBeNull()
    expect(openableInVault(vault, 'wiki/run.command', kinds)).toBeNull()
    expect(openableInVault(vault, 'wiki/없음.docx', kinds)).toBeNull()
  })
})
