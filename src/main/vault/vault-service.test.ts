import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync as exists,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  NEW_VAULT_NAME,
  VAULT_SKELETON,
  createVault,
  isFullVault,
  newVaultDir,
  openVault,
  requireFullVault,
  vaultKindOf
} from './vault-service'
import { VAULT_TEMPLATES } from './vault-templates'
import { verifyVault } from '../verify/vault-verify'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'vault-'))
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' })

describe('newVaultDir', () => {
  it('빈 폴더는 그대로, 아니면 안에 2nd-brain 폴더를 만들고 이미 차 있으면 번호를 붙인다', () => {
    const dir = tmp()
    try {
      expect(newVaultDir(dir)).toBe(dir)
      writeFileSync(join(dir, 'report.pdf'), '')
      const first = newVaultDir(dir)
      expect(first).toBe(join(dir, NEW_VAULT_NAME))
      expect(readdirSync(first)).toEqual([])
      expect(newVaultDir(dir)).toBe(first)
      writeFileSync(join(first, 'x'), '')
      expect(newVaultDir(dir)).toBe(join(dir, `${NEW_VAULT_NAME}-2`))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // 첫 실행은 문서 폴더에 고르지 않고 만든다 — 문서 폴더가 비어 있다고 그 폴더 자체를 보관함으로 삼으면 안 된다
  it('inside 면 빈 폴더여도 안에 2nd-brain 폴더를 만든다', () => {
    const dir = tmp()
    try {
      expect(newVaultDir(dir, { inside: true })).toBe(join(dir, NEW_VAULT_NAME))
      expect(readdirSync(dir)).toEqual([NEW_VAULT_NAME])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('createVault', () => {
  it('뼈대에 .gitkeep 이 빠져도(electron-builder 가 패키징에서 제외) 빈 필수 폴더를 만들어 커밋한다', () => {
    const dir = tmp()
    const skeleton = tmp()
    try {
      cpSync(VAULT_SKELETON, skeleton, {
        recursive: true,
        filter: (src) => !src.endsWith('.gitkeep')
      })
      for (const empty of ['raw', 'Clippings', 'outputs', 'wiki/topics']) {
        rmSync(join(skeleton, empty), { recursive: true, force: true })
      }

      expect(createVault(dir, { skeleton })).toEqual({ ok: true })

      expect(openVault(dir)).toEqual({ ok: true, kind: 'full' })
      const tracked = git(dir, 'ls-files').split('\n')
      for (const keep of [
        'raw/.gitkeep',
        'Clippings/.gitkeep',
        'outputs/runs/.gitkeep',
        'wiki/topics/.gitkeep'
      ]) {
        expect(tracked, keep).toContain(keep)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(skeleton, { recursive: true, force: true })
    }
  })

  it('git 을 실행하지 못하면 복사한 뼈대를 치워 같은 폴더로 다시 만들 수 있다', () => {
    const dir = tmp()
    const saved = { PATH: process.env.PATH, LOCAL_GIT_DIRECTORY: process.env.LOCAL_GIT_DIRECTORY }
    const restore = (): void => {
      process.env.PATH = saved.PATH
      if (saved.LOCAL_GIT_DIRECTORY === undefined) delete process.env.LOCAL_GIT_DIRECTORY
      else process.env.LOCAL_GIT_DIRECTORY = saved.LOCAL_GIT_DIRECTORY
    }
    try {
      // 번들 git 도 시스템 git 도 없는 PC
      process.env.LOCAL_GIT_DIRECTORY = '/nonexistent-git'
      process.env.PATH = '/nonexistent'
      const result = createVault(dir)
      restore()

      expect(result).toEqual({ ok: false, reason: expect.stringContaining('비워 두었어요') })
      expect(readdirSync(dir)).toEqual([])
      expect(createVault(dir)).toEqual({ ok: true })
    } finally {
      restore()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('빈 폴더에 뼈대를 복사하고 main 브랜치 첫 커밋을 만든다', () => {
    const dir = tmp()
    try {
      const result = createVault(dir)
      expect(result.ok).toBe(true)
      for (const entry of ['VAULT_RULES.md', 'wiki/INDEX.md', 'raw', 'Clippings', 'templates']) {
        expect(exists(join(dir, entry)), entry).toBe(true)
      }
      expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main')
      expect(git(dir, 'rev-list', '--count', 'HEAD').trim()).toBe('1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('빈 폴더가 아니면 거절한다', () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, 'something.txt'), 'x')
      expect(createVault(dir).ok).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('이미 git 레포면 거절한다', () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, '.gitkeep'), '')
      git(dir, 'init')
      expect(createVault(dir).ok).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('git user 미설정 환경에서 로컬 기본값으로 커밋한다', () => {
    const dir = tmp()
    try {
      const result = createVault(dir, { env: { HOME: '/nonexistent' } })
      expect(result.ok).toBe(true)
      expect(git(dir, 'config', 'user.name')).toContain('2nd-brain')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('createVault 템플릿 — 슬라이스 05', () => {
  const SEEDS: Record<string, string[]> = {
    research: ['research-questions', 'methods', 'findings'],
    reading: ['books', 'themes', 'quotes'],
    work: ['projects', 'meetings', 'decisions']
  }

  it('템플릿 목록은 research·reading·work 세 개이고 각자 이름·설명이 있다', () => {
    expect(VAULT_TEMPLATES.map((t) => t.id)).toEqual(['research', 'reading', 'work'])
    for (const t of VAULT_TEMPLATES) {
      expect(t.name.length, t.id).toBeGreaterThan(0)
      expect(t.description.length, t.id).toBeGreaterThan(0)
    }
  })

  it.each(Object.entries(SEEDS))(
    '%s 템플릿은 루트 토픽 시드 페이지를 만들고 INDEX·TOPIC_MAP 에 링크해 첫 커밋 하나에 담는다',
    (template, slugs) => {
      const dir = tmp()
      try {
        expect(createVault(dir, { template })).toEqual({ ok: true })
        const index = readFileSync(join(dir, 'wiki', 'INDEX.md'), 'utf8')
        const topicMap = readFileSync(join(dir, 'wiki', 'TOPIC_MAP.md'), 'utf8')
        for (const slug of slugs) {
          const page = readFileSync(join(dir, 'wiki', 'topics', `${slug}.md`), 'utf8')
          expect(page, slug).toMatch(/^---\ntype: topic\n/)
          expect(index, slug).toContain(`[[topics/${slug}]]`)
          expect(topicMap, slug).toContain(`[[topics/${slug}]]`)
        }
        expect(index).not.toContain('_No topics yet._')
        expect(git(dir, 'rev-list', '--count', 'HEAD').trim()).toBe('1')
        expect(git(dir, 'status', '--porcelain').trim()).toBe('')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it.each(Object.keys(SEEDS))(
    '%s 템플릿 볼트는 vault_verify(--lane none)를 통과한다',
    (template) => {
      const dir = tmp()
      try {
        expect(createVault(dir, { template })).toEqual({ ok: true })
        expect(verifyVault({ vaultDir: dir, base: 'main', lane: 'none' })).toEqual({
          status: 'pass'
        })
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it('템플릿 없이 만들면 뼈대 그대로다 (시드 없음)', () => {
    const dir = tmp()
    try {
      expect(createVault(dir)).toEqual({ ok: true })
      expect(readFileSync(join(dir, 'wiki', 'INDEX.md'), 'utf8')).toContain('_No topics yet._')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('뼈대에 토픽 자리표시가 없으면 템플릿 생성을 쓰기 전에 거절한다 (폴더는 비어 있다)', () => {
    const dir = tmp()
    const skeleton = tmp()
    try {
      cpSync(VAULT_SKELETON, skeleton, { recursive: true })
      writeFileSync(
        join(skeleton, 'wiki', 'INDEX.md'),
        '# Wiki Index\n\n## Topics\n\n- 이미 채움\n'
      )
      const result = createVault(dir, { skeleton, template: 'research' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('자리표시')
      expect(readdirSync(dir)).toEqual([])
      // 같은 폴더로 템플릿 없이 다시 만들 수 있다 — 반쯤 쓰인 흔적이 없다
      expect(createVault(dir, { skeleton })).toEqual({ ok: true })
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(skeleton, { recursive: true, force: true })
    }
  })

  it('모르는 템플릿 id 는 아무것도 쓰지 않고 거절한다', () => {
    const dir = tmp()
    try {
      const result = createVault(dir, { template: 'nope' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('템플릿')
      expect(readdirSync(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('openVault', () => {
  it('createVault 산출물을 열면 ok다', () => {
    const dir = tmp()
    try {
      createVault(dir)
      expect(openVault(dir)).toEqual({ ok: true, kind: 'full' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('뼈대가 없는 일반 폴더(Obsidian任意)는 generic으로 열고 아무것도 쓰지 않는다', () => {
    const dir = tmp()
    try {
      writeFileSync(join(dir, 'Home.md'), '# home\n')
      writeFileSync(join(dir, 'VAULT_RULES.md'), 'x')
      const before = readdirSync(dir).sort()
      const result = openVault(dir)
      expect(result).toEqual({ ok: true, kind: 'generic' })
      expect(readdirSync(dir).sort()).toEqual(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('빈 폴더도 generic으로 열린다', () => {
    const dir = tmp()
    try {
      expect(openVault(dir)).toEqual({ ok: true, kind: 'generic' })
      expect(readdirSync(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('없는 경로·파일은 거절한다', () => {
    const dir = tmp()
    try {
      expect(openVault(join(dir, 'nope')).ok).toBe(false)
      const file = join(dir, 'f.txt')
      writeFileSync(file, 'x')
      expect(openVault(file).ok).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('requireFullVault — full은 null, generic은 사유 문구, kind 없으면 full 취급', () => {
    const full = tmp()
    const generic = tmp()
    try {
      createVault(full)
      writeFileSync(join(generic, 'a.md'), 'x')
      expect(requireFullVault(full)).toBeNull()
      expect(requireFullVault(generic)).toContain('읽기 중심')
      expect(isFullVault({ ok: true })).toBe(true)
      expect(isFullVault({ ok: true, kind: 'generic' })).toBe(false)
    } finally {
      rmSync(full, { recursive: true, force: true })
      rmSync(generic, { recursive: true, force: true })
    }
  })

  it('vaultKindOf — 순수 판정이라 Clippings 자가치유를 일으키지 않는다', () => {
    const dir = tmp()
    try {
      expect(createVault(dir)).toEqual({ ok: true })
      rmSync(join(dir, 'Clippings'), { recursive: true, force: true })
      expect(vaultKindOf(dir)).toBe('full')
      expect(exists(join(dir, 'Clippings'))).toBe(false)
      expect(vaultKindOf(join(dir, 'nope'))).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('openVault 입력함', () => {
  it('빠진 필수 항목이 Clippings/ 하나뿐이면(클론한 볼트) 입력함을 만들고 연다', () => {
    const dir = tmp()
    try {
      expect(createVault(dir)).toEqual({ ok: true })
      rmSync(join(dir, 'Clippings'), { recursive: true, force: true })
      expect(openVault(dir)).toEqual({ ok: true, kind: 'full' })
      expect(exists(join(dir, 'Clippings'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('raw·Clippings가 함께 빠져도 generic으로 열고 아무것도 만들지 않는다', () => {
    const dir = tmp()
    try {
      expect(createVault(dir)).toEqual({ ok: true })
      rmSync(join(dir, 'Clippings'), { recursive: true, force: true })
      rmSync(join(dir, 'raw'), { recursive: true, force: true })
      expect(openVault(dir)).toEqual({ ok: true, kind: 'generic' })
      expect(exists(join(dir, 'Clippings'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('새 볼트 첫 커밋에 purpose.md가 들어가고, 구 full 볼트를 열면 기본값으로 만든다', () => {
    const dir = tmp()
    try {
      expect(createVault(dir)).toEqual({ ok: true })
      expect(exists(join(dir, 'purpose.md'))).toBe(true)
      expect(git(dir, 'ls-files').split('\n')).toContain('purpose.md')

      rmSync(join(dir, 'purpose.md'))
      expect(openVault(dir)).toEqual({ ok: true, kind: 'full' })
      expect(exists(join(dir, 'purpose.md'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('generic 폴더를 열 때는 purpose.md를 만들지 않는다 (무쓰기)', () => {
    const dir = tmp()
    try {
      expect(createVault(dir)).toEqual({ ok: true })
      rmSync(join(dir, 'Clippings'), { recursive: true, force: true })
      rmSync(join(dir, 'raw'), { recursive: true, force: true })
      rmSync(join(dir, 'purpose.md'))
      expect(openVault(dir)).toEqual({ ok: true, kind: 'generic' })
      expect(exists(join(dir, 'purpose.md'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
