// 문서 하나의 "바뀐 곳" — 기준 시점 이후 바뀐 줄 범위와 지운 글.
// 줄 비교는 손으로 짓지 않는다: 추적 파일은 기준 커밋과, 비추적 노트는 실행 전 사본과 git 이 견준다.
// 기준은 "그 시각 이전 마지막 기록"이다 — 없는 시각을 지어내느니 더 오래된 기록을 쓰고,
// 그것도 없으면 그 기준을 끄고 이유를 말한다(없는 변경을 숨기는 것보다 넓게 보이는 쪽이 정직하다).
// 못 읽은 것은 절대 "바뀐 곳이 없다"로 내보내지 않는다 — 읽지 못했다고 말한다.
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  changedMidway,
  type ChangeSince,
  type DocChanges,
  type DocChangesResult
} from '../../shared/ipc-contract'
import { git, spawnGit } from '../git'
import { vaultFileOrNull } from '../vault/vault-scope'
import { createRunStore, type RunRecord } from './run-store'
import { mainT } from '../i18n'

export type DocChangesDeps = {
  /** 스냅샷 루트(userData/snapshots) — note-run 과 같은 자리 */
  root: () => string
  now?: () => number
}

const DAY = 24 * 60 * 60 * 1000
/** 로컬 diff 는 금방 끝난다 — 멈춘 git 을 10분 기다리지 않는다 */
const DIFF_TIMEOUT_MS = 30_000
const DIFF_CAP = 512 * 1024

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/**
 * `git diff -U0` 의 hunk 헤더를 줄 범위로 — 두 갈래(`<커밋>` 과 `--no-index`)가 같은 파서를 쓴다.
 * `@@ -a,b +c,d @@` 의 c·d 는 바뀐 뒤 파일의 줄이다. d 가 0 이면 지우기만 한 자리라 c 가 그 앞 줄이다.
 */
export const parseDiff = (out: string): Omit<DocChanges, 'hash'> => {
  const added: DocChanges['added'] = []
  const removed: DocChanges['removed'] = []
  let after = 0
  let pending: string[] = []
  const flush = (): void => {
    if (pending.length > 0) removed.push({ after, text: pending.join('\n') })
    pending = []
  }
  let inHunk = false
  for (const line of out.split('\n')) {
    const hunk = HUNK.exec(line)
    if (hunk) {
      flush()
      inHunk = true
      const from = Number(hunk[1])
      const count = hunk[2] === undefined ? 1 : Number(hunk[2])
      if (count > 0) added.push({ from, to: from + count - 1 })
      after = count > 0 ? from - 1 : from
      continue
    }
    // 파일 머리글(`--- a/x`)은 hunk 밖이라 지운 줄로 세지 않는다. CRLF 보관함의 `\r` 은 화면에 남기지 않는다
    if (inHunk && line.startsWith('-')) pending.push(line.slice(1).replace(/\r$/, ''))
  }
  flush()
  return { added, removed }
}

const startOfDay = (ms: number): number => {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** 없는 파일과 못 읽은 파일을 가른다 — 권한·입출력 실패를 "없다" 로 말하지 않게 */
const isFile = (full: string): boolean => {
  try {
    return statSync(full).isFile()
  } catch (error) {
    if ((error as { code?: unknown }).code !== 'ENOENT') {
      console.error('could not check the base copy', full, error)
    }
    return false
  }
}

/** 지금 디스크에 있는 내용의 해시 — 읽기 IPC(`WikiReadResult.hash`)와 같은 값. 못 읽으면 null */
const hashOf = (full: string): string | null => {
  try {
    return createHash('sha256').update(readFileSync(full, 'utf8')).digest('hex')
  } catch (error) {
    console.error('could not reread the document', full, error)
    return null
  }
}

/** 기준 기록이 없다 — 어느 기준을 골랐는지 그대로 말한다 */
const noBase = (since: 'today' | 'yesterday'): string =>
  since === 'today' ? mainT().noteRun.changes.noBaseToday : mainT().noteRun.changes.noBaseYesterday

const changedIn = (record: RunRecord, rel: string): 'created' | 'edited' | null =>
  record.changes?.files.find((file) => file.rel === rel)?.kind ?? null

/** 기준을 찾은 결과 — 못 찾은 것과 못 읽은 것을 가른다 */
type Base<T> = { at: T } | { missing: true } | { failed: true }

export const createDocChanges = (
  deps: DocChangesDeps
): ((vaultDir: string, rel: string, since: ChangeSince) => Promise<DocChangesResult>) => {
  const store = createRunStore(deps.root)
  const now = deps.now ?? Date.now

  const diff = async (
    vaultDir: string,
    full: string,
    args: string[],
    hash: string,
    noIndex: boolean
  ): Promise<DocChangesResult> => {
    // `--no-index` 는 차이가 있으면 1 로 끝난다 — 오류가 아니다. 다른 갈래에서 1 은 실패다
    const run = await spawnGit(vaultDir, args, {
      timeoutMs: DIFF_TIMEOUT_MS,
      okCodes: noIndex ? [0, 1] : [0],
      cap: DIFF_CAP
    })
    if (!run.ok) {
      console.error('could not diff the changes', args, run.stderr)
      return { unavailable: mainT().noteRun.changes.failed }
    }
    if (run.truncated) return { unavailable: mainT().noteRun.changes.tooBig }
    // `--no-index` 의 1 은 "다르다" 이자 "열지 못했다" 다 — 차이를 못 읽었으면 없다고 하지 않는다
    if (run.code === 1 && !run.stdout.includes('@@')) {
      console.error('read the changes but the diff is empty', args, run.stdout.slice(0, 200))
      return { unavailable: mainT().noteRun.changes.failed }
    }
    // 견주는 사이에 저장이 끼면 줄 번호는 새 내용, 해시는 옛 내용이 된다 — 그 짝은 내보내지 않는다
    if (hashOf(full) !== hash) {
      console.error('document changed while diffing', args)
      return { unavailable: changedMidway() }
    }
    return { ...parseDiff(run.stdout), hash }
  }

  /** 그 시각 이전 마지막 커밋 */
  const commitBefore = (vaultDir: string, cutoff: number): Base<string> => {
    try {
      const out = git(vaultDir, [
        'rev-list',
        '-1',
        `--before=${new Date(cutoff).toISOString()}`,
        'HEAD'
      ]).trim()
      return out === '' ? { missing: true } : { at: out }
    } catch (error) {
      // 커밋이 하나도 없는 보관함은 HEAD 가 없어 실패한다 — 그것만 "기록 없음"(문구가 아니라 HEAD 로 가린다)
      try {
        git(vaultDir, ['rev-parse', '--verify', '--quiet', 'HEAD'])
      } catch {
        return { missing: true }
      }
      console.error('could not find the base commit', error)
      return { failed: true }
    }
  }

  const hasCommit = (vaultDir: string, commit: string): Base<string> => {
    try {
      git(vaultDir, ['cat-file', '-e', `${commit}^{commit}`])
      return { at: commit }
    } catch (error) {
      if ((error as { status?: unknown }).status === 1) return { missing: true }
      console.error('could not check the base commit', commit, error)
      return { failed: true }
    }
  }

  /** 비추적 노트의 기준 — 실행 전 사본, 아니면 그 사이에 생긴 파일인지 */
  const snapshotIn = (vaultDir: string, record: RunRecord, rel: string): Base<string | 'new'> => {
    const file = store.snapshotFile(vaultDir, record.id, rel)
    if (isFile(file)) return { at: file }
    return changedIn(record, rel) === 'created' ? { at: 'new' } : { missing: true }
  }

  const snapshotBefore = (vaultDir: string, rel: string, cutoff: number): Base<string | 'new'> => {
    const { list, failed } = store.readAll(vaultDir)
    // 못 읽은 기록이 하나라도 있으면 그것이 더 가까운 기준이었을 수 있다 — 넘겨짚지 않는다
    if (failed > 0) return { failed: true }
    const done = list.filter((record) => record.state === 'done')
    for (const record of done
      .filter((r) => r.startedAt <= cutoff)
      .sort((a, b) => b.startedAt - a.startedAt)) {
      const file = store.snapshotFile(vaultDir, record.id, rel)
      if (isFile(file)) return { at: file }
    }
    // 기준 시각 뒤에 처음으로 이 파일을 건드린 실행이 "만들었다"면 그때는 없던 파일이다
    const first = done
      .filter((r) => r.startedAt > cutoff && changedIn(r, rel) !== null)
      .sort((a, b) => a.startedAt - b.startedAt)[0]
    return first && changedIn(first, rel) === 'created' ? { at: 'new' } : { missing: true }
  }

  return async (vaultDir, rel, since) => {
    if (vaultFileOrNull(vaultDir, rel) === null)
      return { unavailable: mainT().noteRun.changes.notFound }
    const full = join(vaultDir, rel)
    let text: string
    try {
      text = readFileSync(full, 'utf8')
    } catch (error) {
      if ((error as { code?: unknown }).code === 'ENOENT')
        return { unavailable: mainT().noteRun.changes.notFound }
      console.error('could not open the document to show changes', rel, error)
      return { unavailable: mainT().noteRun.changes.failed }
    }
    // 리더가 그리고 있는 내용과 같은 것을 견줬는지 renderer 가 가린다
    const hash = createHash('sha256').update(text).digest('hex')

    const day = typeof since === 'object' ? null : since
    let record: RunRecord | null = null
    if (day === null && typeof since === 'object') {
      const read = store.readRecordOr(vaultDir, since.change)
      if ('failed' in read) return { unavailable: mainT().noteRun.changes.failed }
      if ('gone' in read) return { unavailable: mainT().noteRun.changes.gone }
      record = read.record
    }
    const cutoff = since === 'yesterday' ? startOfDay(now()) - DAY : startOfDay(now())
    /** 기준을 못 찾았을 때의 말 — 답 기준이면 기록이 지워진 것이고, 날짜 기준이면 그때 기록이 없는 것이다 */
    const missing = (): DocChangesResult => ({
      unavailable: day === null ? mainT().noteRun.changes.gone : noBase(day)
    })

    let tracked: boolean
    try {
      tracked = git(vaultDir, ['ls-files', '-z', '--', `:(literal)${rel}`]).length > 0
    } catch (error) {
      console.error('could not read whether the file is tracked', rel, error)
      return { unavailable: mainT().noteRun.changes.failed }
    }

    if (tracked) {
      const base = record ? hasCommit(vaultDir, record.base) : commitBefore(vaultDir, cutoff)
      if ('failed' in base) return { unavailable: mainT().noteRun.changes.failed }
      if ('missing' in base) return missing()
      return diff(
        vaultDir,
        full,
        ['diff', '--no-color', '-U0', base.at, '--', `:(literal)${rel}`],
        hash,
        false
      )
    }

    const base = record ? snapshotIn(vaultDir, record, rel) : snapshotBefore(vaultDir, rel, cutoff)
    if ('failed' in base) return { unavailable: mainT().noteRun.changes.failed }
    if ('missing' in base) return missing()
    if (base.at === 'new') {
      // 기준 시점에 없던 파일 — 전부 더한 줄이다
      const lines = text === '' ? 0 : text.replace(/\n$/, '').split('\n').length
      return { added: lines === 0 ? [] : [{ from: 1, to: lines }], removed: [], hash }
    }
    return diff(
      vaultDir,
      full,
      ['diff', '--no-color', '--no-index', '-U0', '--', base.at, full],
      hash,
      true
    )
  }
}
