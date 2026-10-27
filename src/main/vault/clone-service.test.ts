import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cloneFailureMessage, cloneVault, repoFolderName } from './clone-service'
import { createVault } from './vault-service'
import { pushVault, setRemote } from './remote-service'

// 팀 저장소를 흉내낸다 — 볼트 하나를 만들어 bare repo 로 올린다
const teamRepo = async (root: string): Promise<string> => {
  const source = join(root, 'source')
  const bare = join(root, 'team.git')
  mkdirSync(source)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  expect(createVault(source).ok).toBe(true)
  setRemote(source, bare)
  expect((await pushVault(source)).ok).toBe(true)
  return bare
}

describe('cloneVault', () => {
  it('팀 저장소를 받아 바로 열 수 있는 보관함으로 만든다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'clone-'))
    try {
      const bare = await teamRepo(root)
      const into = join(root, 'into')
      mkdirSync(into)

      const result = await cloneVault(bare, into)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.dir).toBe(join(into, 'team'))
      expect(existsSync(join(result.dir, 'wiki', 'INDEX.md'))).toBe(true)
      // 받아 온 보관함은 팀 저장소를 origin 으로 갖는다 — 올리기가 바로 된다
      expect(
        execFileSync('git', ['remote', 'get-url', 'origin'], {
          cwd: result.dir,
          encoding: 'utf8'
        }).trim()
      ).toBe(bare)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('없는 저장소는 잠시 뒤 다시 받을 만한 실패(missing)로 돌려준다 — 막 만든 저장소가 아직 안 보일 수 있다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'clone-missing-'))
    try {
      const into = join(root, 'into')
      mkdirSync(into)

      const result = await cloneVault(join(root, 'nowhere.git'), into)
      expect(result).toEqual({ ok: false, reason: expect.any(String), kind: 'missing' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('같은 이름 폴더가 이미 있으면 받지 않고 그 사실을 말한다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'clone-exists-'))
    try {
      const bare = await teamRepo(root)
      const into = join(root, 'into')
      mkdirSync(join(into, 'team'), { recursive: true })
      writeFileSync(join(into, 'team', 'keep.txt'), 'mine')

      const result = await cloneVault(bare, into)
      expect(result).toEqual({ ok: false, reason: expect.stringContaining('이미') })
      // 남의 파일을 지우지 않는다
      expect(existsSync(join(into, 'team', 'keep.txt'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('보관함이 아닌 저장소는 받은 폴더를 남기지 않고 거절한다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'clone-not-vault-'))
    try {
      const source = join(root, 'plain')
      const bare = join(root, 'plain.git')
      mkdirSync(source)
      execFileSync('git', ['init', '-q', '-b', 'main', source])
      writeFileSync(join(source, 'readme.txt'), 'not a vault')
      execFileSync('git', ['add', '-A'], { cwd: source })
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x'], {
        cwd: source
      })
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
      execFileSync('git', ['push', '-q', bare, 'main'], { cwd: source })
      const into = join(root, 'into')
      mkdirSync(into)

      const result = await cloneVault(bare, into)
      expect(result).toEqual({
        ok: false,
        reason: expect.stringContaining('보관함'),
        kind: 'not-vault'
      })
      expect(existsSync(join(into, 'plain'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('없는 저장소는 사용자가 할 일로 말한다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'clone-missing-'))
    try {
      mkdirSync(join(root, 'into'))
      const result = await cloneVault(join(root, 'no-such.git'), join(root, 'into'))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toContain('주소')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('repoFolderName', () => {
  it.each([
    ['https://github.com/team/vault.git', 'vault'],
    ['https://github.com/team/my-vault', 'my-vault'],
    // 고른 폴더 자신·그 부모를 가리키는 이름은 폴더 이름이 아니다 — 실패 정리가 남의 폴더를 지운다
    ['https://github.com/team/..git', null],
    ['https://github.com/team/.git', null],
    ['https://github.com/team/va ult', null]
  ])('%s → %s', (url, name) => {
    expect(repoFolderName(url)).toBe(name)
  })

  it('폴더 이름으로 쓸 수 없는 주소는 받지 않고 고른 폴더를 그대로 둔다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'clone-name-'))
    try {
      const into = join(root, 'into')
      mkdirSync(into)
      writeFileSync(join(into, 'keep.txt'), 'mine')
      const result = await cloneVault('https://github.com/team/..git', into)
      expect(result).toEqual({ ok: false, reason: expect.stringContaining('주소') })
      expect(existsSync(join(into, 'keep.txt'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('cloneFailureMessage', () => {
  it('로그인이 있는데 거절되면 다시 로그인하라고 말한다', () => {
    const text = cloneFailureMessage({
      ok: false,
      code: 128,
      stderr: 'fatal: Authentication failed for x',
      failure: 'exit'
    })
    expect(text).toContain('로그아웃한 뒤 다시 로그인')
  })

  it('로그인하지 않아 띄우지 않은 받기는 로그인부터 하라고 말한다', () => {
    const text = cloneFailureMessage({ ok: false, code: null, stderr: '', failure: 'login' })
    expect(text).toContain('GitHub 로그인이 필요해요')
    expect(text).not.toContain('창')
  })

  it.each([
    ['fatal: could not read Username for https://github.com: terminal prompts disabled', '로그인'],
    ['remote: Repository not found.\nfatal: repository not found', '주소'],
    ['fatal: unable to access: Could not resolve host: github.com', '인터넷'],
    ['remote: Permission denied', '주소']
  ])('%s', (stderr, phrase) => {
    expect(cloneFailureMessage({ ok: false, code: 128, stderr, failure: 'exit' })).toContain(phrase)
  })
})
