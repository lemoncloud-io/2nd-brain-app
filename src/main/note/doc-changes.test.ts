import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DocChanges, DocChangesResult } from '../../shared/ipc-contract'
import { createVault } from '../vault/vault-service'
import { createVaultActivity } from '../vault/vault-activity'
import { vaultKey } from '../vault/vault-key'
import { createNoteRuns, type PreparedRun, type PrepareResult } from './note-run'
import { createDocChanges, parseDiff } from './doc-changes'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

/** 이틀 전 커밋 — "오늘"·"어제" 기준이 잡을 수 있는 이전 기록을 만든다 */
const commitAt = (dir: string, when: string, message: string): void => {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message], {
    cwd: dir,
    env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when }
  })
}

const roots: string[] = []

type Fixture = { vault: string; snapshots: string; put: (rel: string, text: string) => void }

const fixture = (): Fixture => {
  const root = mkdtempSync(join(tmpdir(), 'doc-changes-'))
  roots.push(root)
  const vault = join(root, 'vault')
  mkdirSync(vault)
  expect(createVault(vault).ok).toBe(true)
  const put = (rel: string, text: string): void => {
    mkdirSync(join(vault, rel, '..'), { recursive: true })
    writeFileSync(join(vault, rel), text)
  }
  put('.gitignore', 'private/\n')
  put('outputs/plan.md', '# 계획\n\n- 하나\n- 둘\n')
  git(vault, 'add', '.gitignore', 'outputs/plan.md')
  commitAt(vault, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), 'seed')
  return { vault, snapshots: join(root, 'snapshots'), put }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const runOf = (result: PrepareResult): PreparedRun => {
  if ('readonly' in result) throw new Error(result.readonly)
  return result.run
}

const changesOf = (result: DocChangesResult): DocChanges => {
  if ('unavailable' in result) throw new Error(result.unavailable)
  return result
}

describe('noteRuns.prepare — generic 폴더', () => {
  it('읽기 중심으로 열린 폴더에서는 노트 실행을 시작하지 않고 파일을 하나도 만들지 않는다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'note-generic-'))
    roots.push(root)
    const generic = join(root, 'plain')
    mkdirSync(generic)
    writeFileSync(join(generic, 'Home.md'), '# 홈\n')
    const snapshots = join(root, 'snapshots')
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const result = await notes.prepare(generic, 'c1')
    expect('readonly' in result && result.readonly).toContain('읽기 중심')
    expect(existsSync(snapshots)).toBe(false)
    expect(readdirSync(generic).sort()).toEqual(['Home.md'])
  })
})

describe('parseDiff', () => {
  it('더한 줄 범위와 지운 글을 hunk 헤더에서 읽는다', () => {
    const diff = [
      '--- a/outputs/plan.md',
      '+++ b/outputs/plan.md',
      '@@ -2,0 +3,2 @@',
      '+- 셋',
      '+- 넷',
      '@@ -7,1 +8,0 @@',
      '-지운 줄',
      ''
    ].join('\n')
    expect(parseDiff(diff)).toEqual({
      added: [{ from: 3, to: 4 }],
      removed: [{ after: 8, text: '지운 줄' }]
    })
  })

  it('줄 수가 없는 hunk 헤더를 1 로 읽고, 파일 머리글을 지운 줄로 세지 않는다', () => {
    const diff = ['--- a/x.md', '+++ b/x.md', '@@ -3 +3 @@', '-옛 줄', '+새 줄'].join('\n')
    expect(parseDiff(diff)).toEqual({
      added: [{ from: 3, to: 3 }],
      removed: [{ after: 2, text: '옛 줄' }]
    })
  })
})

describe('docChanges', () => {
  it('이번 답 기준으로 추적 파일에서 엔진이 더한 줄을 돌려준다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const docChanges = createDocChanges({ root: () => snapshots })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('outputs/plan.md', '# 계획\n\n- 하나\n- 둘\n- 셋\n')
    const changes = await run.finish()

    const result = changesOf(await docChanges(vault, 'outputs/plan.md', { change: changes!.id }))
    expect(result).toMatchObject({ added: [{ from: 5, to: 5 }], removed: [] })
    // 리더가 그리는 내용과 같은 것을 견줬는지 가릴 해시 — 읽기 IPC 와 같은 값
    expect(result.hash).toBe(
      createHash('sha256')
        .update(readFileSync(join(vault, 'outputs/plan.md'), 'utf8'))
        .digest('hex')
    )
  })

  it('비추적 노트는 스냅샷과 견준다 — 다르면 git 이 1 로 끝나지만 오류가 아니다', async () => {
    const { vault, snapshots, put } = fixture()
    put('private/2026-09-17.md', '# 오늘\n\n- 하나\n- 지울 줄\n')
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const docChanges = createDocChanges({ root: () => snapshots })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('private/2026-09-17.md', '# 오늘\n\n- 하나\n- 둘\n')
    const changes = await run.finish()

    const result = changesOf(
      await docChanges(vault, 'private/2026-09-17.md', { change: changes!.id })
    )
    expect(result.added).toEqual([{ from: 4, to: 4 }])
    expect(result.removed).toEqual([{ after: 3, text: '- 지울 줄' }])
  })

  it('이번 답이 만든 파일은 전부 더한 줄이다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const docChanges = createDocChanges({ root: () => snapshots })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('private/2026-09-18.md', '# 오늘\n\n- 하나\n')
    const changes = await run.finish()

    const result = changesOf(
      await docChanges(vault, 'private/2026-09-18.md', { change: changes!.id })
    )
    expect(result).toMatchObject({ added: [{ from: 1, to: 3 }], removed: [] })
  })

  it('오늘 기준은 오늘 아침 이전 마지막 커밋과 견준다', async () => {
    const { vault, snapshots, put } = fixture()
    const docChanges = createDocChanges({ root: () => snapshots })
    put('outputs/plan.md', '# 계획\n\n- 하나\n- 둘\n- 오늘 더한 줄\n')

    const result = changesOf(await docChanges(vault, 'outputs/plan.md', 'today'))
    expect(result.added).toEqual([{ from: 5, to: 5 }])
  })

  it('기준 시점 이전 기록이 없으면 이유를 말한다', async () => {
    const { vault, snapshots, put } = fixture()
    const docChanges = createDocChanges({ root: () => snapshots })
    put('private/2026-09-17.md', '# 오늘\n')

    expect(await docChanges(vault, 'private/2026-09-17.md', 'yesterday')).toEqual({
      unavailable: '어제 이전 기록이 없어요'
    })
  })

  it('기록이 지워진 답은 기준을 잡지 못한다고 말한다', async () => {
    const { vault, snapshots, put } = fixture()
    const docChanges = createDocChanges({ root: () => snapshots })
    put('private/2026-09-17.md', '# 오늘\n')

    expect(
      await docChanges(vault, 'private/2026-09-17.md', {
        change: '00000000-0000-0000-0000-000000000000'
      })
    ).toEqual({ unavailable: '이 답의 기록이 지워져 바뀐 곳을 보여 드릴 수 없어요' })
  })

  it('보관함 밖 경로와 없는 파일은 읽지 않는다', async () => {
    const { vault, snapshots } = fixture()
    const docChanges = createDocChanges({ root: () => snapshots })
    expect(await docChanges(vault, '../outside.md', 'today')).toEqual({
      unavailable: '이 문서를 찾지 못했어요'
    })
    expect(await docChanges(vault, 'outputs/gone.md', 'today')).toEqual({
      unavailable: '이 문서를 찾지 못했어요'
    })
  })

  it('사본을 열지 못하면 "바뀐 곳 없음" 이 아니라 읽지 못했다고 말한다', async () => {
    const { vault, snapshots, put } = fixture()
    put('private/note.md', '# 노트\n\n- 하나\n')
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const docChanges = createDocChanges({ root: () => snapshots })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('private/note.md', '# 노트\n\n- 하나\n- 둘\n')
    const changes = await run.finish()
    const kept = join(snapshots, vaultKey(vault), changes!.id, 'files', 'private/note.md')
    chmodSync(kept, 0o000)

    expect(await docChanges(vault, 'private/note.md', { change: changes!.id })).toEqual({
      unavailable: '바뀐 곳을 읽지 못했어요'
    })
    chmodSync(kept, 0o644)
  })

  it('망가진 실행 기록은 "지워졌다" 가 아니라 읽지 못했다고 말한다', async () => {
    const { vault, snapshots, put } = fixture()
    put('private/note.md', '# 노트\n')
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const docChanges = createDocChanges({ root: () => snapshots })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('private/note.md', '# 노트\n\n- 하나\n')
    const changes = await run.finish()
    writeFileSync(join(snapshots, vaultKey(vault), changes!.id, 'run.json'), '{망가진')

    expect(await docChanges(vault, 'private/note.md', { change: changes!.id })).toEqual({
      unavailable: '바뀐 곳을 읽지 못했어요'
    })
  })

  it('못 읽은 기록이 있으면 날짜 기준을 넘겨짚지 않는다', async () => {
    const { vault, snapshots, put } = fixture()
    const day = 24 * 60 * 60 * 1000
    put('private/note.md', '# 노트\n')
    const notes = createNoteRuns({
      root: () => snapshots,
      activity: createVaultActivity(),
      now: () => Date.now() - 2 * day
    })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('private/note.md', '# 노트\n\n- 하나\n')
    await run.finish()
    const root = join(snapshots, vaultKey(vault))
    const broken = join(root, '11111111-1111-1111-1111-111111111111')
    mkdirSync(broken)
    writeFileSync(join(broken, 'run.json'), '{망가진')
    expect(readdirSync(root)).toHaveLength(2)

    const docChanges = createDocChanges({ root: () => snapshots })
    expect(await docChanges(vault, 'private/note.md', 'yesterday')).toEqual({
      unavailable: '바뀐 곳을 읽지 못했어요'
    })
  })

  it('어제 기준의 비추적 노트는 그 전 실행의 사본과 견준다', async () => {
    const { vault, snapshots, put } = fixture()
    const day = 24 * 60 * 60 * 1000
    const twoDaysAgo = Date.now() - 2 * day
    put('private/note.md', '# 노트\n\n- 그제 줄\n')
    const old = createNoteRuns({
      root: () => snapshots,
      activity: createVaultActivity(),
      now: () => twoDaysAgo
    })
    const run = runOf(await old.prepare(vault, 'c1'))
    put('private/note.md', '# 노트\n\n- 그제 줄\n- 그제 쓴 줄\n')
    await run.finish()
    put('private/note.md', '# 노트\n\n- 그제 줄\n- 그제 쓴 줄\n- 오늘 쓴 줄\n')

    const docChanges = createDocChanges({ root: () => snapshots })
    const result = changesOf(await docChanges(vault, 'private/note.md', 'yesterday'))
    expect(result.added).toEqual([{ from: 4, to: 5 }])
  })
})
