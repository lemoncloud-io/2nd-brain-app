// 채팅 노트 쓰기 한 번의 앞뒤 — 실행 전 보관함 상태를 적어 두고, 실행 뒤 바뀐 파일을 판정한다.
// 범위 밖 변경은 되돌리고 범위 안 추적 파일은 `note:` 커밋 하나로 남긴다. 판정은 디스크가 정한다 —
// 엔진의 file-change 이벤트는 "누가 썼나" 를 가리는 보조 근거이자 보관함 밖 쓰기를 알리는 인계철선이다.
// 실행 기록은 userData/snapshots/<보관함 키>/<실행 id>/ 에 둔다: run.json(표식·실행 전 상태·결과)과
// files/(실행 전 비추적 노트의 사본 — 실행 뒤 바뀐 것만 남긴다), kept/(되돌리기 전 범위 밖 내용).
import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type {
  ChangeFile,
  ChangeSet,
  HunkRejectResult,
  HunkReview,
  UndoResult
} from '../../shared/ipc-contract'
import { lineHunks, revertHunk } from '../../shared/line-diff'
import { INGEST_LOCK } from '../engine/cli-process'
import { defaultBranchOf, isWorkBranch } from '../engine/work-branch'
import { git } from '../git'
import { midOperation, saveEdits } from '../vault/sync-service'
import { appIdentity } from '../vault/app-identity'
import { vaultActivity as defaultActivity, type VaultActivity } from '../vault/vault-activity'
import { withVaultGit } from '../vault/vault-queue'
import { allowedForNote, ignoredByGit } from '../vault/vault-scope'
import { requireFullVault } from '../vault/vault-service'
import { createRunStore, type Before, type RunRecord, type Sig } from './run-store'
import {
  isDirEntry,
  isIgnoreFile,
  parseStatus,
  pushOnce,
  sameSig,
  sha256,
  slugOf,
  untrackedCode
} from './note-run-pure'
import { mainT } from '../i18n'
import { messages } from '../../shared/i18n'
import { LANGUAGES } from '../../shared/language'

export type PreparedRun = {
  id: string
  /** 승인 대기 중 — git 이 무시하는 경로만 쓸 수 있다 */
  ignoredOnly: boolean
  /** 엔진이 쓰려던 경로(file-change) — 범위 밖 새 파일을 지울지 가리고 보관함 밖 쓰기를 알린다 */
  saw: (path: string) => void
  /** 엔진이 부른 도구 — 쓴 파일을 알리지 않는 도구(셸)가 있었는지 본다 */
  used: (tool: string) => void
  /** 바뀐 파일 판정·되돌림·커밋. 엔진이 실패·취소돼도 부른다. 아무 변화가 없으면 null */
  finish: () => Promise<ChangeSet | null>
}

export type PrepareResult = { run: PreparedRun } | { readonly: string }

export type NoteRuns = {
  prepare: (vaultDir: string, conversationId: string) => Promise<PrepareResult>
  /** 그 대화의 카드만 되돌린다 */
  undo: (vaultDir: string, changeId: string, conversationId: string) => Promise<UndoResult>
  /** 앱이 실행 중에 꺼져 남은 실행을 마무리한다 — 대화마다 붙일 변경 카드 */
  recover: (vaultDir: string) => Promise<{ conversationId: string; changes: ChangeSet }[]>
  /** 되돌릴 기록이 아직 있나 */
  has: (vaultDir: string, changeId: string) => boolean
  /** 그 카드의 파일 하나를 고친 곳으로 나눈다 */
  review: (
    vaultDir: string,
    changeId: string,
    conversationId: string,
    rel: string
  ) => Promise<HunkReview>
  /** 고친 곳 하나만 되돌린다 — `undo:` 커밋. 전부 되돌리면 그 파일은 되돌린 것이 된다 */
  rejectHunk: (
    vaultDir: string,
    changeId: string,
    conversationId: string,
    rel: string,
    index: number,
    hash: string
  ) => Promise<HunkRejectResult>
}

export type NoteRunDeps = {
  /** 스냅샷 루트(userData/snapshots) — userData 는 모듈 로드 뒤에 바뀔 수 있어 늦게 읽는다 */
  root: () => string
  activity?: VaultActivity
  now?: () => number
}

const KEEP_RUNS = 200
const KEEP_MS = 30 * 24 * 60 * 60 * 1000
/** 사본 없는 비추적 파일의 해시 상한 — 큰 자료는 크기·수정 시각으로만 본다 */
const HASH_LIMIT = 1024 * 1024
/** 실행 전에 해시하는 파일 수 상한 — 커밋 전 자료가 많아도 준비가 오래 멈추지 않게 */
const HASH_COUNT = 500
/** 쓴 파일을 file-change 로 알리는 도구와 읽기만 하는 도구. 그 밖의 도구(claude Bash·codex 명령)는 셸로 본다 */
const KNOWN_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'Write',
  'Edit',
  'MultiEdit',
  'WebSearch',
  'WebFetch'
])

const STATUS = ['status', '--porcelain=v1', '-z', '--no-renames', '-uall']
// 노트 범위의 무시 파일(`private/` 가 보통 무시된다)까지 본다. 보관함 전체의 무시 파일은 너무 많다
const NOTE_PATHSPECS = [':(literal)private', ':(literal)outputs', ':(glob)projects/*/outputs/**']
// 무시 규칙 파일 자신 — `*` 한 줄짜리 새 `.gitignore` 는 자기 자신까지 가린다
const IGNORE_PATHSPECS = [':(glob)**/.gitignore']

const sigOf = (full: string): Sig | null => {
  try {
    const st = lstatSync(full)
    return { size: st.size, mtimeMs: st.mtimeMs }
  } catch {
    return null
  }
}

const readOrNull = (full: string): Buffer | null => {
  try {
    return readFileSync(full)
  } catch {
    return null
  }
}

const isFile = (full: string): boolean => {
  try {
    return lstatSync(full).isFile()
  } catch {
    return false
  }
}

const vaultStatus = (vaultDir: string): Map<string, string> => {
  const all = parseStatus(git(vaultDir, STATUS))
  for (const pathspecs of [NOTE_PATHSPECS, IGNORE_PATHSPECS]) {
    const ignored = parseStatus(
      git(vaultDir, [...STATUS, '--ignored=traditional', '--', ...pathspecs])
    )
    for (const [rel, code] of ignored) if (code === '!!') all.set(rel, code)
  }
  return all
}

const copyInto = (from: string, to: string): void => {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}

/** 경로 지정 커밋 — 파일명의 `*`·`[` 를 패턴으로 읽지 않는다. 바뀐 게 없으면 커밋하지 않는다 */
const commitPaths = (vaultDir: string, paths: string[], subject: string): void => {
  if (paths.length === 0) return
  git(vaultDir, ['--literal-pathspecs', 'add', '--', ...paths])
  const staged = git(vaultDir, [
    '--literal-pathspecs',
    'diff',
    '--cached',
    '--name-only',
    '-z',
    '--',
    ...paths
  ])
  if (staged === '') return
  git(vaultDir, [
    '--literal-pathspecs',
    ...appIdentity(),
    'commit',
    '-q',
    '-m',
    subject,
    '--',
    ...paths
  ])
}

/** 엔진이 알린 경로를 보관함 상대경로로 — 보관함 밖이면 null */
const vaultRelOf = (vaultDir: string, path: string): string | null => {
  let real = vaultDir
  try {
    real = realpathSync(vaultDir)
  } catch {
    // 사라진 보관함 — 원래 경로로 본다
  }
  const abs = resolve(isAbsolute(path) ? path : join(vaultDir, path))
  for (const base of [vaultDir, real]) {
    if (abs.startsWith(base + sep)) return relative(base, abs).split(sep).join('/')
  }
  return null
}

export const createNoteRuns = (deps: NoteRunDeps): NoteRuns => {
  const activity = deps.activity ?? defaultActivity
  const now = deps.now ?? Date.now
  /** 이 프로세스에서 아직 도는 실행 — 복구가 건드리지 않는다 */
  const live = new Set<string>()
  /** 도는 되돌리기 — 같은 카드를 연달아 누르면 같은 결과를 기다린다 */
  const undoing = new Map<string, Promise<UndoResult>>()

  const { runDir, snapshotFile, readRecord, writeRecord, readAll } = createRunStore(deps.root)

  /** 30일 또는 200회 중 먼저 닿는 쪽 — 오래된 것부터 지운다. 도는 실행은 건드리지 않는다 */
  const prune = (vaultDir: string): void => {
    // 못 읽은 기록이 하나라도 있으면 이 목록이 전부라고 말할 수 없다 — 정책 밖 삭제를 막는다
    const { list, failed } = readAll(vaultDir)
    if (failed > 0) {
      console.error('unreadable note run records exist; not pruning old records', vaultDir, failed)
      return
    }
    const done = list.filter((r) => r.state === 'done').sort((a, b) => b.startedAt - a.startedAt)
    done.forEach((record, index) => {
      if (index >= KEEP_RUNS || now() - record.startedAt > KEEP_MS) {
        rmSync(runDir(vaultDir, record.id), { recursive: true, force: true })
      }
    })
  }

  /** 실행 전 상태 — 자동 저장 뒤라 추적 파일은 (작업 브랜치가 아니면) 깨끗하다 */
  const capture = (vaultDir: string, record: RunRecord): void => {
    let hashed = 0
    for (const [rel, code] of vaultStatus(vaultDir)) {
      const full = join(vaultDir, rel)
      const sig = sigOf(full)
      const before: Before = { code, sig }
      record.before[rel] = before
      if (sig === null || isDirEntry(rel) || !isFile(full)) continue
      // 되돌릴 원본이 git 에 없는 것 — 비추적 노트, 작업 브랜치에서 저장 안 한 추적 파일
      const keep = untrackedCode(code) ? allowedForNote(vaultDir, rel) : true
      if (keep) {
        copyInto(full, snapshotFile(vaultDir, record.id, rel))
        record.snapshots.push(rel)
      } else if (sig.size <= HASH_LIMIT && hashed < HASH_COUNT) {
        hashed += 1
        const data = readOrNull(full)
        if (data !== null) before.hash = sha256(data)
      }
    }
  }

  type Changed = {
    rel: string
    how: 'created' | 'edited' | 'deleted'
    tracked: boolean
    dir?: boolean
  }

  const detect = (vaultDir: string, record: RunRecord): Changed[] => {
    const after = vaultStatus(vaultDir)
    const snapshotted = new Set(record.snapshots)
    const changed: Changed[] = []
    const differs = (rel: string, prev: Before): boolean => {
      const full = join(vaultDir, rel)
      if (snapshotted.has(rel)) {
        const current = readOrNull(full)
        const was = readOrNull(snapshotFile(vaultDir, record.id, rel))
        return current === null || was === null || !current.equals(was)
      }
      if (prev.hash !== undefined) {
        const current = readOrNull(full)
        return current === null || sha256(current) !== prev.hash
      }
      return !sameSig(prev.sig, sigOf(full))
    }
    for (const [rel, code] of after) {
      const prev = record.before[rel]
      const tracked = !untrackedCode(code)
      if (isDirEntry(rel)) {
        if (prev === undefined) changed.push({ rel, how: 'created', tracked, dir: true })
        continue
      }
      const exists = sigOf(join(vaultDir, rel)) !== null
      if (prev === undefined) {
        if (!tracked) changed.push({ rel, how: 'created', tracked })
        else changed.push({ rel, how: exists ? 'edited' : 'deleted', tracked })
      } else if (differs(rel, prev)) {
        changed.push({ rel, how: exists ? 'edited' : 'deleted', tracked })
      }
    }
    for (const [rel, prev] of Object.entries(record.before)) {
      if (after.has(rel) || isDirEntry(rel)) continue
      // 실행 전 더럽던 것이 깨끗해졌거나(추적) 사라졌다(비추적)
      const tracked = !untrackedCode(prev.code)
      const exists = sigOf(join(vaultDir, rel)) !== null
      changed.push({ rel, how: exists ? 'edited' : 'deleted', tracked })
    }
    return changed
  }

  /**
   * 범위 밖·지운 파일을 실행 전으로 — 되돌리기 전 내용은 kept/ 에 남긴다.
   * 범위 밖 새 파일은 엔진이 썼다고 알린 것만 지운다: 실행 중 사람이 넣은 자료를 지우지 않게.
   */
  const restore = (
    vaultDir: string,
    record: RunRecord,
    change: Changed,
    engineWrote: boolean
  ): 'restored' | 'left' | 'failed' => {
    const dir = runDir(vaultDir, record.id)
    const full = join(vaultDir, change.rel)
    if (change.how === 'created' && !engineWrote) return 'left'
    if (isFile(full)) copyInto(full, join(dir, 'kept', change.rel))
    if (record.snapshots.includes(change.rel)) {
      rmSync(full, { force: true })
      copyInto(snapshotFile(vaultDir, record.id, change.rel), full)
      return 'restored'
    }
    if (change.how === 'created') {
      rmSync(full, { force: true })
      return 'restored'
    }
    if (change.tracked) {
      git(vaultDir, ['--literal-pathspecs', 'checkout', record.base, '--', change.rel])
      return 'restored'
    }
    return 'failed'
  }

  const revert = (
    vaultDir: string,
    record: RunRecord,
    change: Changed,
    engineWrote: boolean,
    blocked: string[]
  ): void => {
    if (change.dir) {
      pushOnce(blocked, mainT().noteRun.blocked.newFolder(change.rel))
      return
    }
    let result: 'restored' | 'left' | 'failed' = 'failed'
    try {
      result = restore(vaultDir, record, change, engineWrote)
    } catch (error) {
      console.error('could not revert an out-of-scope change from the note run', change.rel, error)
    }
    if (result === 'left') pushOnce(blocked, mainT().noteRun.blocked.newFile(change.rel))
    else if (result === 'failed') pushOnce(blocked, mainT().noteRun.blocked.failed(change.rel))
    else if (change.how === 'deleted') {
      pushOnce(blocked, mainT().noteRun.blocked.restored(change.rel))
    } else if (record.ignoredOnly && allowedForNote(vaultDir, change.rel)) {
      pushOnce(blocked, mainT().noteRun.blocked.pending(change.rel))
    } else pushOnce(blocked, mainT().noteRun.blocked.denied(change.rel))
  }

  const settle = (vaultDir: string, record: RunRecord): ChangeSet | null => {
    const sawPaths = record.saw ?? []
    const files: ChangeFile[] = []
    const blocked: string[] = []
    const commit: string[] = []
    const named = new Set(
      sawPaths.map((path) => vaultRelOf(vaultDir, path)).filter((r): r is string => r !== null)
    )
    // 무시 규칙부터 되돌린다 — 바뀐 규칙이 가린 새 파일이 아래 판정에 보이게. 규칙 파일은 누가 썼든 되돌린다
    for (const change of detect(vaultDir, record)) {
      if (isIgnoreFile(change.rel)) revert(vaultDir, record, change, true, blocked)
    }
    const changed = detect(vaultDir, record)
    for (const change of changed) {
      const inScope =
        !change.dir &&
        change.how !== 'deleted' &&
        allowedForNote(vaultDir, change.rel, { ignoredOnly: record.ignoredOnly })
      if (!inScope) {
        revert(vaultDir, record, change, record.shell === true || named.has(change.rel), blocked)
        continue
      }
      const data = readOrNull(join(vaultDir, change.rel))
      if (data === null) continue
      // 새 파일은 git 이 무시하지 않으면 커밋한다. 실행 전부터 있던 비추적 파일은 비추적으로 둔다 —
      // 되돌릴 원본이 커밋에 없어 스냅샷으로 되돌린다
      const tracked =
        change.tracked || (change.how === 'created' && !ignoredByGit(vaultDir, change.rel))
      if (tracked) commit.push(change.rel)
      files.push({
        rel: change.rel,
        kind: change.how === 'created' ? 'created' : 'edited',
        tracked,
        afterHash: sha256(data)
      })
    }
    const reported = new Set(changed.map((c) => c.rel))
    for (const path of sawPaths) {
      const rel = vaultRelOf(vaultDir, path)
      if (rel === null) pushOnce(blocked, mainT().noteRun.blocked.outside(path))
      else if (!reported.has(rel) && !allowedForNote(vaultDir, rel)) {
        pushOnce(blocked, mainT().noteRun.blocked.deniedTry(rel))
      }
    }
    try {
      commitPaths(vaultDir, commit, `note: ${slugOf(commit)}`)
    } catch (error) {
      console.error('note commit failed', commit, error)
      blocked.push(mainT().noteRun.blocked.notCommitted)
    }
    // 되돌리기에 쓸 사본은 바뀐 비추적 노트의 것뿐이다 — 나머지는 바로 지운다
    const needed = new Set(files.filter((f) => !f.tracked && f.kind === 'edited').map((f) => f.rel))
    record.snapshots = record.snapshots.filter((rel) => {
      if (needed.has(rel)) return true
      rmSync(snapshotFile(vaultDir, record.id, rel), { force: true })
      return false
    })
    if (files.length === 0 && blocked.length === 0) return null
    return { id: record.id, files, blocked }
  }

  /** 기록을 남기지 못한 실행은 기록째 지운다 — 다음 시작의 복구가 같은 실행을 다시 판정하지 않게 */
  const dropRecord = (vaultDir: string, id: string): void => {
    try {
      rmSync(runDir(vaultDir, id), { recursive: true, force: true })
    } catch (error) {
      console.error('could not delete note run record', id, error)
    }
  }

  const finishRecord = (
    vaultDir: string,
    record: RunRecord,
    interrupted: boolean
  ): ChangeSet | null => {
    let changes: ChangeSet | null
    try {
      changes = settle(vaultDir, record)
    } catch (error) {
      console.error('note run finish failed', record.id, error)
      changes = { id: record.id, files: [], blocked: [mainT().noteRun.unchecked] }
    }
    if (changes && interrupted) changes.interrupted = true
    if (changes === null) {
      dropRecord(vaultDir, record.id)
      return null
    }
    record.state = 'done'
    record.changes = changes
    try {
      writeRecord(vaultDir, record)
    } catch (error) {
      console.error('could not record note run result', record.id, error)
      dropRecord(vaultDir, record.id)
      return { ...changes, pruned: true }
    }
    return changes
  }

  const readonlyReason = (vaultDir: string): string | null => {
    if (!existsSync(join(vaultDir, '.git'))) return mainT().noteRun.noGit
    if (existsSync(join(vaultDir, INGEST_LOCK))) return mainT().noteRun.wikiBusy
    const current = git(vaultDir, ['branch', '--show-current']).trim()
    if (current === '' || !defaultBranchOf(vaultDir) || midOperation(vaultDir))
      return mainT().noteRun.stuck
    return null
  }

  /** 준비 본문 — 보관함 줄 안에서 돈다. 읽기 전용으로 내려가면 활동을 놓는다 */
  const begin = (vaultDir: string, conversationId: string, end: () => void): PrepareResult => {
    const reason = readonlyReason(vaultDir)
    if (reason !== null) {
      end()
      return { readonly: reason }
    }
    const ignoredOnly = isWorkBranch(git(vaultDir, ['branch', '--show-current']).trim())
    // 승인 대기 중에는 저장하지 않는다 — 저장 커밋이 승인 목록에 섞인다
    if (!ignoredOnly) {
      try {
        saveEdits(vaultDir)
      } catch (error) {
        console.error('autosave before note run failed', error)
        end()
        return { readonly: mainT().noteRun.saveFailed }
      }
    }
    try {
      prune(vaultDir)
    } catch (error) {
      // 오래된 기록을 못 지워도 이번 실행은 돈다
      console.error('could not prune old note run records', error)
    }
    const record: RunRecord = {
      id: randomUUID(),
      state: 'running',
      conversationId,
      startedAt: now(),
      base: git(vaultDir, ['rev-parse', 'HEAD']).trim(),
      ignoredOnly,
      before: {},
      snapshots: []
    }
    live.add(record.id)
    try {
      mkdirSync(runDir(vaultDir, record.id), { recursive: true })
      // 표식을 먼저 남긴다 — 사본을 뜨다 꺼져도 다음 시작에 이 실행을 찾는다(captured 없이)
      writeRecord(vaultDir, record)
      capture(vaultDir, record)
      record.captured = true
      writeRecord(vaultDir, record)
    } catch (error) {
      console.error('recording state before note run failed', error)
      dropRecord(vaultDir, record.id)
      live.delete(record.id)
      end()
      return { readonly: mainT().noteRun.saveFailed }
    }
    // 엔진이 알린 것을 기록에도 쌓는다 — 앱이 꺼져도 복구가 같은 근거를 쓴다
    const remember = (): void => {
      try {
        writeRecord(vaultDir, record)
      } catch (error) {
        console.error('could not update note run record', record.id, error)
      }
    }
    let finished: Promise<ChangeSet | null> | null = null
    return {
      run: {
        id: record.id,
        ignoredOnly,
        saw: (path) => {
          record.saw ??= []
          if (record.saw.includes(path)) return
          record.saw.push(path)
          remember()
        },
        used: (tool) => {
          if (KNOWN_TOOLS.has(tool) || record.shell) return
          record.shell = true
          remember()
        },
        finish: () => {
          finished ??= withVaultGit(vaultDir, () => finishRecord(vaultDir, record, false)).finally(
            () => {
              live.delete(record.id)
              end()
            }
          )
          return finished
        }
      }
    }
  }

  /** 답 전 내용 — 만든 파일은 빈 글, 추적 파일은 답 전 커밋, 비추적 노트는 실행 전 사본 */
  const baseText = (vaultDir: string, record: RunRecord, file: ChangeFile): string | null => {
    if (file.kind === 'created') return ''
    if (file.tracked) return git(vaultDir, ['show', `${record.base}:${file.rel}`])
    const copy = readOrNull(snapshotFile(vaultDir, record.id, file.rel))
    return copy === null ? null : copy.toString('utf8')
  }

  /** 답이 쓴 그대로인 파일만 나눈다 — 사람이 고친 줄을 AI 가 고친 곳으로 보이지 않게 */
  const reviewOf = (
    vaultDir: string,
    record: RunRecord,
    file: ChangeFile
  ): { base: string; text: string; review: HunkReview } => {
    const none = (reason: string): { base: string; text: string; review: HunkReview } => ({
      base: '',
      text: '',
      review: { unavailable: reason }
    })
    if (file.state) return none(mainT().noteRun.reviewDone)
    const data = readOrNull(join(vaultDir, file.rel))
    if (data === null || sha256(data) !== file.afterHash) return none(mainT().noteRun.reviewEdited)
    const base = baseText(vaultDir, record, file)
    if (base === null) return none(mainT().noteRun.reviewNoBase)
    const text = data.toString('utf8')
    const hunks = lineHunks(base, text).map((h) => ({
      line: h.start + 1,
      removed: h.removed,
      added: h.added
    }))
    return { base, text, review: { hunks, hash: file.afterHash } }
  }

  /** 그 대화의 끝난 기록과 그 안의 파일 — 없으면 null */
  const recordFile = (
    vaultDir: string,
    changeId: string,
    conversationId: string,
    rel: string
  ): { record: RunRecord; changes: ChangeSet; file: ChangeFile } | null => {
    const record = readRecord(vaultDir, changeId)
    if (
      record === null ||
      record.state !== 'done' ||
      !record.changes ||
      record.conversationId !== conversationId
    ) {
      return null
    }
    const file = record.changes.files.find((f) => f.rel === rel)
    return file ? { record, changes: record.changes, file } : null
  }

  /** 추적 파일을 되돌리면 커밋이 생긴다 — 승인 대기·정리 중인 줄기에는 올리지 않는다 */
  const commitBlocked = (vaultDir: string): string | null => {
    if (existsSync(join(vaultDir, INGEST_LOCK))) return mainT().noteRun.undoBusy
    const current = git(vaultDir, ['branch', '--show-current']).trim()
    if (isWorkBranch(current)) return mainT().noteRun.undoPending
    if (current === '' || midOperation(vaultDir)) return mainT().noteRun.undoStuck
    return null
  }

  const rejectRun = (
    vaultDir: string,
    changeId: string,
    conversationId: string,
    rel: string,
    index: number,
    hash: string
  ): HunkRejectResult => {
    const found = recordFile(vaultDir, changeId, conversationId, rel)
    if (found === null) return { ok: false, reason: mainT().noteRun.undoGone }
    const { record, changes, file } = found
    if (file.tracked) {
      const blocked = commitBlocked(vaultDir)
      if (blocked !== null) return { ok: false, reason: blocked }
    }
    const { base, text, review } = reviewOf(vaultDir, record, file)
    if ('unavailable' in review) return { ok: false, reason: review.unavailable }
    const hunk = lineHunks(base, text)[index]
    if (review.hash !== hash || hunk === undefined)
      return { ok: false, reason: mainT().noteRun.reviewMoved }
    const full = join(vaultDir, file.rel)
    const next = revertHunk(text, hunk)
    if (next === base) {
      // 마지막 고친 곳 — 파일이 답 전으로 돌아갔다. 만든 파일은 지운다(통째 되돌리기와 같다)
      if (file.kind === 'created') rmSync(full, { force: true })
      else writeFileSync(full, next, 'utf8')
      file.state = 'undone'
    } else {
      writeFileSync(full, next, 'utf8')
      file.afterHash = sha256(next)
    }
    if (file.tracked) {
      try {
        commitPaths(vaultDir, [file.rel], `undo: ${slugOf([file.rel])}`)
      } catch (error) {
        console.error('hunk undo commit failed', file.rel, error)
        pushOnce(changes.blocked, mainT().noteRun.blocked.undoNotCommitted)
      }
    }
    changes.undone = changes.files.every((f) => f.state !== undefined)
    try {
      writeRecord(vaultDir, record)
    } catch (error) {
      // 새 해시를 못 남기면 다음 되돌리기가 이 파일을 "사람이 고친 것" 으로 읽는다 — 기록을 버린다
      console.error('could not record hunk undo result', record.id, error)
      dropRecord(vaultDir, record.id)
      return {
        ok: true,
        changes: { ...changes, pruned: true },
        review: { unavailable: mainT().noteRun.undoGone }
      }
    }
    return { ok: true, changes, review: reviewOf(vaultDir, record, file).review }
  }

  /** 되돌리기 본문 — 파일마다 따로 돌고, 어디서 멈춰도 진행 상태를 남긴다 */
  const undoRun = (vaultDir: string, changeId: string, conversationId: string): UndoResult => {
    const record = readRecord(vaultDir, changeId)
    if (
      record === null ||
      record.state !== 'done' ||
      !record.changes ||
      record.conversationId !== conversationId
    ) {
      return { ok: false, reason: mainT().noteRun.undoGone }
    }
    const changes = record.changes
    const pending = changes.files.filter((f) => !f.state)
    if (pending.some((f) => f.tracked)) {
      const blocked = commitBlocked(vaultDir)
      if (blocked !== null) return { ok: false, reason: blocked }
    }
    const commit: string[] = []
    let failed = false
    for (const file of pending) {
      const full = join(vaultDir, file.rel)
      const data = readOrNull(full)
      if (data === null || sha256(data) !== file.afterHash) {
        file.state = 'kept'
        continue
      }
      try {
        if (file.kind === 'created') rmSync(full, { force: true })
        else if (file.tracked) {
          writeFileSync(full, git(vaultDir, ['show', `${record.base}:${file.rel}`]), 'utf8')
        } else copyFileSync(snapshotFile(vaultDir, record.id, file.rel), full)
        if (file.tracked) commit.push(file.rel)
        file.state = 'undone'
      } catch (error) {
        console.error('could not revert file', file.rel, error)
        failed = true
      }
    }
    try {
      commitPaths(vaultDir, commit, `undo: ${slugOf(commit)}`)
    } catch (error) {
      console.error('undo commit failed', commit, error)
      pushOnce(changes.blocked, mainT().noteRun.blocked.undoNotCommitted)
    }
    if (failed) pushOnce(changes.blocked, mainT().noteRun.undoPartial)
    // 기록은 언어를 바꾼 뒤에도 남는다 — 어느 언어로 남긴 줄이든 지운다
    else {
      const partial = LANGUAGES.map((lang) => messages(lang).noteRun.undoPartial)
      changes.blocked = changes.blocked.filter((line) => !partial.includes(line))
    }
    // 파일마다 state 가 남아 다음 요청은 남은 것만 본다 — 전부 끝났을 때만 카드를 닫는다
    changes.undone = changes.files.every((f) => f.state !== undefined)
    try {
      writeRecord(vaultDir, record)
    } catch (error) {
      // 되돌린 결과를 못 남기면 다음 요청이 방금 되돌린 파일을 "사람이 고친 것" 으로 읽는다 — 기록을 버린다
      console.error('could not record undo result', record.id, error)
      dropRecord(vaultDir, record.id)
      return { ok: true, changes: { ...changes, pruned: true } }
    }
    return { ok: true, changes }
  }

  return {
    prepare: (vaultDir, conversationId) => {
      // generic 폴더에는 노트 실행 기반(추적·스냅샷·커밋)이 없다 — 활동 홀더를 잡기 전에 거절한다.
      // 문구는 requireFullVault 단일 출처에 읽기 안내만 덧붙인다
      const genericReason = requireFullVault(vaultDir)
      if (genericReason !== null)
        return Promise.resolve({ readonly: mainT().noteRun.readOnly(genericReason) })
      const end = activity.begin('note', vaultDir)
      if (typeof end !== 'function') {
        return Promise.resolve({
          readonly:
            activity.holder(vaultDir) === 'note'
              ? mainT().noteRun.noteBusy
              : mainT().noteRun.wikiBusy
        })
      }
      return withVaultGit(vaultDir, (): PrepareResult => {
        try {
          return begin(vaultDir, conversationId, end)
        } catch (error) {
          console.error('note run prepare failed', error)
          end()
          return { readonly: mainT().noteRun.readFailed }
        }
      })
    },

    // 되돌리기도 보관함을 쓴다 — 도는 노트 실행이 이 결과를 AI 변경으로 읽지 않게 같은 활동을 잡는다
    undo: (vaultDir, changeId, conversationId) => {
      const key = `${vaultDir}\u0000${changeId}\u0000${conversationId}`
      const running = undoing.get(key)
      if (running) return running
      const end = activity.begin('note', vaultDir)
      if (typeof end !== 'function')
        return Promise.resolve({ ok: false, reason: mainT().noteRun.undoBusy })
      const result = withVaultGit(vaultDir, (): UndoResult => {
        try {
          return undoRun(vaultDir, changeId, conversationId)
        } catch (error) {
          console.error('undo failed', changeId, error)
          return { ok: false, reason: mainT().noteRun.undoFailed }
        } finally {
          end()
          undoing.delete(key)
        }
      })
      undoing.set(key, result)
      return result
    },

    recover: (vaultDir) =>
      withVaultGit(vaultDir, () => {
        const out: { conversationId: string; changes: ChangeSet }[] = []
        if (!existsSync(join(vaultDir, '.git'))) return out
        const { list, failed } = readAll(vaultDir)
        if (failed > 0)
          console.error(
            'unreadable note run records exist; finishing only the readable ones',
            vaultDir,
            failed
          )
        for (const record of list) {
          if (record.state !== 'running' || live.has(record.id)) continue
          const card = (changes: Partial<ChangeSet>): ChangeSet => ({
            id: record.id,
            files: [],
            blocked: [],
            interrupted: true,
            ...changes
          })
          try {
            // 실행 전 상태를 다 적기 전에 꺼졌다 — 엔진은 아직 돌지 않았다. 판정하면 모든 비추적 파일이
            // 새것으로 보이므로 기록만 지운다
            if (!record.captured) {
              dropRecord(vaultDir, record.id)
              continue
            }
            const changes = finishRecord(vaultDir, record, true) ?? card({})
            out.push({ conversationId: record.conversationId, changes })
          } catch (error) {
            console.error('could not finish interrupted note run', record.id, error)
            out.push({
              conversationId: record.conversationId,
              changes: card({ blocked: [mainT().noteRun.unchecked] })
            })
          }
        }
        return out
      }),

    has: (vaultDir, changeId) => readRecord(vaultDir, changeId) !== null,

    review: (vaultDir, changeId, conversationId, rel) =>
      withVaultGit(vaultDir, (): HunkReview => {
        try {
          const found = recordFile(vaultDir, changeId, conversationId, rel)
          if (found === null) return { unavailable: mainT().noteRun.undoGone }
          return reviewOf(vaultDir, found.record, found.file).review
        } catch (error) {
          console.error('could not split edits into hunks', rel, error)
          return { unavailable: mainT().noteRun.reviewNoBase }
        }
      }),

    // 되돌리기와 같은 활동을 잡는다 — 도는 노트 실행이 이 쓰기를 AI 변경으로 읽지 않게
    rejectHunk: (vaultDir, changeId, conversationId, rel, index, hash) => {
      const end = activity.begin('note', vaultDir)
      if (typeof end !== 'function')
        return Promise.resolve({ ok: false, reason: mainT().noteRun.undoBusy })
      return withVaultGit(vaultDir, (): HunkRejectResult => {
        try {
          return rejectRun(vaultDir, changeId, conversationId, rel, index, hash)
        } catch (error) {
          console.error('could not undo hunk', rel, error)
          return { ok: false, reason: mainT().noteRun.undoFailed }
        } finally {
          end()
        }
      })
    }
  }
}
