import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createVault } from '../vault/vault-service'
import { finalize, listPages, undoMerge } from './review-service'

const BRANCH = 'app/ingest-2026-09-14'
const RUN_LOG_PATH = 'outputs/runs/2026-09-14-ingest-tester.md'
const RUN_LOG = [
  '---',
  'type: run-log',
  'kind: ingest',
  'run_date: "2026-09-14"',
  'author: tester',
  'summary: "fake ingest"',
  'pr:',
  'processed: 1',
  'new_notes: 2',
  'updated_notes: 1',
  'tags: []',
  'sources: []',
  'notes: []',
  '---',
  '',
  '# Ingest',
  '',
  '## Dropped / Issues',
  '',
  '없음',
  ''
].join('\n')
const EXISTING_ORIGINAL = '---\ntype: concept\n---\n\n# Existing\n\noriginal\n'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

const read = (dir: string, rel: string): string => readFileSync(join(dir, rel), 'utf8')

const write = (dir: string, rel: string, content: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), content)
}

const append = (dir: string, rel: string, lines: string[]): void =>
  write(dir, rel, `${read(dir, rel)}${lines.join('\n')}\n`)

const withVault = async (body: (dir: string) => void | Promise<void>): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), 'review-'))
  try {
    expect(createVault(dir).ok).toBe(true)
    await body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// main 에 기존 페이지·raw 원문을 두고, 에이전트가 작업 브랜치에 남기는 결과를 흉내 낸다:
// 새 페이지 alpha·beta, 기존 페이지 existing 수정, INDEX·topic 링크, raw 추가, run-log.
const ingestedVault = (
  dir: string,
  opts: {
    runLog?: boolean
    touchRaw?: boolean
    renameRaw?: boolean
    trackedClipping?: boolean
    staleVolume?: boolean
  } = {}
): { mainHead: string } => {
  write(dir, 'wiki/existing.md', EXISTING_ORIGINAL)
  write(dir, 'raw/seed.md', '# seed\n')
  append(dir, 'wiki/INDEX.md', ['- [[existing]] — existing'])
  // 볼륨 줄을 VAULT_MEMORY 에 적어 두는 옛 볼트 — 값은 실행 기록에서 파생되니 손으로 적은 줄은 곧 어긋난다
  if (opts.staleVolume) {
    append(dir, 'wiki/VAULT_MEMORY.md', [
      '- Volume to date: 0 ingest runs / 0 clippings 처리 — wiki article 0개, topic 1개'
    ])
  }
  // 클리핑을 main 에 커밋해 두는 볼트 — 위키화가 Clippings/ → raw/ 로 옮기면 git 은 rename 으로 본다
  if (opts.trackedClipping) {
    write(dir, 'Clippings/tracked.md', '# tracked clip\n\n본문\n')
    git(dir, 'add', '-f', 'Clippings/tracked.md')
  }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'seed')
  const mainHead = git(dir, 'rev-parse', 'main')

  git(dir, 'checkout', '-q', '-b', BRANCH)
  write(dir, 'raw/2026-09-14-note.md', '# clip\n')
  write(dir, 'wiki/alpha.md', '---\ntype: concept\n---\n\n# Alpha\n')
  write(dir, 'wiki/beta.md', '---\ntype: concept\n---\n\n# Beta\n')
  write(dir, 'wiki/existing.md', '---\ntype: concept\n---\n\n# Existing\n\nchanged\n')
  append(dir, 'wiki/INDEX.md', ['- [[alpha|Alpha]] — a', '- [[beta]] — b'])
  write(
    dir,
    'wiki/topics/ai.md',
    '---\ntype: topic\nup:\n---\n\n# AI\n\n## Related Notes\n\n- [[wiki/alpha]]\n- [[beta|Beta]]\n- [[alphabet]]\n- [[existing]]\n'
  )
  append(dir, 'wiki/TOPIC_MAP.md', ['- [[topics/ai]]'])
  if (opts.runLog !== false) write(dir, RUN_LOG_PATH, RUN_LOG)
  if (opts.touchRaw) write(dir, 'raw/seed.md', '# seed edited\n')
  if (opts.renameRaw) git(dir, 'mv', 'raw/seed.md', 'wiki/seed.md')
  if (opts.trackedClipping) git(dir, 'mv', 'Clippings/tracked.md', 'raw/tracked.md')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'ingest')
  return { mainHead }
}

describe('listPages', () => {
  it('작업 브랜치 diff 의 wiki 페이지만 페이지로, 나머지는 부속 변경으로 나눈다', () =>
    withVault(async (dir) => {
      ingestedVault(dir)
      const listing = listPages(dir)
      expect(listing).toMatchObject({ ok: true, branch: BRANCH, defaultBranch: 'main' })
      if (!listing.ok) return
      expect(listing.pages).toEqual([
        { path: 'wiki/alpha.md', slug: 'alpha', status: 'added' },
        { path: 'wiki/beta.md', slug: 'beta', status: 'added' },
        { path: 'wiki/existing.md', slug: 'existing', status: 'modified' }
      ])
      expect(listing.others.map((c) => c.path).sort()).toEqual([
        RUN_LOG_PATH,
        'raw/2026-09-14-note.md',
        'wiki/INDEX.md',
        'wiki/TOPIC_MAP.md',
        'wiki/topics/ai.md'
      ])
    }))

  it('작업 브랜치에 있지 않으면 거절한다', () =>
    withVault(async (dir) => {
      expect(listPages(dir)).toEqual({
        ok: false,
        reason: expect.stringContaining('승인할 위키 초안이 없어요'),
        idle: true
      })
    }))
})

describe('finalize', () => {
  it('새 페이지를 거절하면 파일·링크 줄을 지우고 raw 는 남긴 채 검증 후 main 에 병합한다', () =>
    withVault(async (dir) => {
      ingestedVault(dir)

      // 팀에 보내는 일은 핸들러가 얹는다 — finalize 자체는 내 위키의 병합까지다
      expect(await finalize(dir, ['wiki/alpha.md'])).toEqual({
        status: 'merged',
        branch: BRANCH,
        rejected: ['alpha'],
        teamReview: null,
        shareError: null,
        published: null,
        publishError: null
      })

      expect(git(dir, 'branch', '--show-current')).toBe('main')
      expect(git(dir, 'rev-list', '--merges', '--count', 'main')).toBe('1')
      expect(existsSync(join(dir, 'wiki/alpha.md'))).toBe(false)
      expect(existsSync(join(dir, 'wiki/beta.md'))).toBe(true)
      expect(existsSync(join(dir, 'raw/2026-09-14-note.md'))).toBe(true)
      expect(read(dir, 'wiki/INDEX.md')).not.toMatch(/\[\[(wiki\/)?alpha[\]|#]/)
      expect(read(dir, 'wiki/INDEX.md')).toContain('- [[beta]] — b')
      expect(read(dir, 'wiki/topics/ai.md')).not.toContain('[[wiki/alpha]]')
      expect(read(dir, 'wiki/topics/ai.md')).toContain('- [[beta|Beta]]')
      expect(read(dir, 'wiki/topics/ai.md')).toContain('- [[alphabet]]')
      expect(read(dir, 'wiki/TOPIC_MAP.md')).toContain('- [[topics/ai]]')
      expect(read(dir, RUN_LOG_PATH)).toMatch(/## Dropped \/ Issues[\s\S]*거절됨: alpha/)
      expect(git(dir, 'diff', '--name-status', 'HEAD~1', 'HEAD', '--', 'raw')).toBe(
        'A\traw/2026-09-14-note.md'
      )
    }))

  it('수정된 페이지를 거절하면 main 버전으로 되돌리고, 이번 실행이 추가한 링크 줄만 지운다', () =>
    withVault(async (dir) => {
      ingestedVault(dir)
      expect(await finalize(dir, ['wiki/existing.md'])).toMatchObject({ status: 'merged' })
      expect(read(dir, 'wiki/existing.md')).toBe(EXISTING_ORIGINAL)
      expect(read(dir, 'wiki/INDEX.md')).toContain('- [[existing]] — existing')
      expect(read(dir, 'wiki/topics/ai.md')).not.toContain('[[existing]]')
    }))

  it('승인 대기 중 앱 밖에서 위키화가 고친 문서를 고쳤어도 확정한다 — 그 편집은 함께 병합된다', () =>
    withVault(async (dir) => {
      ingestedVault(dir)
      append(dir, 'wiki/INDEX.md', ['- 밖에서 고친 줄'])

      expect(await finalize(dir, [])).toMatchObject({ status: 'merged' })
      expect(git(dir, 'branch', '--show-current')).toBe('main')
      expect(read(dir, 'wiki/INDEX.md')).toContain('- 밖에서 고친 줄')
      expect(git(dir, 'status', '--porcelain', '--untracked-files=no')).toBe('')
    }))

  it('승인 대기 중 앱 밖에서 원본(raw/)을 고쳤으면 병합하지 않는다', () =>
    withVault(async (dir) => {
      ingestedVault(dir)
      write(dir, 'raw/seed.md', '# seed 밖에서 고침\n')

      expect((await finalize(dir, [])).status).not.toBe('merged')
      expect(git(dir, 'branch', '--show-current')).toBe(BRANCH)
    }))

  it('vault_verify 가 실패하면 main 에 병합하지 않고 defect 를 돌려준다', () =>
    withVault(async (dir) => {
      const { mainHead } = ingestedVault(dir, { runLog: false })
      const outcome = await finalize(dir, [])
      expect(outcome).toEqual({
        status: 'verify-failed',
        defects: expect.arrayContaining([expect.stringContaining('run-log')])
      })
      expect(git(dir, 'rev-parse', 'main')).toBe(mainHead)
      expect(git(dir, 'branch', '--show-current')).toBe(BRANCH)
    }))

  it('검증 실패 뒤 원인을 고치고 같은 선택으로 다시 확정하면 병합한다', () =>
    withVault(async (dir) => {
      ingestedVault(dir, { runLog: false })
      expect(await finalize(dir, ['wiki/alpha.md'])).toMatchObject({ status: 'verify-failed' })

      write(dir, RUN_LOG_PATH, RUN_LOG)
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'add run-log')

      expect(await finalize(dir, ['wiki/alpha.md'])).toMatchObject({ status: 'merged' })
      expect(existsSync(join(dir, 'wiki/alpha.md'))).toBe(false)
      expect(git(dir, 'branch', '--show-current')).toBe('main')
    }))

  it('raw/ 원문을 다른 곳으로 옮긴 rename 도 추가 외 변경으로 보고 멈춘다', () =>
    withVault(async (dir) => {
      const { mainHead } = ingestedVault(dir, { renameRaw: true })
      const branchHead = git(dir, 'rev-parse', 'HEAD')
      expect(await finalize(dir, [])).toEqual({
        status: 'failed',
        reason: expect.stringContaining('raw/seed.md')
      })
      expect(git(dir, 'rev-parse', 'HEAD')).toBe(branchHead)
      expect(git(dir, 'rev-parse', 'main')).toBe(mainHead)
    }))

  it('커밋돼 있던 클리핑을 raw/ 로 옮긴 rename 은 raw/ 추가로 보고 병합한다', () =>
    withVault(async (dir) => {
      ingestedVault(dir, { trackedClipping: true })
      expect(await finalize(dir, ['wiki/alpha.md'])).toMatchObject({ status: 'merged' })
      expect(git(dir, 'branch', '--show-current')).toBe('main')
      expect(existsSync(join(dir, 'raw/tracked.md'))).toBe(true)
      expect(existsSync(join(dir, 'Clippings/tracked.md'))).toBe(false)
    }))

  it('VAULT_MEMORY 에 적힌 볼륨 줄은 병합 전에 실행 기록에서 다시 계산해 검증을 통과한다', () =>
    withVault(async (dir) => {
      ingestedVault(dir, { staleVolume: true })
      expect(await finalize(dir, ['wiki/alpha.md'])).toMatchObject({ status: 'merged' })
      const volume = read(dir, 'wiki/VAULT_MEMORY.md')
        .split('\n')
        .find((line) => line.startsWith('- Volume to date:'))
      // alpha 를 거절해 beta·existing 두 노트가 남는다
      expect(volume).toMatch(/^- Volume to date: 1 ingest runs \/ \d+ clippings .*wiki 2 notes/)
    }))

  it('검증을 돌릴 수 없으면 병합하지 않는다', () =>
    withVault(async (dir) => {
      const { mainHead } = ingestedVault(dir)
      const outcome = await finalize(dir, [], async () => ({
        status: 'unavailable',
        reason: '볼트 폴더가 아니다'
      }))
      expect(outcome).toEqual({ status: 'failed', reason: '볼트 폴더가 아니다' })
      expect(git(dir, 'rev-parse', 'main')).toBe(mainHead)
    }))

  it('raw/ 가 추가 말고 수정·삭제됐으면 아무것도 정리하지 않고 멈춘다', () =>
    withVault(async (dir) => {
      const { mainHead } = ingestedVault(dir, { touchRaw: true })
      const branchHead = git(dir, 'rev-parse', 'HEAD')
      expect(await finalize(dir, ['wiki/alpha.md'])).toEqual({
        status: 'failed',
        reason: expect.stringContaining('raw/seed.md')
      })
      expect(git(dir, 'rev-parse', 'HEAD')).toBe(branchHead)
      expect(git(dir, 'rev-parse', 'main')).toBe(mainHead)
      expect(existsSync(join(dir, 'wiki/alpha.md'))).toBe(true)
    }))

  it('목록에 없는 경로를 거절하려 하면 아무것도 바꾸지 않는다', () =>
    withVault(async (dir) => {
      ingestedVault(dir)
      const branchHead = git(dir, 'rev-parse', 'HEAD')
      expect(await finalize(dir, ['raw/2026-09-14-note.md'])).toEqual({
        status: 'failed',
        reason: expect.stringContaining('raw/2026-09-14-note.md')
      })
      expect(git(dir, 'rev-parse', 'HEAD')).toBe(branchHead)
    }))
})

describe('undoMerge', () => {
  it('확정 병합을 되돌리면 main 은 병합 전으로, 작업 브랜치는 거절 정리가 남은 채 다시 승인 대기다', () =>
    withVault(async (dir) => {
      const { mainHead } = ingestedVault(dir)
      expect(await finalize(dir, ['wiki/alpha.md'])).toMatchObject({ status: 'merged' })

      expect(undoMerge(dir, BRANCH)).toEqual({ status: 'undone', branch: BRANCH })

      expect(git(dir, 'rev-parse', 'main')).toBe(mainHead)
      expect(git(dir, 'branch', '--show-current')).toBe(BRANCH)
      const listing = listPages(dir)
      expect(listing.ok && listing.pages.map((p) => p.path)).toEqual([
        'wiki/beta.md',
        'wiki/existing.md'
      ])
      expect(await finalize(dir, [])).toMatchObject({ status: 'merged' })
      expect(git(dir, 'rev-list', '--merges', '--count', 'main')).toBe('1')
    }))

  it('팀 저장소에 이미 올린 병합은 되돌리지 않는다', () =>
    withVault(async (dir) => {
      ingestedVault(dir)
      await finalize(dir, [])
      const bare = `${dir}-backup.git`
      execFileSync('git', ['init', '-q', '--bare', bare])
      try {
        git(dir, 'remote', 'add', 'origin', bare)
        git(dir, 'push', '-q', 'origin', 'main')
        const head = git(dir, 'rev-parse', 'main')

        expect(undoMerge(dir, BRANCH)).toEqual({
          status: 'failed',
          reason: expect.stringContaining('GitHub')
        })
        expect(git(dir, 'rev-parse', 'main')).toBe(head)
      } finally {
        rmSync(bare, { recursive: true, force: true })
      }
    }))

  it('병합 뒤 main 에 커밋이 쌓였으면 아무것도 바꾸지 않는다', () =>
    withVault(async (dir) => {
      ingestedVault(dir)
      await finalize(dir, [])
      write(dir, 'wiki/beta.md', '---\ntype: concept\n---\n\n# Beta\n\nedited\n')
      git(dir, 'commit', '-q', '-am', 'edit: beta')
      const head = git(dir, 'rev-parse', 'main')

      expect(undoMerge(dir, BRANCH)).toEqual({
        status: 'failed',
        reason: expect.stringContaining('위키에 넣은 뒤 위키가 또 바뀌어')
      })
      expect(git(dir, 'rev-parse', 'main')).toBe(head)
      expect(git(dir, 'branch', '--show-current')).toBe('main')
    }))

  // 팀에 이미 간 병합을 로컬에서만 되돌리면 다음 올리기가 거절된다.
  // 동료가 그 뒤에 더 올려 원격이 앞서 있어도 "이미 갔다" 는 사실은 그대로다
  it('팀 저장소가 내 병합을 이미 담고 있으면 되돌리지 않는다 — 원격이 더 앞서 있어도', () =>
    withVault(async (dir) => {
      ingestedVault(dir)
      await finalize(dir, [])
      const shared = mkdtempSync(join(tmpdir(), 'review-team-'))
      const bare = join(shared, 'team.git')
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
      git(dir, 'remote', 'add', 'origin', bare)
      git(dir, 'push', '-q', 'origin', 'main')
      // 동료가 그 위에 한 건 더 올린다
      const mate = join(shared, 'mate')
      execFileSync('git', ['clone', '-q', bare, mate])
      writeFileSync(join(mate, 'wiki', 'mate.md'), '# 동료\n')
      execFileSync('git', ['add', '-A'], { cwd: mate })
      execFileSync('git', ['-c', 'user.name=m', '-c', 'user.email=m@t', 'commit', '-qm', 'mate'], {
        cwd: mate
      })
      execFileSync('git', ['push', '-q', 'origin', 'main'], { cwd: mate })
      git(dir, 'fetch', '-q', 'origin', 'main')
      const head = git(dir, 'rev-parse', 'main')

      expect(undoMerge(dir, BRANCH)).toEqual({
        status: 'failed',
        reason: expect.stringContaining('이미 GitHub에 올라간')
      })
      expect(git(dir, 'rev-parse', 'main')).toBe(head)
      rmSync(shared, { recursive: true, force: true })
    }))

  it('커밋하지 않은 변경이 있거나 다른 브랜치 이름이면 되돌리지 않는다', () =>
    withVault(async (dir) => {
      ingestedVault(dir)
      await finalize(dir, [])
      const head = git(dir, 'rev-parse', 'main')

      expect(undoMerge(dir, 'feature/x')).toMatchObject({ status: 'failed' })
      write(dir, 'wiki/beta.md', 'dirty\n')
      expect(undoMerge(dir, BRANCH)).toEqual({
        status: 'failed',
        reason: expect.stringContaining('저장하지 않은 변경')
      })
      expect(git(dir, 'rev-parse', 'main')).toBe(head)
      expect(read(dir, 'wiki/beta.md')).toBe('dirty\n')
    }))
})
