import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  utimesSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChangeSet, ChatMessage } from '../../shared/ipc-contract'
import { createVault } from '../vault/vault-service'
import { createVaultActivity } from '../vault/vault-activity'
import { vaultKey } from '../vault/vault-key'
import { createNoteRuns, type PreparedRun, type PrepareResult } from './note-run'
import { markPruned } from './note-run-pure'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

const roots: string[] = []

type Fixture = { vault: string; snapshots: string; put: (rel: string, text: string) => void }

const fixture = (): Fixture => {
  const root = mkdtempSync(join(tmpdir(), 'note-run-'))
  roots.push(root)
  const vault = join(root, 'vault')
  mkdirSync(vault)
  expect(createVault(vault).ok).toBe(true)
  const put = (rel: string, text: string): void => {
    mkdirSync(join(vault, rel, '..'), { recursive: true })
    writeFileSync(join(vault, rel), text)
  }
  put('.gitignore', 'private/\n')
  put('wiki/page.md', '# 위키\n')
  put('outputs/plan.md', '# 계획\n')
  git(vault, 'add', '.gitignore', 'wiki/page.md', 'outputs/plan.md')
  git(vault, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'seed')
  put('private/2026-09-16.md', '# 어제\n')
  return { vault, snapshots: join(root, 'snapshots'), put }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const runOf = (result: PrepareResult): PreparedRun => {
  if ('readonly' in result) throw new Error(result.readonly)
  return result.run
}

const read = (vault: string, rel: string): string => readFileSync(join(vault, rel), 'utf8')
const subjects = (vault: string): string[] => git(vault, 'log', '--format=%s').split('\n')

describe('note run', () => {
  it('범위 안에 만들고 고친 파일을 카드로 돌려주고, 추적 파일만 note: 커밋 하나로 남긴다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    expect(run.ignoredOnly).toBe(false)
    put('private/2026-09-17.md', '# 오늘\n')
    put('private/2026-09-16.md', '# 어제\n\n- 미결\n')
    put('outputs/plan.md', '# 계획\n\n- 할 일\n')
    put('projects/voucher/outputs/memo.md', '# 메모\n')
    const changes = await run.finish()

    expect(changes?.blocked).toEqual([])
    const byRel = Object.fromEntries((changes?.files ?? []).map((f) => [f.rel, f]))
    expect(byRel['private/2026-09-17.md']).toMatchObject({ kind: 'created', tracked: false })
    expect(byRel['private/2026-09-16.md']).toMatchObject({ kind: 'edited', tracked: false })
    expect(byRel['outputs/plan.md']).toMatchObject({ kind: 'edited', tracked: true })
    expect(byRel['projects/voucher/outputs/memo.md']).toMatchObject({
      kind: 'created',
      tracked: true
    })
    expect(subjects(vault)[0]).toMatch(/^note: /)
    expect(git(vault, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual([
      'outputs/plan.md',
      'projects/voucher/outputs/memo.md'
    ])
    expect(git(vault, 'status', '--porcelain')).toBe('')
  })

  it('범위 밖에서 고치고 만들고 지운 것은 되돌리고, 되돌리기 전 내용을 따로 남긴다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('wiki/page.md', '# 엔진이 고침\n')
    put('wiki/new.md', '# 엔진이 만듦\n')
    put('private/notes.txt', 'md 가 아니다')
    unlinkSync(join(vault, 'outputs/plan.md'))
    run.saw(join(vault, 'wiki/new.md'))
    run.saw('private/notes.txt')
    const changes = await run.finish()

    expect(changes?.files).toEqual([])
    expect(changes?.blocked.sort()).toEqual(
      [
        '쓸 수 없는 곳이라 되돌렸어요: wiki/page.md',
        '쓸 수 없는 곳이라 되돌렸어요: wiki/new.md',
        '쓸 수 없는 곳이라 되돌렸어요: private/notes.txt',
        '지우려 한 파일을 되살렸어요: outputs/plan.md'
      ].sort()
    )
    expect(read(vault, 'wiki/page.md')).toBe('# 위키\n')
    expect(read(vault, 'outputs/plan.md')).toBe('# 계획\n')
    expect(existsSync(join(vault, 'wiki/new.md'))).toBe(false)
    expect(existsSync(join(vault, 'private/notes.txt'))).toBe(false)
    expect(git(vault, 'status', '--porcelain')).toBe('')
    expect(subjects(vault)[0]).toBe('seed')
    const kept = join(snapshots, vaultKey(vault), changes!.id, 'kept')
    expect(readFileSync(join(kept, 'wiki/page.md'), 'utf8')).toBe('# 엔진이 고침\n')
    expect(readFileSync(join(kept, 'wiki/new.md'), 'utf8')).toBe('# 엔진이 만듦\n')
  })

  it('실행 전부터 있던 범위 밖 비추적 파일이 바뀌면 지우지 않고 되돌리지 못했다고 말한다', async () => {
    const { vault, snapshots, put } = fixture()
    put('raw/dump.txt', '원본\n')
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('raw/dump.txt', '원본에 덧붙임\n')
    const changes = await run.finish()
    expect(changes?.blocked).toEqual(['되돌리지 못했어요: raw/dump.txt'])
    expect(read(vault, 'raw/dump.txt')).toBe('원본에 덧붙임\n')
  })

  it('실행 중에 생긴 범위 밖 새 파일은 엔진이 쓴 것이 아니면 지우지 않고 알린다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('raw/사람이-넣은-자료.pdf', 'pdf')
    const changes = await run.finish()
    expect(changes?.blocked).toEqual([
      '실행 중에 생긴 파일이라 그대로 두었어요: raw/사람이-넣은-자료.pdf'
    ])
    expect(read(vault, 'raw/사람이-넣은-자료.pdf')).toBe('pdf')
  })

  it('셸 도구를 썼으면 알리지 않은 범위 밖 새 파일도 엔진 것으로 보고 지운다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    run.used('Read')
    run.used('Write')
    put('raw/by-shell.md', '# 셸로 만듦\n')
    expect((await run.finish())?.blocked).toEqual([
      '실행 중에 생긴 파일이라 그대로 두었어요: raw/by-shell.md'
    ])

    const shell = runOf(await notes.prepare(vault, 'c1'))
    shell.used('command')
    put('wiki/by-shell.md', '# 셸로 만듦\n')
    expect((await shell.finish())?.blocked).toEqual([
      '쓸 수 없는 곳이라 되돌렸어요: wiki/by-shell.md'
    ])
    expect(existsSync(join(vault, 'wiki/by-shell.md'))).toBe(false)
  })

  it('새 무시 규칙이 가린 범위 밖 파일도 규칙을 되돌린 뒤 판정한다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('raw/.gitignore', '*\n')
    put('raw/sneaky.md', '# 숨긴 파일\n')
    run.saw('raw/sneaky.md')
    const changes = await run.finish()
    expect(changes?.blocked.sort()).toEqual(
      [
        '쓸 수 없는 곳이라 되돌렸어요: raw/.gitignore',
        '쓸 수 없는 곳이라 되돌렸어요: raw/sneaky.md'
      ].sort()
    )
    expect(existsSync(join(vault, 'raw/.gitignore'))).toBe(false)
    expect(existsSync(join(vault, 'raw/sneaky.md'))).toBe(false)
  })

  it('실행 전부터 있던 비추적 파일은 수정 시각만 바뀌면 변경으로 보지 않는다', async () => {
    const { vault, snapshots, put } = fixture()
    put('raw/dump.txt', '원본\n')
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    const later = new Date(Date.now() + 60_000)
    utimesSync(join(vault, 'raw/dump.txt'), later, later)
    expect(await run.finish()).toBeNull()
  })

  it('실행 중에 생긴 중첩 저장소는 폴더째 두고 알린다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('raw/nested/a.txt', 'a')
    git(join(vault, 'raw/nested'), 'init', '-q')
    const changes = await run.finish()
    expect(changes?.blocked).toEqual(['실행 중에 생긴 폴더라 그대로 두었어요: raw/nested/'])
    expect(existsSync(join(vault, 'raw/nested/a.txt'))).toBe(true)
  })

  it('범위 안 심링크로 위키를 고치면 위키 쪽 변경으로 잡혀 되돌린다', async () => {
    const { vault, snapshots } = fixture()
    symlinkSync(join(vault, 'wiki/page.md'), join(vault, 'private/link.md'))
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    writeFileSync(join(vault, 'private/link.md'), '# 링크로 고침\n')
    const changes = await run.finish()
    expect(changes?.files).toEqual([])
    expect(changes?.blocked).toEqual(['쓸 수 없는 곳이라 되돌렸어요: wiki/page.md'])
    expect(read(vault, 'wiki/page.md')).toBe('# 위키\n')
  })

  it('보관함 밖·범위 밖으로 쓰려던 경로는 인계철선으로 보고한다', async () => {
    const { vault, snapshots } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    run.saw('/etc/hosts')
    run.saw(join(vault, 'wiki', 'page.md'))
    run.saw(join(vault, 'private', 'ok.md'))
    run.saw(`${vault}/../outside.md`)
    const changes = await run.finish()
    expect(changes?.blocked).toEqual([
      '보관함 밖에 쓰려 했어요: /etc/hosts',
      '쓸 수 없는 곳에 쓰려 했어요: wiki/page.md',
      `보관함 밖에 쓰려 했어요: ${vault}/../outside.md`
    ])
  })

  it('바뀐 게 없으면 카드도 기록도 남기지 않는다', async () => {
    const { vault, snapshots } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    expect(await run.finish()).toBeNull()
    expect(readdirSync(join(snapshots, vaultKey(vault)))).toEqual([])
  })

  it('스냅샷은 바뀐 비추적 노트의 사본만 남긴다', async () => {
    const { vault, snapshots, put } = fixture()
    put('private/2026-09-15.md', '# 그저께\n')
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('private/2026-09-16.md', '# 어제 고침\n')
    const changes = await run.finish()
    const files = join(snapshots, vaultKey(vault), changes!.id, 'files')
    expect(readdirSync(join(files, 'private'))).toEqual(['2026-09-16.md'])
    expect(readFileSync(join(files, 'private/2026-09-16.md'), 'utf8')).toBe('# 어제\n')
  })

  it('실행 전 사람이 고친 추적 파일은 save: 로 먼저 저장해 노트 변경으로 잡지 않는다', async () => {
    const { vault, snapshots, put } = fixture()
    put('wiki/page.md', '# 사람이 고침\n')
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    expect(subjects(vault)[0]).toMatch(/^save: /)
    expect(await run.finish()).toBeNull()
    expect(read(vault, 'wiki/page.md')).toBe('# 사람이 고침\n')
  })

  it('위키화·확정이 돌면 읽기 전용으로 내려가고 보관함을 건드리지 않는다', async () => {
    const { vault, snapshots, put } = fixture()
    const activity = createVaultActivity()
    const end = activity.begin('ingest', vault)
    if (typeof end !== 'function') throw new Error('busy')
    const notes = createNoteRuns({ root: () => snapshots, activity })
    put('wiki/page.md', '# 위키화가 쓰는 중\n')
    expect(await notes.prepare(vault, 'c1')).toEqual({
      readonly: '위키 초안 만들기가 끝나면 노트를 쓸 수 있어요 — 이번 답은 읽기만 해요'
    })
    expect(read(vault, 'wiki/page.md')).toBe('# 위키화가 쓰는 중\n')
    expect(subjects(vault)[0]).toBe('seed')
    end()
  })

  it('다른 대화가 쓰는 중이면 읽기 전용이고, 끝나면 다시 쓸 수 있다', async () => {
    const { vault, snapshots } = fixture()
    const activity = createVaultActivity()
    const notes = createNoteRuns({ root: () => snapshots, activity })
    const first = runOf(await notes.prepare(vault, 'c1'))
    const second = await notes.prepare(vault, 'c2')
    expect(second).toEqual({
      readonly:
        '다른 대화가 노트를 쓰는 중이에요 — 끝나면 노트를 쓸 수 있어요. 이번 답은 읽기만 해요'
    })
    expect(activity.clipLock(vault)).not.toBeNull()
    await first.finish()
    expect(activity.clipLock(vault)).toBeNull()
    runOf(await notes.prepare(vault, 'c2'))
  })

  it('승인 대기 중에는 무시되는 개인 노트만 쓰고 산출물은 되돌린다 — 작업 브랜치에 커밋이 없다', async () => {
    const { vault, snapshots, put } = fixture()
    git(vault, 'switch', '-q', '-c', 'app/ingest-2026-09-17')
    put('wiki/page.md', '# 사람이 고침\n')
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    expect(run.ignoredOnly).toBe(true)
    put('private/2026-09-17.md', '# 오늘\n')
    put('outputs/plan.md', '# 계획 고침\n')
    put('wiki/page.md', '# 엔진이 덮어씀\n')
    const changes = await run.finish()
    expect(changes?.files.map((f) => f.rel)).toEqual(['private/2026-09-17.md'])
    expect(changes?.blocked.sort()).toEqual(
      [
        '승인을 끝내면 계획을 쓸 수 있어요 — 되돌렸어요: outputs/plan.md',
        '쓸 수 없는 곳이라 되돌렸어요: wiki/page.md'
      ].sort()
    )
    expect(read(vault, 'outputs/plan.md')).toBe('# 계획\n')
    // 실행 전 사람이 고친 내용으로 돌아간다 — 커밋된 내용이 아니다
    expect(read(vault, 'wiki/page.md')).toBe('# 사람이 고침\n')
    expect(subjects(vault)[0]).toBe('seed')
  })

  it('되돌리기 — 만든 추적 파일은 지우고 고친 비추적 노트는 스냅샷으로, 두 번 눌러도 한 번만', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('outputs/new.md', '# 새 계획\n')
    put('outputs/plan.md', '# 계획 고침\n')
    put('private/2026-09-16.md', '# 어제 고침\n')
    put('private/2026-09-17.md', '# 오늘\n')
    const changes = await run.finish()

    const [first, second] = await Promise.all([
      notes.undo(vault, changes!.id, 'c1'),
      notes.undo(vault, changes!.id, 'c1')
    ])
    expect(first).toEqual(second)
    expect(first.ok && first.changes.undone).toBe(true)
    expect(first.ok && first.changes.files.every((f) => f.state === 'undone')).toBe(true)
    expect(existsSync(join(vault, 'outputs/new.md'))).toBe(false)
    expect(read(vault, 'outputs/plan.md')).toBe('# 계획\n')
    expect(read(vault, 'private/2026-09-16.md')).toBe('# 어제\n')
    expect(existsSync(join(vault, 'private/2026-09-17.md'))).toBe(false)
    expect(subjects(vault).filter((s) => s.startsWith('undo: '))).toHaveLength(1)
    expect(git(vault, 'status', '--porcelain')).toBe('')
  })

  it('되돌리기 전에 사람이 고친 파일은 되돌리지 않는다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('private/2026-09-17.md', '# 오늘\n')
    put('outputs/plan.md', '# 계획 고침\n')
    const changes = await run.finish()
    put('private/2026-09-17.md', '# 오늘 — 사람이 더 씀\n')
    const result = await notes.undo(vault, changes!.id, 'c1')
    expect(result.ok).toBe(true)
    const states = Object.fromEntries(
      (result.ok ? result.changes.files : []).map((f) => [f.rel, f.state])
    )
    expect(states).toEqual({ 'private/2026-09-17.md': 'kept', 'outputs/plan.md': 'undone' })
    expect(read(vault, 'private/2026-09-17.md')).toBe('# 오늘 — 사람이 더 씀\n')
  })

  it('되돌릴 것이 모두 사람 손을 탔으면 카드를 닫되 되돌린 파일은 없다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('private/2026-09-17.md', '# 오늘\n')
    const changes = await run.finish()
    put('private/2026-09-17.md', '# 사람이 고침\n')
    const result = await notes.undo(vault, changes!.id, 'c1')
    expect(result.ok && result.changes.undone).toBe(true)
    expect(result.ok && result.changes.files.map((f) => f.state)).toEqual(['kept'])
  })

  it('한 파일이 실패해도 나머지 진행을 남기고, 다시 누르면 남은 것만 본다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('outputs/plan.md', '# 계획 고침\n')
    put('private/2026-09-16.md', '# 어제 고침\n')
    const changes = await run.finish()
    const copy = join(snapshots, vaultKey(vault), changes!.id, 'files/private/2026-09-16.md')
    const saved = readFileSync(copy)
    unlinkSync(copy)
    const first = await notes.undo(vault, changes!.id, 'c1')
    expect(first.ok && first.changes.undone).toBe(false)
    expect(first.ok && first.changes.blocked).toEqual([
      '되돌리지 못한 파일이 있어요 — 다시 눌러 주세요'
    ])
    const states = (r: typeof first): Record<string, string | undefined> =>
      Object.fromEntries((r.ok ? r.changes.files : []).map((f) => [f.rel, f.state]))
    expect(states(first)).toEqual({
      'outputs/plan.md': 'undone',
      'private/2026-09-16.md': undefined
    })
    writeFileSync(copy, saved)
    const second = await notes.undo(vault, changes!.id, 'c1')
    expect(states(second)).toEqual({
      'outputs/plan.md': 'undone',
      'private/2026-09-16.md': 'undone'
    })
    expect(second.ok && second.changes.blocked).toEqual([])
    expect(read(vault, 'private/2026-09-16.md')).toBe('# 어제\n')
  })

  // 권한으로 쓰기를 막는다 — root·Windows 에서는 막히지 않는다
  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    '되돌린 결과를 기록하지 못하면 기록을 버리고 카드에 지워졌다고 표시한다',
    async () => {
      const { vault, snapshots, put } = fixture()
      const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
      const run = runOf(await notes.prepare(vault, 'c1'))
      put('private/2026-09-17.md', '# 오늘\n')
      const changes = await run.finish()
      const dir = join(snapshots, vaultKey(vault), changes!.id)
      // 기록 자리를 폴더로 막아 원자적 쓰기의 rename 이 실패하게 한다
      chmodSync(dir, 0o500)
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        const result = await notes.undo(vault, changes!.id, 'c1')
        expect(result.ok && result.changes.pruned).toBe(true)
        expect(existsSync(join(vault, 'private/2026-09-17.md'))).toBe(false)
      } finally {
        errors.mockRestore()
        chmodSync(dir, 0o700)
      }
    }
  )

  it('다른 대화의 카드·다른 답이 쓰는 중·승인 대기 중에는 되돌리지 않는다', async () => {
    const { vault, snapshots, put } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('outputs/plan.md', '# 계획 고침\n')
    const changes = await run.finish()
    expect(await notes.undo(vault, changes!.id, 'c2')).toEqual({
      ok: false,
      reason: '되돌릴 기록이 지워졌어요'
    })
    const other = runOf(await notes.prepare(vault, 'c2'))
    expect(await notes.undo(vault, changes!.id, 'c1')).toEqual({
      ok: false,
      reason: '위키 초안 만들기나 다른 답이 보관함을 쓰는 중이에요 — 끝난 뒤 다시 눌러 주세요'
    })
    await other.finish()
    git(vault, 'switch', '-q', '-c', 'app/ingest-2026-09-17')
    expect(await notes.undo(vault, changes!.id, 'c1')).toEqual({
      ok: false,
      reason:
        '승인을 기다리는 위키 초안 만들기가 있어 되돌릴 수 없어요 — 승인을 끝낸 뒤 다시 눌러 주세요'
    })
    expect(read(vault, 'outputs/plan.md')).toBe('# 계획 고침\n')
  })

  it('없는 기록·경로 조각이 섞인 id 는 되돌릴 기록이 지워졌다고 말한다', async () => {
    const { vault, snapshots } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const reason = { ok: false, reason: '되돌릴 기록이 지워졌어요' }
    expect(await notes.undo(vault, '00000000-0000-0000-0000-000000000000', 'c1')).toEqual(reason)
    expect(await notes.undo(vault, '../../../etc', 'c1')).toEqual(reason)
  })

  it('30일이 지난 기록은 다음 실행 때 지운다', async () => {
    const { vault, snapshots, put } = fixture()
    let clock = Date.parse('2026-08-01T00:00:00Z')
    const notes = createNoteRuns({
      root: () => snapshots,
      activity: createVaultActivity(),
      now: () => clock
    })
    const run = runOf(await notes.prepare(vault, 'c1'))
    put('private/2026-09-17.md', '# 오늘\n')
    const changes = await run.finish()
    expect(notes.has(vault, changes!.id)).toBe(true)
    clock = Date.parse('2026-09-17T00:00:00Z')
    await runOf(await notes.prepare(vault, 'c1')).finish()
    expect(notes.has(vault, changes!.id)).toBe(false)
  })

  it('실행 중 앱이 꺼졌으면 다음 시작에 마무리하고 끊긴 카드로 돌려준다', async () => {
    const { vault, snapshots, put } = fixture()
    const crashed = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    runOf(await crashed.prepare(vault, 'c9'))
    put('outputs/half.md', '# 반쯤\n')
    put('wiki/page.md', '# 반쯤 고친 위키\n')

    const restarted = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const recovered = await restarted.recover(vault)
    expect(recovered).toHaveLength(1)
    expect(recovered[0]).toMatchObject({
      conversationId: 'c9',
      changes: {
        interrupted: true,
        files: [{ rel: 'outputs/half.md', kind: 'created', tracked: true }],
        blocked: ['쓸 수 없는 곳이라 되돌렸어요: wiki/page.md']
      }
    })
    expect(read(vault, 'wiki/page.md')).toBe('# 위키\n')
    expect(subjects(vault)[0]).toMatch(/^note: half/)
    // 두 번째 시작에는 붙일 것이 없다
    expect(await restarted.recover(vault)).toEqual([])
  })

  it('실행 전 상태를 다 적기 전에 꺼졌으면 판정하지 않고 기록만 지운다', async () => {
    const { vault, snapshots, put } = fixture()
    const crashed = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await crashed.prepare(vault, 'c9'))
    const recordPath = join(snapshots, vaultKey(vault), run.id, 'run.json')
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as Record<string, unknown>
    writeFileSync(recordPath, JSON.stringify({ ...record, captured: undefined, before: {} }))
    put('raw/자료.pdf', 'pdf')

    const restarted = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    expect(await restarted.recover(vault)).toEqual([])
    expect(restarted.has(vault, run.id)).toBe(false)
    expect(read(vault, 'raw/자료.pdf')).toBe('pdf')
    expect(read(vault, 'private/2026-09-16.md')).toBe('# 어제\n')
  })

  it('끊긴 실행의 복구도 엔진이 알린 경로·셸 사용을 근거로 범위 밖 새 파일을 지운다', async () => {
    const { vault, snapshots, put } = fixture()
    const crashed = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await crashed.prepare(vault, 'c9'))
    run.saw(join(vault, 'wiki/half.md'))
    put('wiki/half.md', '# 엔진이 만듦\n')
    put('raw/사람-자료.pdf', 'pdf')

    const restarted = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const [card] = await restarted.recover(vault)
    expect(card?.changes.blocked.sort()).toEqual(
      [
        '쓸 수 없는 곳이라 되돌렸어요: wiki/half.md',
        '실행 중에 생긴 파일이라 그대로 두었어요: raw/사람-자료.pdf'
      ].sort()
    )
    expect(existsSync(join(vault, 'wiki/half.md'))).toBe(false)

    const again = runOf(await restarted.prepare(vault, 'c9'))
    again.used('Bash')
    put('raw/셸-자료.md', '# 셸\n')
    const third = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const [shellCard] = await third.recover(vault)
    expect(shellCard?.changes.blocked).toEqual(['쓸 수 없는 곳이라 되돌렸어요: raw/셸-자료.md'])
  })

  it('이 프로세스에서 도는 실행은 복구가 건드리지 않는다', async () => {
    const { vault, snapshots } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const run = runOf(await notes.prepare(vault, 'c1'))
    expect(await notes.recover(vault)).toEqual([])
    await run.finish()
  })
})

describe('고친 곳 검토', () => {
  const edited = async (
    fx: Fixture
  ): Promise<{ notes: ReturnType<typeof createNoteRuns>; changes: ChangeSet }> => {
    const notes = createNoteRuns({ root: () => fx.snapshots, activity: createVaultActivity() })
    fx.put('outputs/plan.md', '# 계획\n\n- 하나\n- 둘\n- 셋\n- 넷\n')
    git(fx.vault, 'add', 'outputs/plan.md')
    git(fx.vault, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'plan')
    const run = runOf(await notes.prepare(fx.vault, 'c1'))
    fx.put('outputs/plan.md', '# 계획\n\n- 하나 고침\n- 둘\n- 셋\n- 넷 고침\n')
    fx.put('private/2026-09-17.md', '# 오늘\n')
    const changes = (await run.finish())!
    return { notes, changes }
  }

  it('답이 쓴 그대로면 떨어진 두 곳을 둘로 나누고, 하나만 되돌리면 undo: 커밋이 남는다', async () => {
    const fx = fixture()
    const { notes, changes } = await edited(fx)
    const review = await notes.review(fx.vault, changes.id, 'c1', 'outputs/plan.md')
    if ('unavailable' in review) throw new Error(review.unavailable)
    expect(review.hunks).toEqual([
      { line: 3, removed: ['- 하나'], added: ['- 하나 고침'] },
      { line: 6, removed: ['- 넷'], added: ['- 넷 고침'] }
    ])

    const result = await notes.rejectHunk(
      fx.vault,
      changes.id,
      'c1',
      'outputs/plan.md',
      1,
      review.hash
    )
    if (!result.ok) throw new Error(result.reason)
    expect(read(fx.vault, 'outputs/plan.md')).toBe('# 계획\n\n- 하나 고침\n- 둘\n- 셋\n- 넷\n')
    expect(subjects(fx.vault)[0]).toBe('undo: plan')
    expect(result.review).toMatchObject({ hunks: [{ line: 3 }] })
    expect(result.changes.files.find((f) => f.rel === 'outputs/plan.md')?.state).toBeUndefined()

    // 남은 곳을 되돌리면 그 파일은 되돌린 것이 되고, 통째 되돌리기는 나머지만 본다
    const again = result.review
    if ('unavailable' in again) throw new Error(again.unavailable)
    const last = await notes.rejectHunk(
      fx.vault,
      changes.id,
      'c1',
      'outputs/plan.md',
      0,
      again.hash
    )
    if (!last.ok) throw new Error(last.reason)
    expect(last.changes.files.find((f) => f.rel === 'outputs/plan.md')?.state).toBe('undone')
    expect(git(fx.vault, 'status', '--porcelain')).toBe('')
    const undo = await notes.undo(fx.vault, changes.id, 'c1')
    if (!undo.ok) throw new Error(undo.reason)
    expect(existsSync(join(fx.vault, 'private/2026-09-17.md'))).toBe(false)
    expect(undo.changes.undone).toBe(true)
  })

  it('만든 파일의 마지막 고친 곳을 되돌리면 파일을 지운다', async () => {
    const fx = fixture()
    const { notes, changes } = await edited(fx)
    const review = await notes.review(fx.vault, changes.id, 'c1', 'private/2026-09-17.md')
    if ('unavailable' in review) throw new Error(review.unavailable)
    expect(review.hunks).toEqual([{ line: 1, removed: [], added: ['# 오늘'] }])
    const result = await notes.rejectHunk(
      fx.vault,
      changes.id,
      'c1',
      'private/2026-09-17.md',
      0,
      review.hash
    )
    expect(result.ok).toBe(true)
    expect(existsSync(join(fx.vault, 'private/2026-09-17.md'))).toBe(false)
  })

  it('답 뒤에 사람이 고쳤거나 그 사이 바뀌었으면 나누지도 되돌리지도 않는다', async () => {
    const fx = fixture()
    const { notes, changes } = await edited(fx)
    const review = await notes.review(fx.vault, changes.id, 'c1', 'outputs/plan.md')
    if ('unavailable' in review) throw new Error(review.unavailable)
    fx.put('outputs/plan.md', '# 사람이 고침\n')
    expect(await notes.review(fx.vault, changes.id, 'c1', 'outputs/plan.md')).toHaveProperty(
      'unavailable'
    )
    const result = await notes.rejectHunk(
      fx.vault,
      changes.id,
      'c1',
      'outputs/plan.md',
      0,
      review.hash
    )
    expect(result.ok).toBe(false)
    expect(read(fx.vault, 'outputs/plan.md')).toBe('# 사람이 고침\n')
    expect(await notes.review(fx.vault, changes.id, 'c2', 'outputs/plan.md')).toHaveProperty(
      'unavailable'
    )
  })
})

describe('markPruned', () => {
  it('기록이 지워진 카드에만 표시한다 — 되돌린 카드·파일 없는 카드·기록 있는 카드는 그대로', () => {
    const card = (id: string, extra = {}): ChatMessage => ({
      role: 'assistant',
      text: '',
      refs: [],
      changes: {
        id,
        files: [{ rel: 'private/a.md', kind: 'created', tracked: false, afterHash: 'h' }],
        blocked: [],
        ...extra
      }
    })
    const messages = [
      { role: 'user', text: 'q', refs: [] } as ChatMessage,
      card('gone'),
      card('kept'),
      card('gone-undone', { undone: true }),
      { ...card('gone-empty'), changes: { id: 'gone-empty', files: [], blocked: ['막았다'] } }
    ]
    const marked = markPruned(messages, (id) => id === 'kept')
    expect(marked.map((m) => m.changes?.pruned)).toEqual([
      undefined,
      true,
      undefined,
      undefined,
      undefined
    ])
  })
})

describe('prune blind 가드', () => {
  it('못 읽은 기록이 있으면 오래된 기록을 지우지 않는다', async () => {
    const { vault, snapshots } = fixture()
    const notes = createNoteRuns({ root: () => snapshots, activity: createVaultActivity() })
    const key = vaultKey(vault)
    const oldId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const badId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
    mkdirSync(join(snapshots, key, oldId), { recursive: true })
    writeFileSync(
      join(snapshots, key, oldId, 'run.json'),
      JSON.stringify({
        id: oldId,
        state: 'done',
        conversationId: 'c0',
        startedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
        base: 'x',
        ignoredOnly: true,
        before: {},
        snapshots: []
      })
    )
    mkdirSync(join(snapshots, key, badId), { recursive: true })
    writeFileSync(join(snapshots, key, badId, 'run.json'), '{broken')
    await notes.prepare(vault, 'c1')
    expect(existsSync(join(snapshots, key, oldId))).toBe(true)
  })
})
