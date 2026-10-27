import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVault } from '../vault/vault-service'
import {
  checkIngestResult,
  foreignLanded,
  landedIn,
  prepareIngest,
  strandedCommits
} from './work-branch'
import type { IngestBase } from './work-branch'
import { setMainLanguage } from '../i18n'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()

const withVault = (body: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), 'ingest-'))
  try {
    expect(createVault(dir).ok).toBe(true)
    body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const clip = (dir: string, name = 'note.md'): void => {
  writeFileSync(join(dir, 'Clippings', name), '# clip')
}

const baseOf = (dir: string): IngestBase => {
  const base = prepareIngest(dir)
  if (!base.ok) throw new Error(base.reason)
  return base
}

// 에이전트의 app 레인 결과를 흉내 낸다: 작업 브랜치 → note.md 를 raw 로 → 결과 커밋
const agentRun = (dir: string, branch = 'app/ingest-2026-09-14'): void => {
  git(dir, 'checkout', '-q', '-b', branch)
  renameSync(join(dir, 'Clippings', 'note.md'), join(dir, 'raw', 'note.md'))
  writeFileSync(join(dir, 'wiki', 'note.md'), '# note')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'ingest')
}

describe('prepareIngest', () => {
  it('git 저장소가 아니면 기본 브랜치 없음으로 뭉개지 않고 git 에러를 드러낸다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'not-git-'))
    try {
      mkdirSync(join(dir, 'Clippings'))
      clip(dir)
      expect(() => prepareIngest(dir)).toThrow(/not a git repository/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('기본 브랜치에서 처리할 클리핑이 있으면 기본 브랜치와 그 HEAD 를 돌려준다', () =>
    withVault((dir) => {
      clip(dir)
      expect(prepareIngest(dir)).toEqual({
        ok: true,
        defaultBranch: 'main',
        head: git(dir, 'rev-parse', 'main')
      })
    }))

  it('Clippings 에 .gitkeep·숨김 파일만 있으면 거절한다', () =>
    withVault((dir) => {
      writeFileSync(join(dir, 'Clippings', '.DS_Store'), '')
      expect(prepareIngest(dir)).toEqual({
        ok: false,
        reason: expect.stringContaining('위키 초안 대기함')
      })
    }))

  it('기본 브랜치가 아닌 곳에 있으면 거절한다', () =>
    withVault((dir) => {
      clip(dir)
      git(dir, 'checkout', '-q', '-b', 'app/ingest-2026-09-13')
      expect(prepareIngest(dir)).toEqual({
        ok: false,
        reason: expect.stringContaining('승인을 기다리는 위키 초안 만들기가 있어요')
      })
    }))

  it('화면 언어가 영어면 거절 사유와 뒤에 붙는 할 일이 모두 영어다', () =>
    withVault((dir) => {
      clip(dir)
      git(dir, 'checkout', '-q', '-b', 'app/ingest-2026-09-13')
      setMainLanguage('en')
      try {
        expect(prepareIngest(dir)).toEqual({
          ok: false,
          reason:
            'A wiki draft is waiting for approval — add it to the wiki or reject it all in Approvals, then make the wiki draft again'
        })
      } finally {
        setMainLanguage('ko')
      }
    }))

  it('작업 브랜치도 기본 브랜치도 아니면 앱 안에서 되돌릴 길을 알린다', () =>
    withVault((dir) => {
      clip(dir)
      git(dir, 'checkout', '-q', '-b', 'my-experiment')
      expect(prepareIngest(dir)).toEqual({
        ok: false,
        reason: expect.stringContaining('보관함 상태 되돌리기')
      })
    }))

  it('기본 브랜치가 master 인 볼트도 받는다', () =>
    withVault((dir) => {
      git(dir, 'branch', '-m', 'main', 'master')
      clip(dir)
      expect(prepareIngest(dir)).toMatchObject({ ok: true, defaultBranch: 'master' })
    }))
})

describe('checkIngestResult', () => {
  it('기본 브랜치 불변 + 작업 브랜치 커밋 + 빈 Clippings 면 통과한다', () =>
    withVault((dir) => {
      clip(dir)
      const base = baseOf(dir)
      agentRun(dir, 'app/ingest-2026-09-14-2')
      expect(checkIngestResult(dir, base)).toEqual({ ok: true, branch: 'app/ingest-2026-09-14-2' })
    }))

  it('기본 브랜치 HEAD 가 바뀌면 실패다', () =>
    withVault((dir) => {
      clip(dir)
      const base = baseOf(dir)
      git(dir, 'commit', '-q', '--allow-empty', '-m', 'tamper')
      agentRun(dir)
      expect(checkIngestResult(dir, base)).toEqual({
        ok: false,
        reason: expect.stringContaining('main')
      })
    }))

  it('작업 브랜치에 커밋이 없으면 실패다', () =>
    withVault((dir) => {
      clip(dir)
      const base = baseOf(dir)
      git(dir, 'checkout', '-q', '-b', 'app/ingest-2026-09-14')
      expect(checkIngestResult(dir, base)).toEqual({
        ok: false,
        reason: expect.stringContaining('하나도 만들지 않았어요')
      })
    }))

  it('기본 브랜치에 그대로 있으면 실패다', () =>
    withVault((dir) => {
      clip(dir)
      const base = baseOf(dir)
      expect(checkIngestResult(dir, base)).toEqual({
        ok: false,
        reason: expect.stringContaining('위키 초안을 따로 모아 두지 않았어요')
      })
    }))

  it('Clippings 에 처리 안 된 파일이 남으면 실패다', () =>
    withVault((dir) => {
      clip(dir)
      clip(dir, 'second.md')
      const base = baseOf(dir)
      agentRun(dir)
      expect(checkIngestResult(dir, base)).toEqual({
        ok: false,
        reason: expect.stringContaining('second.md')
      })
    }))
})

describe('landedIn', () => {
  const commitAll = (dir: string, message: string): void => {
    git(dir, 'add', '-A')
    git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message)
  }

  it('자기 커밋이 없는 브랜치는 들어간 것이다', () => {
    withVault((dir) => {
      git(dir, 'branch', 'docs/empty')
      expect(landedIn(dir, 'docs/empty', 'main')).toBe(true)
    })
  })

  it('건드린 파일 내용이 대상과 같으면 들어간 것이다 — squash 머지', () => {
    withVault((dir) => {
      git(dir, 'switch', '-q', '-c', 'docs/plan')
      writeFileSync(join(dir, 'wiki', 'plan[1].md'), '# 계획\n')
      commitAll(dir, 'plan')
      git(dir, 'switch', '-q', 'main')
      expect(landedIn(dir, 'docs/plan', 'main')).toBe(false)
      writeFileSync(join(dir, 'wiki', 'plan[1].md'), '# 계획\n')
      commitAll(dir, 'squash: plan')
      expect(landedIn(dir, 'docs/plan', 'main')).toBe(true)
    })
  })

  it('같은 커밋이 들어간 뒤 팀이 그 파일을 더 고쳐도 들어간 것이다 — patch-id', () => {
    withVault((dir) => {
      writeFileSync(join(dir, 'wiki', 'plan.md'), 'a\n\nb\n\nc\n')
      commitAll(dir, 'base')
      git(dir, 'switch', '-q', '-c', 'docs/plan')
      writeFileSync(join(dir, 'wiki', 'plan.md'), 'A\n\nb\n\nc\n')
      commitAll(dir, 'change a')
      git(dir, 'switch', '-q', 'main')
      git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'cherry-pick', 'docs/plan')
      writeFileSync(join(dir, 'wiki', 'plan.md'), 'A\n\nb\n\nC\n')
      commitAll(dir, 'team follow-up')
      expect(landedIn(dir, 'docs/plan', 'main')).toBe(true)
    })
  })
})

describe('strandedCommits', () => {
  const commitAll = (dir: string, message: string): void => {
    git(dir, 'add', '-A')
    git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message)
  }

  it('앱이 남긴 커밋과 다른 도구의 커밋을 가른다 — 오래된 것부터', () => {
    withVault((dir) => {
      git(dir, 'switch', '-q', '-c', 'ingest/promote')
      writeFileSync(join(dir, 'wiki', 'a.md'), '# a\n')
      commitAll(dir, 'feat: promote a')
      writeFileSync(join(dir, 'wiki', 'b.md'), '# b\n')
      commitAll(dir, 'edit: b')
      writeFileSync(join(dir, 'wiki', 'c.md'), '# c\n')
      commitAll(dir, 'save: 2026-09-22 14:00')
      const [edit, save] = [git(dir, 'rev-parse', 'HEAD~1'), git(dir, 'rev-parse', 'HEAD')]
      const { carry, foreign } = strandedCommits(dir, 'ingest/promote', 'main')
      expect(carry).toEqual([edit, save])
      expect(foreign).toEqual([git(dir, 'rev-parse', 'HEAD~2')])
      expect(foreignLanded(dir, foreign, 'main')).toBe(false)
      expect(foreignLanded(dir, [], 'main')).toBe(true)
    })
  })
})
