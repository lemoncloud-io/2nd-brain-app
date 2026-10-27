import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVault } from '../vault/vault-service'
import { preparePipeline } from './prepare'

// renameSync 실패 주입 — 몇 번째 이동에서 던질지. -1 이면 던지지 않는다
const renameCtl = vi.hoisted(() => ({ failOn: -1, calls: 0 }))
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>()
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      renameCtl.calls += 1
      if (renameCtl.calls === renameCtl.failOn) throw new Error('EBUSY mock')
      return actual.renameSync(from, to)
    }
  }
})

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

const withVault = async (body: (dir: string) => Promise<void>): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), 'prepare-'))
  try {
    expect(createVault(dir).ok).toBe(true)
    await body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const clip = (dir: string, name: string, text: string): void =>
  writeFileSync(join(dir, 'Clippings', name), text)

describe('preparePipeline', () => {
  it('작업 브랜치를 만들고 클리핑을 정규화 이름으로 raw/에 옮긴 뒤 시작 커밋한다', () =>
    withVault(async (dir) => {
      clip(
        dir,
        'it’s “quoted” 🚀.md',
        '---\ntitle: 인용 노트\nsource: https://example.com/a\n---\n\n본문이다.\n'
      )
      const result = preparePipeline(dir, '2026-10-08')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.branch).toBe('app/ingest-2026-10-08')
      expect(result.clippings).toMatchObject([
        { clippingName: 'it’s “quoted” 🚀.md', rawName: "it's 'quoted'.md" }
      ])
      expect(git(dir, 'branch', '--show-current')).toBe('app/ingest-2026-10-08')
      expect(git(dir, 'log', '--format=%s', '-2')).toContain('chore: stage 1 clippings for ingest')
      // 내용은 무수정 — 이름만 바뀌었다
      const rawName = result.clippings[0]!.rawName
      expect(git(dir, 'show', `HEAD:raw/${rawName}`)).toContain('본문이다.')
    }))

  it('source 중복은 기존 노트 갱신 경로로 — raw 는 -1 없이도 보존된다', () =>
    withVault(async (dir) => {
      // 과거에 확정된 ingest 가 main 의 raw/ 에 남긴 원문
      writeFileSync(
        join(dir, 'Clippings', 'first.md'),
        '---\ntitle: 첫 글\nsource: https://example.com/dup\n---\n\n하나.\n'
      )
      const first = preparePipeline(dir, '2026-10-07')
      expect(first.ok && first.branch).toBe('app/ingest-2026-10-07')
      git(dir, 'checkout', '-q', 'main')
      git(dir, 'merge', '-q', '--no-ff', 'app/ingest-2026-10-07', '-m', 'merge test')
      clip(dir, 'second.md', '---\ntitle: 둘째\nsource: https://example.com/dup\n---\n\n둘.\n')
      const second = preparePipeline(dir, '2026-10-08')
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.clippings[0]?.duplicateOf).toBe('first.md')
      expect(second.clippings[0]?.rawName).toBe('second.md')
      expect(second.clippings[0]?.updateTargets).toEqual([])
    }))

  it('같은 날 반복은 -2 브랜치를 만든다', () =>
    withVault(async (dir) => {
      clip(dir, 'a.md', '---\ntitle: 가\n---\n\n가.\n')
      const first = preparePipeline(dir, '2026-10-08')
      expect(first.ok && first.branch).toBe('app/ingest-2026-10-08')
      git(dir, 'checkout', '-q', 'main')
      clip(dir, 'b.md', '---\ntitle: 나\n---\n\n나.\n')
      const second = preparePipeline(dir, '2026-10-08')
      expect(second.ok && second.branch).toBe('app/ingest-2026-10-08-2')
    }))

  it('source 중복은 그 원문을 인용하는 노트를 갱신 대상으로 준다', () =>
    withVault(async (dir) => {
      writeFileSync(
        join(dir, 'Clippings', 'first.md'),
        '---\ntitle: 첫 글\nsource: https://example.com/dup\n---\n\n하나.\n'
      )
      const first = preparePipeline(dir, '2026-10-07')
      expect(first.ok).toBe(true)
      if (!first.ok) return
      // 확정: 원문 이동·위키 페이지(인용 포함)까지 main 에 넣는다
      writeFileSync(
        join(dir, 'wiki', 'dup-note.md'),
        '---\ntype: concept\nstatus: draft\nsources:\n  - "raw/first.md"\n---\n\n# Dup\n\n인용.\n'
      )
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'seed note')
      git(dir, 'checkout', '-q', 'main')
      git(dir, 'merge', '-q', '--no-ff', 'app/ingest-2026-10-07', '-m', 'merge test')
      clip(dir, 'second.md', '---\ntitle: 둘째\nsource: https://example.com/dup\n---\n\n둘.\n')
      const second = preparePipeline(dir, '2026-10-08')
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.clippings[0]?.duplicateOf).toBe('first.md')
      expect(second.clippings[0]?.updateTargets).toEqual(['wiki/dup-note.md'])
    }))

  it('Clippings 가 비면 사전 확인에서 막힌다', () =>
    withVault(async (dir) => {
      const result = preparePipeline(dir, '2026-10-08')
      expect(result).toMatchObject({ ok: false })
    }))

  it('시작 커밋만 있는 작업 브랜치에 갇혀 있으면 되감고 새로 시작한다', () =>
    withVault(async (dir) => {
      clip(dir, 'it’s 갑.md', '갑.\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'track clipping')
      clip(dir, 'it’s 을.md', '을.\n')
      const first = preparePipeline(dir, '2026-10-07')
      expect(first.ok && first.branch).toBe('app/ingest-2026-10-07')
      // 여기서 앱이 꺼졌다 — 다음 위키화
      const second = preparePipeline(dir, '2026-10-08')
      expect(second.ok && second.branch).toBe('app/ingest-2026-10-08')
      expect(git(dir, 'branch', '--list', 'app/ingest-2026-10-07')).toBe('')
      if (!second.ok) return
      // 추적 중이던 파일은 원래 이름으로, 커밋 전이던 파일은 정규화된 이름으로 돌아와 다시 실린다
      expect(second.clippings.map((c) => c.clippingName).sort()).toEqual([
        "it's 을.md",
        'it’s 갑.md'
      ])
      expect(readFileSync(join(dir, 'raw', "it's 을.md"), 'utf8')).toBe('을.\n')
      expect(readFileSync(join(dir, 'raw', "it's 갑.md"), 'utf8')).toBe('갑.\n')
    }))

  it('위키 페이지가 커밋된 작업 브랜치는 되감지 않고 승인으로 막는다', () =>
    withVault(async (dir) => {
      clip(dir, 'a.md', '가.\n')
      expect(preparePipeline(dir, '2026-10-07').ok).toBe(true)
      writeFileSync(join(dir, 'wiki', 'page.md'), '# 페이지\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'feat: ingest 1 clippings into wiki (page)')
      clip(dir, 'b.md', '나.\n')
      const result = preparePipeline(dir, '2026-10-08')
      expect(result).toMatchObject({ ok: false })
      expect(!result.ok && result.reason).toContain('승인을 기다리는 위키 초안 만들기가 있어요')
      expect(git(dir, 'branch', '--show-current')).toBe('app/ingest-2026-10-07')
    }))

  it('거절 정리 커밋만 더 있는 작업 브랜치도 되감지 않는다', () =>
    withVault(async (dir) => {
      clip(dir, 'a.md', '가.\n')
      expect(preparePipeline(dir, '2026-10-07').ok).toBe(true)
      writeFileSync(join(dir, 'outputs', 'runs', 'log.md'), '기록\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'chore: drop rejected pages')
      clip(dir, 'b.md', '나.\n')
      expect(preparePipeline(dir, '2026-10-08')).toMatchObject({ ok: false })
      expect(git(dir, 'branch', '--show-current')).toBe('app/ingest-2026-10-07')
      expect(readdirSync(join(dir, 'raw'))).toContain('a.md')
    }))

  it('커밋 전 위키 수정이 남은 작업 브랜치는 되감지 않는다', () =>
    withVault(async (dir) => {
      clip(dir, 'a.md', '가.\n')
      expect(preparePipeline(dir, '2026-10-07').ok).toBe(true)
      writeFileSync(join(dir, 'wiki', 'half-written.md'), '# 쓰다 만 페이지\n')
      expect(preparePipeline(dir, '2026-10-08')).toMatchObject({ ok: false })
      expect(git(dir, 'branch', '--show-current')).toBe('app/ingest-2026-10-07')
    }))

  it('기본 브랜치가 없으면 손대지 않고 기록 문제로 거절한다', () =>
    withVault(async (dir) => {
      git(dir, 'checkout', '-q', '--orphan', 'app/ingest-2026-10-07')
      git(dir, 'branch', '-D', 'main')
      const result = preparePipeline(dir, '2026-10-08')
      expect(result).toMatchObject({ ok: false })
      expect(!result.ok && result.reason).toContain('온전하지 않아요')
    }))

  it('INTAKE 밖 이름바꿈이 있으면 작업 브랜치를 지우지 않는다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'wiki', 'old.md'), '# 옛글\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'seed wiki page')
      git(dir, 'checkout', '-q', '-b', 'app/ingest-2026-10-07')
      git(dir, 'mv', 'wiki/old.md', 'wiki/new.md')
      git(dir, 'commit', '-q', '-m', 'rename outside intake')
      clip(dir, 'c.md', '다.\n')
      const result = preparePipeline(dir, '2026-10-08')
      expect(result).toMatchObject({ ok: false })
      expect(git(dir, 'branch', '--show-current')).toBe('app/ingest-2026-10-07')
      expect(git(dir, 'branch', '--list', 'app/ingest-2026-10-07')).not.toBe('')
      expect(readFileSync(join(dir, 'wiki', 'new.md'), 'utf8')).toBe('# 옛글\n')
    }))

  it('Clippings 고침(M)만 있으면 작업 브랜치를 지우지 않는다', () =>
    withVault(async (dir) => {
      clip(dir, 'a.md', '가.\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'seed clipping')
      git(dir, 'checkout', '-q', '-b', 'app/ingest-2026-10-07')
      writeFileSync(join(dir, 'Clippings', 'a.md'), '고침.\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'touch clipping')
      clip(dir, 'c.md', '다.\n')
      const result = preparePipeline(dir, '2026-10-08')
      expect(result).toMatchObject({ ok: false })
      expect(git(dir, 'branch', '--list', 'app/ingest-2026-10-07')).not.toBe('')
      expect(readFileSync(join(dir, 'Clippings', 'a.md'), 'utf8')).toBe('고침.\n')
    }))

  it('옮기다 실패하면 옮긴 것은 되돌리고 기본 줄기로 돌아간다', () =>
    withVault(async (dir) => {
      clip(dir, 'a.md', '가.\n')
      clip(dir, 'b.md', '나.\n')
      renameCtl.failOn = 2
      renameCtl.calls = 0
      try {
        const result = preparePipeline(dir, '2026-10-08')
        expect(result).toMatchObject({ ok: false })
        expect(git(dir, 'branch', '--show-current')).toBe('main')
        // 대기함은 그대로 — 옮겼던 a.md 도 돌아왔다
        expect(
          readdirSync(join(dir, 'Clippings'))
            .filter((n) => !n.startsWith('.'))
            .sort()
        ).toEqual(['a.md', 'b.md'])
        expect(readFileSync(join(dir, 'Clippings', 'a.md'), 'utf8')).toBe('가.\n')
        expect(readdirSync(join(dir, 'raw')).filter((n) => n.endsWith('.md'))).toEqual([])
      } finally {
        renameCtl.failOn = -1
      }
    }))

  it('같은 내용 재클리핑은 raw에 쌓되 LLM 스킵 대상으로 표시한다', () =>
    withVault(async (dir) => {
      const text = '---\ntitle: 같음\n---\n\n같은 본문.\n'
      clip(dir, 'first.md', text)
      const first = preparePipeline(dir, '2026-10-07')
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.clippings).toMatchObject([{ rawName: 'first.md', skipDraft: false }])
      git(dir, 'checkout', '-q', 'main')
      git(dir, 'merge', '-q', '--no-ff', 'app/ingest-2026-10-07', '-m', 'merge test')
      clip(dir, 'second.md', text)
      const second = preparePipeline(dir, '2026-10-08')
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.clippings).toMatchObject([{ rawName: 'second.md', skipDraft: true }])
      expect(second.clippings[0]?.sha).toMatch(/^[0-9a-f]{64}$/)
      // append-only — 두 벌 다 raw/에 있다
      expect(
        readdirSync(join(dir, 'raw'))
          .filter((n) => n.endsWith('.md'))
          .sort()
      ).toEqual(['first.md', 'second.md'])
    }))

  it('같은 실행 안 겹친 내용은 첫 벌만 초안 대상으로 한다', () =>
    withVault(async (dir) => {
      clip(dir, 'a.md', '---\ntitle: 겹\n---\n\n겹 본문.\n')
      clip(dir, 'b.md', '---\ntitle: 겹\n---\n\n겹 본문.\n')
      const result = preparePipeline(dir, '2026-10-08')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.clippings.map((c) => c.skipDraft)).toEqual([false, true])
    }))

  it('죽은 실행(작업 브랜치 잔재)은 다음 시작이 되감고 중복 커밋 없이 이어간다', () =>
    withVault(async (dir) => {
      clip(dir, 'a.md', '가.\n')
      const first = preparePipeline(dir, '2026-10-08')
      expect(first.ok).toBe(true)
      // 그대로 죽었다 — 작업 브랜치·시작 커밋이 남는다
      expect(git(dir, 'branch', '--show-current')).toBe('app/ingest-2026-10-08')
      const second = preparePipeline(dir, '2026-10-08')
      expect(second.ok).toBe(true)
      if (!second.ok) return
      // 같은 날짜 브랜치 이름 재사용 — 잔재 브랜치가 지워졌다는 뜻 (-2가 아니다)
      expect(git(dir, 'branch', '--show-current')).toBe('app/ingest-2026-10-08')
      expect(git(dir, 'branch', '--list', 'app/ingest-2026-10-08-2')).toBe('')
      expect(second.clippings.map((c) => c.rawName)).toEqual(['a.md'])
      // raw/에 a.md 하나, 대기함은 비었다 — 되감기+재준비가 겹파일을 안 만들었다
      expect(readdirSync(join(dir, 'raw')).filter((n) => n.endsWith('.md'))).toEqual(['a.md'])
      expect(readdirSync(join(dir, 'Clippings')).filter((n) => !n.startsWith('.'))).toEqual([])
      // 시작 커밋은 하나뿐이다 — 죽은 실행의 커밋은 브랜치째 사라졌다
      expect(
        git(dir, 'log', '--format=%s')
          .split('\n')
          .filter((s) => s.startsWith('chore: stage'))
      ).toHaveLength(1)
    }))
})
