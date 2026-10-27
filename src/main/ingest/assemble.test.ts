import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVault } from '../vault/vault-service'
import { preparePipeline } from './prepare'
import { assemblePipeline, autolinkPages } from './assemble'
import { scanFrontmatter } from '../verify/vault-verify'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

const page = (
  rel: string
): {
  rel: string
  type: string
  topics: string[]
  status: string
  title: string
  body: string
} => ({
  rel,
  type: 'concept',
  topics: ['distributed-systems'],
  status: 'draft',
  title: '백프레셔',
  body: '---\ntype: concept\ntopics: [distributed-systems]\nstatus: draft\n---\n# 백프레셔\n\n## Summary\n\n압력이다.\n'
})

describe('assemblePipeline', () => {
  it('초안을 페이지·토픽·INDEX·run-log·결과 커밋으로 조립한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-'))
    try {
      expect(createVault(dir).ok).toBe(true)
      writeFileSync(
        join(dir, 'Clippings', 'a.md'),
        '---\ntitle: 갑\nsource: https://example.com/a\n---\n\n갑 본문.\n'
      )
      const prepared = preparePipeline(dir, '2026-10-08')
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      const clipping = prepared.clippings[0]!
      const result = assemblePipeline({
        vaultDir: dir,
        date: '2026-10-08',
        authorSlug: 'tester',
        drafts: [{ clipping, pages: [page('wiki/backpressure.md')], updatable: [] }]
      })
      expect(result.pages).toMatchObject([{ rel: 'wiki/backpressure.md', kind: 'created' }])
      const text = readFileSync(join(dir, 'wiki/backpressure.md'), 'utf8')
      expect(text).toContain('"raw/a.md"')
      expect(text).toContain('created: "2026-10-08"')
      expect(readFileSync(join(dir, 'wiki/INDEX.md'), 'utf8')).toContain(
        '[[backpressure|백프레셔]]'
      )
      expect(readFileSync(join(dir, 'wiki/topics/distributed-systems.md'), 'utf8')).toContain(
        '[[backpressure|백프레셔]]'
      )
      expect(result.runLogRel).toBe('outputs/runs/2026-10-08-ingest-tester.md')
      expect(git(dir, 'log', '--format=%s', '-1')).toContain('feat: ingest 1 clippings')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('남의 파일은 덮지 않고 탈락으로 남긴다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-'))
    try {
      expect(createVault(dir).ok).toBe(true)
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑.\n')
      writeFileSync(join(dir, 'wiki', 'taken.md'), '# 선점\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'seed')
      const prepared = preparePipeline(dir, '2026-10-08')
      if (!prepared.ok) return
      const result = assemblePipeline({
        vaultDir: dir,
        date: '2026-10-08',
        authorSlug: 'tester',
        drafts: [
          { clipping: prepared.clippings[0]!, pages: [page('wiki/taken.md')], updatable: [] }
        ]
      })
      expect(result.pages).toEqual([])
      expect(result.skipped).toMatchObject([{ rel: 'wiki/taken.md' }])
      expect(readFileSync(join(dir, 'wiki/taken.md'), 'utf8')).toBe('# 선점\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('계측을 주면 run-log 에 소요와 초안 입력이 남는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-'))
    try {
      expect(createVault(dir).ok).toBe(true)
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑 본문.\n')
      const prepared = preparePipeline(dir, '2026-10-08')
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      const clipping = prepared.clippings[0]!
      const result = assemblePipeline({
        vaultDir: dir,
        date: '2026-10-08',
        authorSlug: 'tester',
        drafts: [{ clipping, pages: [page('wiki/backpressure.md')], updatable: [] }],
        measure: { promptChars: 5147, draftCalls: 1, prepareMs: 400, draftMs: 28600, assembleMs: 0 }
      })
      const log = readFileSync(join(dir, result.runLogRel), 'utf8')
      expect(log).toContain('- 소요: 준비 0.4초 · 초안 28.6초 · 정리')
      expect(log).toContain('- 초안 입력: 5,147자 (호출 1회)')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('새 페이지 본문의 기존 노트 이름에 링크를 건다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-'))
    try {
      expect(createVault(dir).ok).toBe(true)
      writeFileSync(
        join(dir, 'wiki', 'herdr.md'),
        '---\ntype: tool\nstatus: draft\n---\n\n# herdr\n\n터미널 멀티플렉서.\n'
      )
      writeFileSync(
        join(dir, 'wiki', 'fresh.md'),
        '---\ntype: concept\nstatus: draft\n---\n\n# Fresh\n\nherdr 안에서 돌린다.\n'
      )
      const applied = autolinkPages(dir, ['wiki/fresh.md'])
      expect(applied).toBe(1)
      expect(readFileSync(join(dir, 'wiki', 'fresh.md'), 'utf8')).toContain('[[herdr]]')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('전부 탈락이면 결과 커밋을 남기지 않는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-'))
    try {
      expect(createVault(dir).ok).toBe(true)
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑.\n')
      writeFileSync(join(dir, 'wiki', 'taken.md'), '# 선점\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'seed')
      const prepared = preparePipeline(dir, '2026-10-08')
      if (!prepared.ok) return
      const result = assemblePipeline({
        vaultDir: dir,
        date: '2026-10-08',
        authorSlug: 'tester',
        drafts: [
          { clipping: prepared.clippings[0]!, pages: [page('wiki/taken.md')], updatable: [] }
        ]
      })
      expect(result.pages).toEqual([])
      expect(result.skipped).toHaveLength(1)
      expect(git(dir, 'log', '--format=%s', '-1')).toContain('chore: stage 1 clippings')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('제목의 큰따옴표는 run-log 를 깨지 않게 작은따옴표로 둔다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-'))
    try {
      expect(createVault(dir).ok).toBe(true)
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑.\n')
      const prepared = preparePipeline(dir, '2026-10-08')
      if (!prepared.ok) return
      const quoted = { ...page('wiki/q.md'), title: 'A "quoted" thing' }
      const result = assemblePipeline({
        vaultDir: dir,
        date: '2026-10-08',
        authorSlug: 'tester',
        drafts: [{ clipping: prepared.clippings[0]!, pages: [quoted], updatable: [] }]
      })
      expect(result.pages).toHaveLength(1)
      const log = readFileSync(join(dir, result.runLogRel), 'utf8')
      expect(log).toContain("[[q|A 'quoted' thing]]")
      expect(scanFrontmatter(log, result.runLogRel)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('갱신하면 들여쓰기가 달라도 기존 sources 를 살린다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assemble-'))
    try {
      expect(createVault(dir).ok).toBe(true)
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑.\n')
      writeFileSync(
        join(dir, 'wiki', 'old.md'),
        '---\ntype: concept\nstatus: draft\nsources:\n    - "raw/other.md"\n---\n\n# Old\n\n옛 글.\n'
      )
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'seed')
      const prepared = preparePipeline(dir, '2026-10-08')
      if (!prepared.ok) return
      const upd = { ...page('wiki/old.md'), title: 'Old' }
      const result = assemblePipeline({
        vaultDir: dir,
        date: '2026-10-08',
        authorSlug: 'tester',
        drafts: [{ clipping: prepared.clippings[0]!, pages: [upd], updatable: ['wiki/old.md'] }]
      })
      expect(result.pages).toMatchObject([{ rel: 'wiki/old.md', kind: 'updated' }])
      const text = readFileSync(join(dir, 'wiki/old.md'), 'utf8')
      expect(text).toContain('"raw/other.md"')
      expect(text).toContain('"raw/a.md"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
