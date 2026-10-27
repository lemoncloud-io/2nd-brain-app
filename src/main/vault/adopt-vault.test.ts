import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { adoptableNotes, adoptPreview, adoptVault } from './adopt-vault'
import { openVault } from './vault-service'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

/** Obsidian 보관함 모양 — 노트·하위 폴더·양식·설정·첨부 */
const obsidianVault = (): { root: string; dir: string } => {
  const root = mkdtempSync(join(tmpdir(), 'adopt-'))
  const dir = join(root, 'notes')
  mkdirSync(join(dir, '.obsidian'), { recursive: true })
  mkdirSync(join(dir, 'projects', 'alpha'), { recursive: true })
  mkdirSync(join(dir, 'templates'))
  mkdirSync(join(dir, 'attachments'))
  writeFileSync(join(dir, '.obsidian', 'app.json'), '{"x":1}\n')
  writeFileSync(join(dir, 'Home.md'), '# 홈\n\n[[plan]]\n')
  writeFileSync(join(dir, 'projects', 'alpha', 'plan.md'), '---\ntags: [a]\n---\n# 계획\n')
  writeFileSync(join(dir, 'projects', 'Home.md'), '# 다른 홈\n')
  writeFileSync(join(dir, 'templates', 'daily.md'), '# {{date}}\n')
  writeFileSync(join(dir, 'attachments', 'pic.png'), Buffer.from([1, 2, 3]))
  return { root, dir }
}

/** 폴더 안 모든 파일의 해시 — `.git` 은 뺀다 */
const snapshot = (dir: string): Map<string, string> => {
  const out = new Map<string, string>()
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      if (name === '.git') continue
      const full = join(at, name)
      if (statSync(full).isDirectory()) walk(full)
      else out.set(relative(dir, full), createHash('sha1').update(readFileSync(full)).digest('hex'))
    }
  }
  walk(dir)
  return out
}

describe('adoptVault', () => {
  it('있던 파일은 그대로 두고 뼈대를 더하며, 노트 사본을 대기함에 넣고 git 을 시작한다', () => {
    const { root, dir } = obsidianVault()
    try {
      const before = snapshot(dir)
      expect(adoptableNotes(dir)).toEqual(['Home.md', 'projects/Home.md', 'projects/alpha/plan.md'])
      const result = adoptVault(dir)
      expect(result).toEqual({ ok: true, queued: 3, kept: [] })

      const after = snapshot(dir)
      for (const [rel, hash] of before) expect(after.get(rel), rel).toBe(hash)
      expect(openVault(dir).ok).toBe(true)
      expect(readdirSync(join(dir, 'Clippings')).sort()).toEqual([
        '.gitkeep',
        'Home-1.md',
        'Home.md',
        'plan.md'
      ])
      expect(readFileSync(join(dir, 'Clippings', 'plan.md'), 'utf8')).toBe(
        '---\ntags: [a]\n---\n# 계획\n'
      )
      expect(git(dir, 'log', '--format=%s')).toBe('chore: adopt vault')
      expect(git(dir, 'status', '--porcelain')).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('뼈대와 이름이 같은 파일은 그 사람 것을 두고, .gitignore 는 빠진 줄만 덧붙인다', () => {
    const { root, dir } = obsidianVault()
    try {
      mkdirSync(join(dir, 'wiki'))
      writeFileSync(join(dir, 'wiki', 'INDEX.md'), '# 내 목차\n')
      writeFileSync(join(dir, '.gitignore'), '.DS_Store\nsecret/\n')
      const result = adoptVault(dir)
      expect(result).toMatchObject({ ok: true, kept: ['wiki/INDEX.md'] })
      expect(readFileSync(join(dir, 'wiki', 'INDEX.md'), 'utf8')).toBe('# 내 목차\n')
      const ignore = readFileSync(join(dir, '.gitignore'), 'utf8')
      expect(ignore.startsWith('.DS_Store\nsecret/\n')).toBe(true)
      expect(ignore.match(/\.DS_Store/g)).toHaveLength(1)
      expect(ignore).toContain('.obsidian/workspace*.json')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('purpose.md가 없으면 기본값으로 만들고, 있으면 그대로 둔다', () => {
    const first = obsidianVault()
    try {
      expect(adoptVault(first.dir)).toMatchObject({ ok: true })
      expect(existsSync(join(first.dir, 'purpose.md'))).toBe(true)
    } finally {
      rmSync(first.root, { recursive: true, force: true })
    }
    const second = obsidianVault()
    try {
      writeFileSync(join(second.dir, 'purpose.md'), '내 방향\n')
      expect(adoptVault(second.dir)).toMatchObject({ ok: true })
      expect(readFileSync(join(second.dir, 'purpose.md'), 'utf8')).toBe('내 방향\n')
    } finally {
      rmSync(second.root, { recursive: true, force: true })
    }
  })

  it('이미 git 을 쓰는 폴더는 그 기록 위에 앱이 더한 것만 담는다 — 스테이지해 둔 변경은 섞지 않는다', () => {
    const { root, dir } = obsidianVault()
    try {
      git(dir, 'init', '-q', '-b', 'trunk')
      git(dir, 'add', '-A')
      git(dir, '-c', 'user.name=me', '-c', 'user.email=me@x', 'commit', '-qm', 'my notes')
      writeFileSync(join(dir, 'Home.md'), '# 홈\n\n고치는 중\n')
      git(dir, 'add', 'Home.md')

      expect(adoptVault(dir)).toMatchObject({ ok: true, queued: 3 })
      expect(git(dir, 'branch', '--show-current')).toBe('trunk')
      expect(git(dir, 'log', '--format=%s').split('\n')).toEqual(['chore: adopt vault', 'my notes'])
      expect(git(dir, 'show', '--name-only', '--format=', 'HEAD').split('\n')).not.toContain(
        'Home.md'
      )
      expect(git(dir, 'diff', '--cached', '--name-only')).toBe('Home.md')
      // 그 사람의 git 설정(이름)은 건드리지 않는다 — 값이 없으면 git 은 1 로 끝난다
      expect(() => git(dir, 'config', '--local', '--get', 'user.name')).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('adoptPreview — 더해질 뼈대 파일과 그대로 둘 파일, 노트 수를 쓰기 없이 돌려준다', () => {
    const { root, dir } = obsidianVault()
    try {
      writeFileSync(join(dir, 'templates', 'wiki-concept.md'), '# 내 양식\n')
      const before = snapshot(dir)
      const preview = adoptPreview(dir)!
      expect(preview.notes).toBe(3)
      expect(preview.add).toContain('VAULT_RULES.md')
      expect(preview.add).not.toContain('templates/wiki-concept.md')
      expect(preview.kept).toContain('templates/wiki-concept.md')
      expect(snapshot(dir)).toEqual(before)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('이미 보관함이면 거절하고, 실패하면 더한 것을 지운다', () => {
    const { root, dir } = obsidianVault()
    try {
      expect(adoptVault(dir, join(root, 'no-skeleton')).ok).toBe(false)
      // 뼈대·사본을 다 쓴 뒤 git 에서 실패한다 — 더한 파일·폴더를 지워 처음 모습으로 돌린다
      writeFileSync(join(dir, '.git'), 'gitdir: /nowhere\n')
      const before = snapshot(dir)
      const dirs = readdirSync(dir).sort()
      expect(adoptVault(dir)).toMatchObject({ ok: false })
      expect(snapshot(dir)).toEqual(before)
      expect(readdirSync(dir).sort()).toEqual(dirs)

      rmSync(join(dir, '.git'))
      expect(adoptVault(dir).ok).toBe(true)
      expect(adoptVault(dir)).toEqual({
        ok: false,
        reason: '이미 자료 보관함이에요. 그대로 열어 주세요'
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
