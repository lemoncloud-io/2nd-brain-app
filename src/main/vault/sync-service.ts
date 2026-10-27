// 팀 변경 받기 — 앱이 알아서 받고(시작·보관함 전환·위키화 직전·올리기 직전) 사람이 버튼으로도 받는다.
// git 어휘는 이 파일 밖으로 나가지 않는다: 화면은 "팀 변경 N건" 과 충돌 파일 목록만 본다.
import { existsSync, lstatSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, needsGithubLogin, spawnGit } from '../git'
import { appIdentity } from './app-identity'
import { fetchFailed } from './sync-failure'
import {
  done,
  keptAsideName,
  lines,
  NO_REMOTE_REF,
  stderrOf,
  zeroSplit,
  type ConflictPick
} from './sync-text'
import { INGEST_LOCK } from '../engine/cli-process'
import {
  defaultBranchOf,
  foreignLanded,
  isWorkBranch,
  landedIn,
  strandedCommits
} from '../engine/work-branch'
import type { RestoreResult } from '../../shared/ipc-contract'
import { readRemote } from './remote-service'
import { isVaultDoc } from './vault-scope'
import { vaultActivity } from './vault-activity'
import { withVaultGit } from './vault-queue'
import { mainT } from '../i18n'

/**
 * 받지 않고 지나간 사유 — 화면이 "받을 게 없었다" 와 가려 말한다.
 * signed-out = GitHub 저장소에 연결돼 있는데 앱 GitHub 로그인이 없다(예전 브라우저 로그인으로 쓰던 사람의 첫 실행) ·
 * review-pending = 승인 대기 중인 위키화 · busy = 위키화·확정이 보관함을 쓰는 중 ·
 * stuck = 브랜치 밖·되감기 중처럼 앱이 스스로 풀지 않는 상태 · switch-blocked = 팀 최신으로 옮기려는데 새 파일이 막는다
 */
export type SyncSkip =
  'no-remote' | 'signed-out' | 'review-pending' | 'busy' | 'stuck' | 'switch-blocked'

export type SyncOutcome =
  | {
      ok: true
      received: number
      conflicts: string[]
      skipped: SyncSkip | null
      /** 기본 줄기가 아닌 곳에 남아 있으면 그 이름 — 화면은 "자세히" 안에서만 보여 준다 */
      held: string | null
      /**
       * 받기가 팀 것에 맞춘 길 — 내 커밋 없이 앞으로 감았는지(forward), 되감기(reset)했는지, 합치기(merge)로 받았는지.
       * 받지 않았으면 null
       */
      via: 'forward' | 'rewind' | 'merge' | null
    }
  | { ok: false; reason: string }

const REMOTE = 'origin'

/** 원격에 줄기가 하나도 없다 — 읽지 못했으면 비었다고 하지 않는다 */
const remoteIsEmpty = async (vaultDir: string): Promise<boolean> => {
  const heads = await spawnGit(vaultDir, ['ls-remote', '--heads', REMOTE])
  return heads.ok && heads.stdout.trim() === ''
}

/**
 * 고르기를 기다리는 파일 — 병합이 멈춘 채로 남아 있으면 앱을 다시 켜도 이 목록이 나온다.
 * git 기록이 없는 보관함(USB·압축으로 옮겨 온 것)에서는 물을 수 없다 — 그때는 기다리는 충돌도 없다.
 */
const pendingConflicts = (vaultDir: string): string[] => {
  try {
    return lines(git(vaultDir, ['diff', '--name-only', '--diff-filter=U']))
  } catch {
    return []
  }
}

/** 되감기·병합이 멈춘 채 남아 있나 — 충돌 고르기는 앞에서 따로 잡는다 */
export const midOperation = (vaultDir: string): boolean => {
  const gitDir = git(vaultDir, ['rev-parse', '--absolute-git-dir']).trim()
  return ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'].some(
    (name) => existsSync(join(gitDir, name))
  )
}

/**
 * 지금 앱이 커밋하면 안 되는 상태의 사유 — 고르기를 기다리는 충돌·멈춘 병합 중에는 경로 지정 커밋이 실패하고,
 * 그 전에 한 `git add` 가 충돌 표식째 고르기를 끝낸 것으로 만든다. 괜찮으면 null
 */
export const commitBlockedReason = (vaultDir: string, action: string): string | null => {
  if (pendingConflicts(vaultDir).length > 0) {
    return mainT().syncMain.conflictPending(action)
  }
  if (midOperation(vaultDir)) {
    return mainT().syncMain.midMerge(action)
  }
  return null
}

/**
 * `save:` 커밋에 넣을 수 있는 경로인가 — 일자로 된 파일(수정)과 지운 파일(삭제)만 된다.
 * 심링크·폴더·서브모듈 자리(심링크가 실제 폴더로 풀린 경우 포함)는 git 이 add·commit 을 통째로
 * 실패시키므로 뺀다. 지운 파일은 lstat 이 던진다 — 삭제 스테이징은 되니 받는다
 */
const committable = (vaultDir: string, rel: string): boolean => {
  try {
    return lstatSync(join(vaultDir, rel)).isFile()
  } catch {
    return true
  }
}

/**
 * 받기 전 자동 저장 — 추적 중인 문서의 수정·삭제만 경로를 지정해 커밋한다. 병합을 막는 것이 그것뿐이다.
 * 커밋 전 파일(넣어 둔 자료·스크린샷)은 건드리지 않는다.
 */
export const saveEdits = (vaultDir: string): void => {
  const changed = zeroSplit(git(vaultDir, ['diff', '-z', '--name-only', '--no-renames', 'HEAD']))
  // git 자체가 커밋에 넣지 못하는 경로는 뺀다 — 서브모듈·심링크가 실제 폴더로 풀린 자리 등.
  // 그런 경로를 add·commit 에 넣으면 git 이 통째로 실패한다("does not have a commit checked out").
  // 그런 변경은 남긴다 — 브랜치를 옮겨야 할 때 막힌 파일 이름을 말하는 쪽이 그 일을 한다
  const paths = changed.filter((rel) => committable(vaultDir, rel))
  if (paths.length === 0) return
  // 이 컴퓨터의 시각 — "save: 2026-09-17 09:30"
  const stamp = new Date().toLocaleString('sv-SE').slice(0, 16)
  // 파일명의 `*`·`[` 를 패턴으로 읽으면 커밋 전 파일까지 딸려 온다
  git(vaultDir, ['--literal-pathspecs', 'add', '--', ...paths])
  git(vaultDir, [
    '--literal-pathspecs',
    ...appIdentity(),
    'commit',
    '-q',
    '-m',
    `save: ${stamp}`,
    '--',
    ...paths
  ])
}

/** 위키화·확정이 보관함을 쓰는 중인가 */
const locked = (vaultDir: string): boolean =>
  vaultActivity.editLock(vaultDir) !== null || existsSync(join(vaultDir, INGEST_LOCK))

type Merged = { ok: true; conflicts: string[] } | { ok: false; reason: string }

const mergeFrom = (vaultDir: string, source: string): Merged => {
  try {
    git(vaultDir, [...appIdentity(), 'merge', '--no-edit', source])
    return { ok: true, conflicts: [] }
  } catch (error) {
    const conflicts = pendingConflicts(vaultDir)
    if (conflicts.length > 0) return { ok: true, conflicts }
    console.error('team merge failed', source, error)
    return {
      ok: false,
      reason: mainT().syncMain.mergeFailed
    }
  }
}

const count = (vaultDir: string, range: string): number =>
  Number(lines(git(vaultDir, ['rev-list', '--count', range]))[0] ?? '0')

/** 추적 중 파일이 깨끗한가 — 되감기 직전 판정. Obsidian 은 다른 프로세스라 매번 다시 본다 */
const trackedClean = (vaultDir: string): boolean =>
  git(vaultDir, ['status', '--porcelain', '--untracked-files=no']).trim() === ''

/** 기본 줄기에서 받는다 — 내 커밋이 전부 squash 로 팀에 들어갔으면 충돌로 올리지 않고 팀 것에 맞춘다 */
const receiveOnDefault = (vaultDir: string, branch: string): SyncOutcome => {
  const upstream = `${REMOTE}/${branch}`
  const received = count(vaultDir, `${branch}..${upstream}`)
  if (received === 0) return done(0, [], null, null, null)
  // 되감기는 기본 줄기에서만, 내 커밋이 있고 그 내용이 전부 팀에 있을 때만이다.
  // 자동 저장한 편집은 팀에 없으므로 여기로 오지 않는다. 저장과 이 줄 사이에 JS 쪽 대기는 없지만
  // Obsidian 은 다른 프로세스라 그 틈에도 쓸 수 있다 — 되감기 직전에 한 번 더 본다
  const ahead = count(vaultDir, `${upstream}..${branch}`)
  const rewindable = ahead > 0 && landedIn(vaultDir, branch, upstream) && trackedClean(vaultDir)
  // 되감기 직전 재확인 — 판정과 reset 사이 Obsidian 쓰기를 거른다
  if (rewindable && trackedClean(vaultDir)) {
    git(vaultDir, ['reset', '--hard', upstream])
    return done(received, [], null, null, 'rewind')
  }
  if (replayPastLanded(vaultDir, branch, upstream)) return done(received, [], null, null, 'rewind')
  const merged = mergeFrom(vaultDir, upstream)
  if (!merged.ok) return merged
  // 내 커밋이 없으면 git 은 앞으로 감기만 한다 — 합친 것이 없으니 화면이 "합치기로" 라고 말하면 안 된다
  return done(received, merged.conflicts, null, null, ahead > 0 ? 'merge' : 'forward')
}

/**
 * 앱이 팀에 올린 요청(`app/…` — 내 수정·위키화) 중 팀에 이미 들어간 가장 나중 것. 기본 줄기의 조상이어야 한다.
 * 팀은 squash 로 머지한다 — 그 요청의 커밋은 팀 최신의 조상이 아니어서 그대로 합치면 내 변경끼리 충돌한다.
 * 그 뒤에 아직 팀 확인 중인 요청이 또 얹혀 있으면 null — 다시 얹으면 그 요청의 커밋이 새 해시가 되어
 * 기본 줄기가 그 요청을 품지 않게 되고, 다음 보내기가 같은 내용을 새 요청으로 또 연다
 */
const landedRequest = (vaultDir: string, branch: string, upstream: string): string | null => {
  const onBranch = lines(
    git(vaultDir, [
      'for-each-ref',
      '--format=%(refname)',
      `refs/remotes/${REMOTE}/app/`,
      'refs/heads/app/'
    ])
  ).filter(
    (ref) =>
      answers(vaultDir, ['merge-base', '--is-ancestor', ref, branch]) &&
      !answers(vaultDir, ['merge-base', '--is-ancestor', ref, upstream])
  )
  const landed = onBranch.filter((ref) => landedIn(vaultDir, ref, upstream))
  const size = (ref: string): number => count(vaultDir, ref)
  const newest = landed.sort((a, b) => size(b) - size(a))[0]
  if (newest === undefined) return null
  const waitingPast = onBranch.some(
    (ref) =>
      !landed.includes(ref) && !answers(vaultDir, ['merge-base', '--is-ancestor', ref, newest])
  )
  return waitingPast ? null : newest
}

/** git 이 스스로 푼 병합인가 — 두 부모를 다시 합친 결과가 그 커밋과 같다(사람이 고른 것이 없다) */
const cleanMerge = (vaultDir: string, merge: string): boolean => {
  const parents = git(vaultDir, ['rev-list', '--parents', '-n', '1', merge])
    .trim()
    .split(' ')
    .slice(1)
  if (parents.length !== 2) return false
  try {
    const tree = git(vaultDir, ['merge-tree', '--write-tree', parents[0]!, parents[1]!]).trim()
    return tree.split('\n')[0] === git(vaultDir, ['rev-parse', `${merge}^{tree}`]).trim()
  } catch {
    // exit 1 = 충돌 — 사람이 골랐다
    return false
  }
}

/**
 * 팀에 들어간 요청 뒤에 쌓인 내 커밋만 팀 최신 위로 다시 얹는다 — 들어간 것은 팀 것으로 맞추고 새 것만 남긴다.
 * 얹다가 걸리면 원래대로 돌려 두고 false — 부르는 쪽이 평소처럼 합친다(그때 충돌은 진짜 충돌이다)
 */
const replayPastLanded = (vaultDir: string, branch: string, upstream: string): boolean => {
  const landed = landedRequest(vaultDir, branch, upstream)
  if (landed === null) return false
  if (git(vaultDir, ['status', '--porcelain', '--untracked-files=no']).trim() !== '') return false
  // 팀 최신에 이미 있는 커밋(받기가 합쳐 온 동료 커밋)과 병합 커밋은 빼고, 요청 뒤 내 커밋만
  const mine = lines(
    git(vaultDir, ['rev-list', '--reverse', '--no-merges', branch, `^${landed}`, `^${upstream}`])
  )
  // 병합 커밋은 버린다 — 손으로 고른 결과(충돌 고르기)가 든 병합이면 버리는 순간 사라지므로 그때는 얹지 않는다
  const merges = lines(
    git(vaultDir, ['rev-list', '--merges', branch, `^${landed}`, `^${upstream}`])
  )
  if (!merges.every((merge) => cleanMerge(vaultDir, merge))) return false
  const before = git(vaultDir, ['rev-parse', 'HEAD']).trim()
  // 되감기 직전 재확인 — 위 mine·merges 계산과 reset 사이 Obsidian 쓰기를 거른다
  if (!trackedClean(vaultDir)) return false
  try {
    git(vaultDir, ['reset', '-q', '--hard', upstream])
    if (mine.length > 0) {
      git(vaultDir, [...appIdentity(), 'cherry-pick', '--empty=drop', ...mine])
    }
    return true
  } catch (error) {
    console.error('could not replay commits after the merged request', error)
    try {
      git(vaultDir, ['cherry-pick', '--abort'])
    } catch {
      // 얹기 전에 멈췄으면 끝낼 것이 없다
    }
    git(vaultDir, ['reset', '-q', '--hard', before])
    return false
  }
}

/**
 * 아직 팀에 안 들어간 작업 브랜치에 남는다 — 동료가 같은 브랜치에 올린 것과 팀 최신을 합친다.
 * 여기서는 되감지 않는다. 합치기만 한다.
 */
const receiveOnHeld = (vaultDir: string, held: string, sources: string[]): SyncOutcome => {
  let received = 0
  for (const source of sources) {
    const incoming = count(vaultDir, `HEAD..${source}`)
    if (incoming === 0) continue
    received += incoming
    const merged = mergeFrom(vaultDir, source)
    if (!merged.ok) return merged
    if (merged.conflicts.length > 0) return done(received, merged.conflicts, held, null, 'merge')
  }
  return done(received, [], held, null, received > 0 ? 'merge' : null)
}

/**
 * 어제 브랜치에서 기본 줄기로 돌아가며 앱이 그 브랜치에 남긴 커밋(`carry`)을 챙겨 온다.
 * 챙기지 못하면(같은 줄을 팀 확인 중인 작업이 쥐고 있다) 원래 브랜치로 돌아가 'carry-failed' 다 —
 * 앱 커밋을 숨은 브랜치에 두고 떠나지 않는다.
 */
const returnHome = (
  vaultDir: string,
  held: string,
  defaultBranch: string,
  upstream: string,
  carry: string[]
): 'moved' | 'switch-blocked' | 'carry-failed' => {
  try {
    git(vaultDir, ['switch', defaultBranch])
  } catch (error) {
    // 커밋 전 새 파일이 기본 줄기의 문서와 이름이 겹친다 — 지우지 않고 그 자리에 남는다
    if (/untracked working tree files would be overwritten/i.test(stderrOf(error)))
      return 'switch-blocked'
    throw error
  }
  if (carry.length === 0) return 'moved'
  // 챙겨 올 편집이 팀 최신 문서를 고친 것일 수 있다 — 내 커밋이 없는 기본 줄기면 팀 최신으로 먼저 당긴다
  if (upstream !== defaultBranch && count(vaultDir, `${upstream}..${defaultBranch}`) === 0) {
    git(vaultDir, ['merge', '--ff-only', '-q', upstream])
  }
  try {
    // 팀이 squash 로 머지하면 앱 커밋의 변경도 이미 들어와 있다 — 빈 커밋이 되는 것은 버리고 넘어간다
    git(vaultDir, [...appIdentity(), 'cherry-pick', '--empty=drop', ...carry])
    return 'moved'
  } catch (error) {
    console.error('could not carry app commits onto the default branch', error)
    git(vaultDir, ['cherry-pick', '--abort'])
    // checkout 은 브랜치 이름도, 이름 없이 멈춰 있던 커밋도 받는다
    git(vaultDir, ['checkout', '-q', held])
    return 'carry-failed'
  }
}

/**
 * 팀 변경을 받는다. 받을 것이 없거나 연결이 없으면 조용히 0건이다 — 앱 시작을 막지 않는다.
 * 어제의 작업 브랜치에 남아 있으면 스스로 푼다: 그 내용이 팀에 들어갔으면 기본 줄기로 옮기고(원래 브랜치는 남긴다),
 * 아직이면 그 자리에서 팀 최신을 합친다. 저장 안 한 편집은 먼저 저장한다.
 * 충돌이 나면 고르기를 기다리는 상태 그대로 두고 파일 목록을 돌려준다(해소는 `resolveConflict`).
 * fetchTimeoutMs 를 주면 가져오기가 그 안에 끝나지 않을 때 실패로 끝낸다 — 위키화 직전 받기가
 * 멈춘 네트워크에 붙잡히지 않게. 주지 않으면 10분 기본값이다.
 */
export const syncVault = (
  vaultDir: string,
  opts: { fetchTimeoutMs?: number } = {}
): Promise<SyncOutcome> => withVaultGit(vaultDir, () => receive(vaultDir, opts))

/** 지금 브랜치 이름 — git 기록이 없는 보관함(USB·압축으로 옮겨 온 것)이면 null */
const currentBranch = (vaultDir: string): string | null => {
  try {
    return git(vaultDir, ['branch', '--show-current']).trim()
  } catch (error) {
    if (existsSync(join(vaultDir, '.git')))
      console.error('could not read the current branch', error)
    return null
  }
}

const receive = async (
  vaultDir: string,
  opts: { fetchTimeoutMs?: number } = {}
): Promise<SyncOutcome> => {
  const current = currentBranch(vaultDir)
  const defaultBranch = current === null ? null : defaultBranchOf(vaultDir)
  const held = current === null || current === defaultBranch ? null : current || null
  const remote = readRemote(vaultDir)
  if (!remote) return done(0, [], held, 'no-remote', null)
  // 고르기를 기다리는 충돌이 남아 있으면 그것부터다 — 앱을 다시 켜도 같은 목록을 말한다.
  // 자동 저장도 하지 않는다 — 충돌 표식을 커밋하면 안 된다
  const pending = pendingConflicts(vaultDir)
  if (pending.length > 0) return done(0, pending, held, null, null)
  // 받으러 나가 로그인 실패를 읽는 대신 다시 연결하라고 먼저 말한다
  if (needsGithubLogin(remote.url)) return done(0, [], held, 'signed-out', null)
  if (!defaultBranch || !current || midOperation(vaultDir)) {
    return done(0, [], held, 'stuck', null)
  }
  // 승인 대기 중인 위키화는 사람이 확정할 때까지 그대로 둔다
  if (isWorkBranch(current)) return done(0, [], held, 'review-pending', null)
  if (locked(vaultDir)) return done(0, [], held, 'busy', null)

  // 네트워크를 먼저 끝낸다. 자동 저장부터 병합·되감기까지는 기다림 없이 한 번에 돈다 —
  // 저장과 되감기 사이에 틈이 있으면 그 사이 Obsidian 이 고친 편집을 되감기가 말없이 지운다
  const fetchOpts = opts.fetchTimeoutMs === undefined ? {} : { timeoutMs: opts.fetchTimeoutMs }
  const fetched = await spawnGit(vaultDir, ['fetch', REMOTE, defaultBranch], fetchOpts)
  // 팀 저장소가 아직 비어 있다(만들고 첫 올리기 전) — 받을 것이 없는 것이지 실패가 아니다.
  // 실패로 돌려주면 올리기 직전 받기가 막아 첫 올리기를 다시 할 길이 없다. 다른 줄기가 있는데 기본 줄기만
  // 없으면(이름을 바꿨거나 지웠다) 실패로 알린다 — 조용히 넘기면 다음 올리기가 팀 기록을 가른다
  if (
    !fetched.ok &&
    fetched.failure === 'exit' &&
    NO_REMOTE_REF.test(fetched.stderr) &&
    (await remoteIsEmpty(vaultDir))
  ) {
    return done(0, [], held, null, null)
  }
  if (!fetched.ok) return fetchFailed(fetched)
  const own = held === null ? null : await spawnGit(vaultDir, ['fetch', REMOTE, held], fetchOpts)
  // 원격에 그 브랜치가 없으면(올린 적 없음·머지 뒤 지움) 팀 최신만 합친다. 연결 실패는 알린다 —
  // 조용히 빼면 동료가 그 브랜치에 올린 것이 빠진 채 "받았다" 가 된다
  if (own && !own.ok && !NO_REMOTE_REF.test(own.stderr)) {
    return fetchFailed(own)
  }
  const ownFetched = own?.ok === true
  // 기다리는 동안 위키화·확정이 시작됐을 수 있다
  if (locked(vaultDir)) return done(0, [], held, 'busy', null)

  const upstream = `${REMOTE}/${defaultBranch}`
  if (held === null) {
    // 받을 것이 없으면 자동 저장도 하지 않는다 — 앱 밖에서 하던 작업을 말없이 커밋해 보낼 목록에 섞지 않게
    if (count(vaultDir, `${defaultBranch}..${upstream}`) === 0) return done(0, [], null, null, null)
    saveEdits(vaultDir)
    return receiveOnDefault(vaultDir, defaultBranch)
  }
  saveEdits(vaultDir)
  const heldSources = ownFetched ? [`${REMOTE}/${held}`, upstream] : [upstream]
  const { carry, foreign } = strandedCommits(vaultDir, held, upstream)
  if (!foreignLanded(vaultDir, foreign, upstream)) {
    return receiveOnHeld(vaultDir, held, heldSources)
  }
  // 돌아가며 기본 줄기를 팀 최신으로 당기면 그만큼이 받은 것이다 — 뒤에서 세면 0건으로 읽힌다
  const behind = count(vaultDir, `${defaultBranch}..${upstream}`)
  let moved: ReturnType<typeof returnHome>
  try {
    moved = returnHome(vaultDir, held, defaultBranch, upstream, carry)
  } catch (error) {
    console.error('switch to the default branch failed', error)
    return {
      ok: false,
      reason: mainT().syncMain.switchFailed
    }
  }
  if (moved === 'switch-blocked') return done(0, [], held, 'switch-blocked', null)
  if (moved === 'carry-failed') return receiveOnHeld(vaultDir, held, heldSources)
  const home = receiveOnDefault(vaultDir, defaultBranch)
  return home.ok ? { ...home, received: Math.max(home.received, behind) } : home
}

/** 커밋들이 바꾼 파일(보관함 상대 경로) — 무엇이 옮겨 가고 무엇이 잠시 안 보이는지 이름으로 말한다 */
const touchedBy = (vaultDir: string, refs: string[]): string[] => {
  const files = new Set<string>()
  for (const ref of refs) {
    for (const file of zeroSplit(
      git(vaultDir, ['diff-tree', '-z', '--no-commit-id', '--name-only', '-r', '--no-renames', ref])
    )) {
      files.add(file)
    }
  }
  return [...files].sort()
}

/** git 이 exit 1 로 "아니다" 라고 답하는 질문 — 그 밖의 실패는 던진다 */
const answers = (vaultDir: string, args: string[]): boolean => {
  try {
    git(vaultDir, args)
    return true
  } catch (error) {
    if ((error as { status?: number }).status === 1) return false
    throw error
  }
}

const hasRef = (vaultDir: string, ref: string): boolean =>
  answers(vaultDir, ['rev-parse', '--verify', '--quiet', ref])

/**
 * 설정의 "보관함 상태 되돌리기" — 기본 줄기로 돌아간다. 무엇도 숨은 브랜치에 두고 떠나지 않는다:
 * 앱이 남긴 편집은 챙겨 오고, 팀이 확인 중인 작업(올려 둔 브랜치)은 무엇이 잠시 안 보이게 되는지
 * 먼저 돌려준 뒤 `confirmed` 로 다시 불렀을 때만 떠난다. 이 컴퓨터에만 있는 남의 작업이 있으면 거절한다.
 */
export const restoreVault = (vaultDir: string, confirmed: boolean): Promise<RestoreResult> =>
  withVaultGit(vaultDir, () => restore(vaultDir, confirmed))

const refused = (reason: string): RestoreResult => ({ status: 'refused', reason })

const restore = async (vaultDir: string, confirmed: boolean): Promise<RestoreResult> => {
  const current = currentBranch(vaultDir)
  const defaultBranch = current === null ? null : defaultBranchOf(vaultDir)
  if (current === null || !defaultBranch) return refused(mainT().mainErrors.noDefaultBranch)
  if (current === defaultBranch) return { status: 'done', carried: [], awaiting: [] }
  if (isWorkBranch(current)) {
    return refused(mainT().syncMain.restoreDraft)
  }
  if (pendingConflicts(vaultDir).length > 0) {
    return refused(mainT().syncMain.restorePick)
  }
  if (midOperation(vaultDir)) {
    return refused(mainT().syncMain.restoreForeign)
  }
  if (locked(vaultDir)) {
    return refused(mainT().syncMain.restoreBusy)
  }
  // 브랜치 이름이 없으면(특정 커밋에 멈춰 있음) 그 커밋을 그대로 가리킨다
  const detached = current === ''
  const held = detached ? git(vaultDir, ['rev-parse', 'HEAD']).trim() : current
  const remote = readRemote(vaultDir) !== null
  // 팀에 들어갔는지를 최신으로 판정한다 — 연결이 없거나 끊겨도 마지막으로 받은 기록으로 계속한다
  if (remote) {
    await spawnGit(vaultDir, ['fetch', REMOTE, defaultBranch])
    if (!detached) await spawnGit(vaultDir, ['fetch', REMOTE, held])
  }
  if (locked(vaultDir)) {
    return refused(mainT().syncMain.restoreBusy)
  }
  saveEdits(vaultDir)
  const upstream =
    remote && hasRef(vaultDir, `${REMOTE}/${defaultBranch}`)
      ? `${REMOTE}/${defaultBranch}`
      : defaultBranch
  const { carry, foreign } = strandedCommits(vaultDir, held, upstream)
  const carried = touchedBy(vaultDir, carry)
  const landed = foreignLanded(vaultDir, foreign, upstream)
  const awaiting = landed ? [] : touchedBy(vaultDir, foreign)
  if (!landed) {
    const shared = !detached && hasRef(vaultDir, `${REMOTE}/${held}`)
    const localOnly = foreign.filter(
      (hash) =>
        !shared || !answers(vaultDir, ['merge-base', '--is-ancestor', hash, `${REMOTE}/${held}`])
    )
    if (localOnly.length > 0) {
      return refused(mainT().syncMain.restoreLocal(touchedBy(vaultDir, localOnly).join(', ')))
    }
    if (!confirmed) return { status: 'confirm', carried, awaiting }
  }
  const moved = returnHome(vaultDir, held, defaultBranch, upstream, carry)
  if (moved === 'switch-blocked') {
    return refused(mainT().syncMain.restoreSwitch)
  }
  if (moved === 'carry-failed') {
    return refused(mainT().syncMain.restoreCarry)
  }
  return { status: 'done', carried, awaiting }
}

/**
 * 아직 팀에 올리지 않은 내 작업 수 — "내 작업이 어디 있나" 에 답하는 숫자다.
 * 연결이 없거나 아직 한 번도 올린 적 없으면 셀 기준이 없다 — 0 이다.
 */
export const unpushedCount = async (vaultDir: string): Promise<number> => {
  if (!readRemote(vaultDir)) return 0
  const branch = defaultBranchOf(vaultDir)
  if (!branch) return 0
  // 문서를 저장할 때마다 부르는 자리다 — 동기 git 은 그동안 main 프로세스를 통째로 세운다
  const run = await spawnGit(vaultDir, ['rev-list', '--count', `${REMOTE}/${branch}..${branch}`])
  // 셀 수 없으면 0 — 아직 한 번도 올리지 않은 저장소가 대표적이고, 손상·권한 실패도 여기로 온다
  if (!run.ok) return 0
  return Number(lines(run.stdout)[0] ?? '0')
}

/**
 * 팀에 새로 올라온 것이 있는지 가져와 두기만 한다 — 합치지 않는다. 받기는 사람이 누를 때 `syncVault` 가 한다.
 * 연결이 없거나 가져오지 못하면(오프라인) 조용히 넘어간다 — 다음에 다시 본다.
 */
export const lookForTeamChanges = (vaultDir: string): Promise<void> =>
  withVaultGit(vaultDir, async () => {
    const branch = defaultBranchOf(vaultDir)
    if (!branch || !readRemote(vaultDir)) return
    const run = await spawnGit(vaultDir, ['fetch', REMOTE, branch], { timeoutMs: 60_000 })
    // 로그인 전이면 띄우지도 않았다 — 받기 줄이 다시 연결을 말한다
    if (!run.ok && run.failure !== 'login') console.error('team change check failed', run.stderr)
  })

/** 팀에 올라왔는데 아직 안 받은 변경 수 — 마지막으로 가져온 것과 지금 보관함을 댄다(네트워크 없음) */
export const unreceivedCount = async (vaultDir: string): Promise<number> => {
  if (!readRemote(vaultDir)) return 0
  const branch = defaultBranchOf(vaultDir)
  if (!branch) return 0
  // HEAD 기준 — 어제 작업에 남아 팀 최신을 합쳐 두었으면 그것도 받은 것이다
  const run = await spawnGit(vaultDir, ['rev-list', '--count', `HEAD..${REMOTE}/${branch}`])
  if (!run.ok) return 0
  return Number(lines(run.stdout)[0] ?? '0')
}

/** 안 올린 작업이 바꾼 파일 — 올리기 전에 이름을 보여 준다. 앱이 자동 저장한 편집도 여기로 나간다 */
export const unpushedFiles = async (vaultDir: string): Promise<string[]> => {
  if (!readRemote(vaultDir)) return []
  const branch = defaultBranchOf(vaultDir)
  if (!branch) return []
  const run = await spawnGit(vaultDir, [
    'diff',
    '-z',
    '--name-only',
    `${REMOTE}/${branch}...${branch}`
  ])
  if (!run.ok) return []
  return zeroSplit(run.stdout)
}

/**
 * 앱 밖(Obsidian 등)에서 새로 만들어 git 이 아직 모르는 문서 — 자동 저장은 이미 있던 문서의 수정만 챙기므로
 * 이것들은 사람이 고르지 않으면 팀에 가지 않는다. `.gitignore` 가 막는 것(개인 노트)과 문서가 아닌 것은 뺀다.
 */
export const newDocs = async (vaultDir: string): Promise<string[]> => {
  if (!readRemote(vaultDir)) return []
  const run = await spawnGit(vaultDir, ['ls-files', '-z', '--others', '--exclude-standard'], {
    cap: 200_000
  })
  if (!run.ok || run.truncated) return []
  return zeroSplit(run.stdout).filter(isVaultDoc).sort()
}

/** 사람이 고른 새 문서를 앱 커밋으로 저장한다 — 지금도 새 문서 목록에 있는 것만. 막히면 그 사유, 아니면 null */
export const commitNewDocs = async (vaultDir: string, picked: string[]): Promise<string | null> => {
  const known = new Set(await newDocs(vaultDir))
  const paths = picked.filter((path) => known.has(path))
  if (paths.length === 0) return null
  const blocked = commitBlockedReason(vaultDir, mainT().mainErrors.thenSend)
  if (blocked) return blocked
  // ui-hangul-ignore: 볼트 커밋 제목(D8)
  const subject =
    paths.length === 1 ? `edit: ${paths[0]}` : `edit: ${paths[0]} 외 ${paths.length - 1}개`
  git(vaultDir, ['--literal-pathspecs', 'add', '--', ...paths])
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
  return null
}

export type ResolveOutcome = { ok: true; remaining: string[] } | { ok: false; reason: string }

/**
 * 고르기를 기다리는 파일의 한쪽 내용 — `:2:` 는 내 것, `:3:` 은 팀 것.
 * 한쪽이 지운 충돌에는 그 스테이지가 없다 — 그때는 null 이고, 화면이 "지웠다" 로 보여 준다.
 */
const sideContent = (vaultDir: string, path: string, stage: 2 | 3): string | null => {
  const staged = lines(git(vaultDir, ['ls-files', '-u', '--', path])).some((line) =>
    line.split('\t')[0]?.trim().endsWith(` ${stage}`)
  )
  if (!staged) return null
  return git(vaultDir, ['show', `:${stage}:${path}`])
}

/** 나란히 보여 줄 두 내용 — 팀 것과 내 것 */
export const conflictSides = (
  vaultDir: string,
  path: string
): { path: string; team: string | null; mine: string | null } | { error: string } => {
  if (!pendingConflicts(vaultDir).includes(path)) {
    return { error: mainT().syncMain.pickUnavailable }
  }
  try {
    return { path, team: sideContent(vaultDir, path, 3), mine: sideContent(vaultDir, path, 2) }
  } catch (error) {
    console.error('could not read both sides of the conflict', vaultDir, path, error)
    return { error: mainT().syncMain.bothUnreadable }
  }
}

/**
 * 한 파일의 고르기를 끝낸다. 고르지 않은 쪽은 버리지 않고 옆에 남긴다 —
 * 지운 것은 되돌릴 수 없고, 무엇이 지워졌는지 사람이 알 길도 없다.
 * 남은 것이 없으면 받기를 마무리해 보관함을 평소 상태로 돌린다.
 */
export const resolveConflict = (
  vaultDir: string,
  path: string,
  pick: ConflictPick
): ResolveOutcome => {
  if (!pendingConflicts(vaultDir).includes(path)) {
    return { ok: false, reason: mainT().syncMain.pickUnavailable }
  }
  let mine: string | null
  let theirs: string | null
  try {
    mine = sideContent(vaultDir, path, 2)
    theirs = sideContent(vaultDir, path, 3)
  } catch (error) {
    console.error('could not read conflict resolution content', vaultDir, path, error)
    return { ok: false, reason: mainT().syncMain.bothUnreadable }
  }
  const chosen = pick === 'team' ? theirs : mine
  const other = pick === 'team' ? mine : theirs
  // 고른 쪽이 "지웠다" 면 문서를 지운다. 안 고른 쪽 내용은 그래도 옆에 남는다
  if (chosen === null) rmSync(join(vaultDir, path), { force: true })
  else writeFileSync(join(vaultDir, path), chosen, 'utf8')
  const aside =
    other === null ? null : keptAsideName(path, pick, (name) => existsSync(join(vaultDir, name)))
  if (aside !== null && other !== null) writeFileSync(join(vaultDir, aside), other, 'utf8')
  git(vaultDir, [
    '--literal-pathspecs',
    'add',
    '-A',
    '--',
    path,
    ...(aside === null ? [] : [aside])
  ])

  const remaining = pendingConflicts(vaultDir)
  if (remaining.length === 0) {
    git(vaultDir, [...appIdentity(), 'commit', '--no-edit'])
  }
  return { ok: true, remaining }
}
