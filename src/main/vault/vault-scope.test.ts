import { describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  allowedForNote,
  isHistoryFile,
  isVaultDoc,
  isVaultFile,
  vaultDocPaths,
  vaultFileOrNull,
  vaultGraphPaths,
  vaultTree
} from './vault-scope'

const fixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-scope-'))
  const put = (rel: string, text = '# x\n'): void => {
    const full = join(dir, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, text)
  }
  put('wiki/INDEX.md')
  put('projects/cloud-voucher/README.md')
  put('projects/cloud-voucher/outputs/2026-09-15-meeting.md')
  put('areas/weekly/2026-W38.md')
  put('outputs/2026-09-16-answer.md')
  put('raw/dump.md')
  put('Clippings/clip.md')
  put('templates/blank.md')
  put('docs/non-developer-onboarding.md')
  put('VAULT_RULES.md')
  put('private/2026-09-17.md')
  put('.git/COMMIT_EDITMSG')
  put('.git/hooks/note.md')
  put('.obsidian/plugins/x/readme.md')
  put('node_modules/pkg/readme.md')
  put('projects/cloud-voucher/sheet.xlsx', 'binary')
  return dir
}

describe('vaultDocPaths', () => {
  it('보관함 전체의 .md 를 본다 — wiki/ 밖 프로젝트·산출물·주간 문서까지', () => {
    const dir = fixture()
    try {
      expect(vaultDocPaths(dir)).toEqual([
        join(dir, 'areas/weekly/2026-W38.md'),
        join(dir, 'docs/non-developer-onboarding.md'),
        join(dir, 'outputs/2026-09-16-answer.md'),
        join(dir, 'private/2026-09-17.md'),
        join(dir, 'projects/cloud-voucher/README.md'),
        join(dir, 'projects/cloud-voucher/outputs/2026-09-15-meeting.md'),
        join(dir, 'wiki/INDEX.md')
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('위키화 전 원본과 빈 양식은 근거로 쓰지 않는다 — 같은 내용이 두 번 인용된다', () => {
    const dir = fixture()
    try {
      const found = vaultDocPaths(dir).join('\n')
      expect(found).not.toContain('raw/')
      expect(found).not.toContain('VAULT_RULES.md')
      expect(found).not.toContain('Clippings/')
      expect(found).not.toContain('templates/')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('숨김 폴더와 node_modules 는 보관함 문서가 아니다', () => {
    const dir = fixture()
    try {
      const found = vaultDocPaths(dir).join('\n')
      expect(found).not.toContain('.git')
      expect(found).not.toContain('.obsidian')
      expect(found).not.toContain('node_modules')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('보관함이 없으면 빈 목록이다', () => {
    expect(vaultDocPaths(join(tmpdir(), 'no-such-vault-dir'))).toEqual([])
  })
})

describe('isVaultDoc', () => {
  it.each([
    ['projects/cloud-voucher/README.md', true],
    ['wiki/INDEX.md', true],
    ['VAULT_RULES.md', false],
    ['docs/non-developer-onboarding.md', true],
    ['areas/weekly/2026-W38.md', true],
    ['raw/dump.md', false],
    ['Clippings/clip.md', false],
    ['templates/blank.md', false],
    ['.obsidian/workspace.md', false],
    ['node_modules/pkg/readme.md', false],
    ['wiki/notes.txt', false],
    ['private/2026-09-17.md', true]
  ])('%s → %s', (rel, expected) => {
    expect(isVaultDoc(rel)).toBe(expected)
  })
})

describe('vaultTree', () => {
  it('점 폴더와 node_modules 만 빼고 전부 — 파일과 폴더를 평면으로', async () => {
    const dir = fixture()
    try {
      const tree = await vaultTree(dir)
      const rels = tree.map((entry) => entry.rel).sort()
      expect(rels).toContain('VAULT_RULES.md')
      expect(rels).toContain('raw/dump.md')
      expect(rels).toContain('templates/blank.md')
      expect(rels).toContain('Clippings/clip.md')
      expect(rels).toContain('projects/cloud-voucher/sheet.xlsx')
      expect(rels).toContain('projects/cloud-voucher/outputs')
      expect(rels.some((rel) => rel.startsWith('.git') || rel.startsWith('.obsidian'))).toBe(false)
      expect(rels.some((rel) => rel.startsWith('node_modules'))).toBe(false)
      expect(tree.find((entry) => entry.rel === 'projects')).toMatchObject({ kind: 'dir', ext: '' })
      expect(tree.find((entry) => entry.rel === 'projects/cloud-voucher/sheet.xlsx')).toMatchObject(
        {
          kind: 'file',
          ext: '.xlsx'
        }
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('심링크는 따라가지 않는다 — 보관함 밖을 가리키는 링크가 트리에 끌려오지 않는다', async () => {
    const dir = fixture()
    const outside = mkdtempSync(join(tmpdir(), 'vault-outside-'))
    try {
      writeFileSync(join(outside, 'secret.md'), '# 밖\n')
      symlinkSync(outside, join(dir, 'linked'))
      symlinkSync(join(outside, 'secret.md'), join(dir, 'wiki', 'link.md'))
      const rels = (await vaultTree(dir)).map((entry) => entry.rel)
      expect(rels.some((rel) => rel.startsWith('linked'))).toBe(false)
      expect(rels).not.toContain('wiki/link.md')
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  // root·Windows 에서는 chmod 000 이 읽기를 막지 않는다
  const permissionsBite = process.platform !== 'win32' && process.getuid?.() !== 0
  it.runIf(permissionsBite)(
    '못 읽는 하위 폴더는 빼고, 맨 위를 못 읽으면 빈 목록이 아니라 오류다',
    async () => {
      const dir = fixture()
      try {
        chmodSync(join(dir, 'raw'), 0o000)
        const rels = (await vaultTree(dir)).map((entry) => entry.rel)
        expect(rels).toContain('raw')
        expect(rels).not.toContain('raw/dump.md')
        chmodSync(dir, 0o000)
        await expect(vaultTree(dir)).rejects.toThrow()
      } finally {
        chmodSync(dir, 0o755)
        chmodSync(join(dir, 'raw'), 0o755)
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it('보관함이 없으면 빈 목록', async () => {
    expect(await vaultTree(join(tmpdir(), 'no-such-vault-xyz'))).toEqual([])
  })
})

describe('isVaultFile', () => {
  it('숨김·node_modules 밖이면 어떤 파일이든 보관함 파일이다', () => {
    expect(isVaultFile('VAULT_RULES.md')).toBe(true)
    expect(isVaultFile('raw/a.pdf')).toBe(true)
    expect(isVaultFile('private/2026-09-17.md')).toBe(true)
    expect(isVaultFile('.obsidian/app.json')).toBe(false)
    expect(isVaultFile('wiki/.hidden.md')).toBe(false)
    expect(isVaultFile('node_modules/x/readme.md')).toBe(false)
    expect(isVaultFile('')).toBe(false)
  })
})

describe('isHistoryFile', () => {
  it('보관함 파일 중 글자 파일이면 기록을 내준다 — 문서 루트 밖·md 아닌 것도', () => {
    expect(isHistoryFile('wiki/a.md')).toBe(true)
    expect(isHistoryFile('outputs/report.html')).toBe(true)
    expect(isHistoryFile('apps/app.ts')).toBe(true)
    expect(isHistoryFile('data/rows.json')).toBe(true)
    expect(isHistoryFile('notes.txt')).toBe(true)
  })

  it('그림·PDF 같은 글자 아닌 파일, 숨김·보관함 밖 경로는 거절한다', () => {
    expect(isHistoryFile('raw/a.pdf')).toBe(false)
    expect(isHistoryFile('attachments/a.png')).toBe(false)
    expect(isHistoryFile('.obsidian/app.json')).toBe(false)
    expect(isHistoryFile('node_modules/x/index.js')).toBe(false)
    expect(isHistoryFile('../outside.html')).toBe(false)
    expect(isHistoryFile('wiki/../../outside.md')).toBe(false)
    expect(isHistoryFile('/etc/hosts.txt')).toBe(false)
    expect(isHistoryFile('')).toBe(false)
  })
})

describe('allowedForNote', () => {
  it('private·outputs·projects/*/outputs 의 md 만 허용한다', () => {
    const dir = fixture()
    try {
      expect(allowedForNote(dir, 'private/2026-09-17.md')).toBe(true)
      expect(allowedForNote(dir, 'private/new/plan.md')).toBe(true)
      expect(allowedForNote(dir, 'outputs/2026-09-17-plan.md')).toBe(true)
      expect(allowedForNote(dir, 'projects/cloud-voucher/outputs/x.md')).toBe(true)
      expect(allowedForNote(dir, 'private/a.MD')).toBe(true)
      expect(allowedForNote(dir, 'wiki/INDEX.md')).toBe(false)
      expect(allowedForNote(dir, 'projects/cloud-voucher/README.md')).toBe(false)
      expect(allowedForNote(dir, 'projects/a/b/outputs/x.md')).toBe(false)
      expect(allowedForNote(dir, 'private/sheet.xlsx')).toBe(false)
      expect(allowedForNote(dir, 'private')).toBe(false)
      expect(allowedForNote(dir, 'VAULT_RULES.md')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('경로 탈출·대소문자 변형·숨김 폴더를 막는다', () => {
    const dir = fixture()
    try {
      expect(allowedForNote(dir, '../private/x.md')).toBe(false)
      expect(allowedForNote(dir, 'private/../wiki/x.md')).toBe(false)
      expect(allowedForNote(dir, 'projects/a/outputs/../../../wiki/x.md')).toBe(false)
      expect(allowedForNote(dir, 'projects/a/outputs/../../wiki/x.md')).toBe(false)
      expect(allowedForNote(dir, 'PRIVATE/x.md')).toBe(false)
      expect(allowedForNote(dir, 'private/.obsidian/x.md')).toBe(false)
      expect(allowedForNote(dir, '/etc/private/x.md')).toBe(false)
      expect(allowedForNote(dir, 'private\\..\\wiki\\x.md')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('범위 안의 심링크가 범위 밖을 가리키면 막는다', () => {
    const dir = fixture()
    const outside = mkdtempSync(join(tmpdir(), 'vault-scope-out-'))
    try {
      symlinkSync(join(dir, 'wiki'), join(dir, 'private', 'wiki-link'))
      symlinkSync(join(dir, 'wiki', 'INDEX.md'), join(dir, 'private', 'index-link.md'))
      symlinkSync(outside, join(dir, 'outputs', 'away'))
      expect(allowedForNote(dir, 'private/wiki-link/x.md')).toBe(false)
      expect(allowedForNote(dir, 'private/index-link.md')).toBe(false)
      expect(allowedForNote(dir, 'outputs/away/x.md')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('ignoredOnly 면 git 이 무시하는 경로만 허용한다', () => {
    const dir = fixture()
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir })
      writeFileSync(join(dir, '.gitignore'), 'private/\n')
      expect(allowedForNote(dir, 'private/2026-09-17.md', { ignoredOnly: true })).toBe(true)
      expect(allowedForNote(dir, 'outputs/2026-09-16-answer.md', { ignoredOnly: true })).toBe(false)
      expect(allowedForNote(dir, 'outputs/2026-09-16-answer.md')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('vaultFileOrNull', () => {
  it('보관함 안 파일 경로만 통과시킨다 — 채팅 프롬프트에 실을 열린 문서', () => {
    const dir = fixture()
    try {
      expect(vaultFileOrNull(dir, 'private/2026-09-17.md')).toBe('private/2026-09-17.md')
      expect(vaultFileOrNull(dir, '../outside.md')).toBeNull()
      expect(vaultFileOrNull(dir, '.git/config')).toBeNull()
      expect(vaultFileOrNull(dir, '/etc/hosts')).toBeNull()
      expect(vaultFileOrNull(dir, '')).toBeNull()
      expect(vaultFileOrNull(dir, 42)).toBeNull()
      expect(vaultFileOrNull(dir, null)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('vaultGraphPaths — test: vault-graph scope', () => {
  it('일반 루트·루트 md까지 담고 원본·양식·숨김은 뺀다', () => {
    const dir = fixture()
    const put = (rel: string): void => {
      const full = join(dir, rel)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, '# x\n')
    }
    put('courses/c1/n.md')
    put('courses/c1/NOTE.MD')
    put('apps/a/b.md')
    put('README.md')
    try {
      const rels = vaultGraphPaths(dir).map((full) => full.slice(dir.length + 1))
      expect(rels).toEqual([
        'README.md',
        'VAULT_RULES.md',
        'apps/a/b.md',
        'areas/weekly/2026-W38.md',
        'courses/c1/NOTE.MD',
        'courses/c1/n.md',
        'docs/non-developer-onboarding.md',
        'outputs/2026-09-16-answer.md',
        'private/2026-09-17.md',
        'projects/cloud-voucher/README.md',
        'projects/cloud-voucher/outputs/2026-09-15-meeting.md',
        'wiki/INDEX.md'
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
