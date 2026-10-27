// 승인한 것을 팀에 보내기 — 작업 브랜치를 팀 저장소에 올리고 PR 을 연다. 머지는 사람이 웹에서 한다.
// 연 PR 은 보관함 안(.git 아래, 커밋되지 않는 곳)에 기억해 둔다 — 앱을 다시 켜도 "팀 확인 중" 이 남고
// 도로 빼기가 무엇을 닫아야 하는지 안다.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readRemote } from '../vault/remote-service'
import { writeJsonAtomic } from '../vault/atomic-write'
import { pushBlockedReason } from '../vault/sync-state'
import { defaultBranchOf } from '../engine/work-branch'
import type { PushResult, SyncState } from '../../shared/ipc-contract'
import { mainT } from '../i18n'

/** 팀이 확인 중인 것 하나 — 사람에게는 "팀 확인 중 · 열어 보기" 로 보인다 */
export type TeamReview = { number: number; url: string }

export type ShareResult = { ok: true; review: TeamReview | null } | { ok: false; reason: string }

export type ShareDeps = {
  /** 팀 저장소가 로그인 없이 보이는가 — 모르면 undefined(막지 않는다) */
  isPublic(webUrl: string): Promise<boolean | undefined>
  push(vaultDir: string, branch: string): Promise<{ ok: true } | { ok: false; reason: string }>
  openPullRequest(input: {
    url: string
    branch: string
    base: string
    title: string
  }): Promise<{ ok: true; number: number; url: string } | { ok: false; reason: string }>
}

const store = (vaultDir: string): string => join(vaultDir, '.git', '2nd-brain-team-reviews.json')

const readAll = (vaultDir: string): Record<string, TeamReview> => {
  const file = store(vaultDir)
  if (!existsSync(file)) return {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, TeamReview>)
      : {}
  } catch {
    return {}
  }
}

const writeAll = (vaultDir: string, all: Record<string, TeamReview>): void => {
  writeJsonAtomic(store(vaultDir), all)
}

/** 이 작업이 팀 확인 중인가 — 아니면 null */
export const readTeamReview = (vaultDir: string, branch: string): TeamReview | null =>
  readAll(vaultDir)[branch] ?? null

/** 팀 확인 중인 것 전부 — 화면이 목록을 그릴 때 */
export const listTeamReviews = (vaultDir: string): Record<string, TeamReview> => readAll(vaultDir)

const titleOf = (branch: string): string => `wiki: ${branch.replace(/^app\//, '')}`

export const shareToTeam = async (
  vaultDir: string,
  branch: string,
  deps: ShareDeps
): Promise<ShareResult> => {
  const remote = readRemote(vaultDir)
  // 팀 저장소가 없으면 보낼 곳이 없다 — 혼자 쓰는 보관함에서도 승인은 끝나야 한다
  if (!remote) return { ok: true, review: null }
  // 승인도 올리기다 — 위키와 넣어 둔 원본이 함께 나간다. "지금 올리기" 와 같은 문 앞에 세운다:
  // 올린 뒤에 뜨는 경고는 경고가 아니라 사후 통보다. 확인하지 못한 저장소는 막지 않는다
  if ((await deps.isPublic(remote.webUrl)) === true)
    return { ok: false, reason: mainT().syncMain.publicRepo }

  const base = defaultBranchOf(vaultDir)
  if (!base) return { ok: false, reason: mainT().mainErrors.noDefaultBranch }

  const pushed = await deps.push(vaultDir, branch)
  if (!pushed.ok) return { ok: false, reason: pushed.reason }

  const opened = await deps.openPullRequest({
    url: remote.url,
    branch,
    base,
    title: titleOf(branch)
  })
  if (!opened.ok) return { ok: false, reason: opened.reason }

  const review = { number: opened.number, url: opened.url }
  writeAll(vaultDir, { ...readAll(vaultDir), [branch]: review })
  return { ok: true, review }
}

export const unshare = async (
  vaultDir: string,
  branch: string,
  deps: {
    closePullRequest(
      url: string,
      number: number
    ): Promise<{ ok: true } | { ok: false; reason: string }>
  }
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const review = readTeamReview(vaultDir, branch)
  if (!review) return { ok: true }
  const remote = readRemote(vaultDir)
  if (!remote) return { ok: true }
  const closed = await deps.closePullRequest(remote.url, review.number)
  // 닫지 못했으면 기억을 지우지 않는다 — 다시 시도할 수 있어야 한다
  if (!closed.ok) return closed
  const all = readAll(vaultDir)
  delete all[branch]
  writeAll(vaultDir, all)
  return { ok: true }
}

export type PublishDeps = ShareDeps & {
  /** 혼자 쓰는 내 저장소인가 — 확인하지 못하면 false(github/repos.ts `isPersonalRepo`) */
  isPersonal(url: string): Promise<boolean>
  /** 팀 변경 받기 — 올리기 직전에 */
  sync(vaultDir: string): Promise<SyncState>
  /** 기본 줄기를 올린다 */
  pushDefault(vaultDir: string): Promise<PushResult>
}

/** 승인 뒤 GitHub 쪽 결과 — 확인 요청을 열었거나(팀), 기본 줄기를 올렸거나(혼자), 둘 다 아니다(연결 없음) */
export type ApprovedShare = {
  teamReview: TeamReview | null
  shareError: string | null
  /** 기본 줄기를 올린 저장소 웹 주소 — 올리지 않았으면 null */
  published: string | null
  publishError: string | null
}

const NOTHING: ApprovedShare = {
  teamReview: null,
  shareError: null,
  published: null,
  publishError: null
}

/**
 * 승인한 것을 GitHub 에 보낸다. 혼자 쓰는 내 저장소면 확인 요청 없이 기본 줄기를 올린다 — 확인할 팀이 없는데 요청을 열면
 * 사람이 GitHub 에서 직접 합쳐야 첫 성공이 끝난다. 그 밖(구성원·조직·확인 못 함)과 열린 확인 요청이 있을 때는 지금처럼 확인 요청.
 * 확정 잠금이 풀린 뒤에 부른다 — 잠금 안에서 받으면 `busy` 로 건너뛴다
 */
export const publishApproved = async (
  vaultDir: string,
  branch: string,
  deps: PublishDeps
): Promise<ApprovedShare> => {
  const remote = readRemote(vaultDir)
  if (!remote) return NOTHING
  const toTeam = async (): Promise<ApprovedShare> => {
    const shared = await shareToTeam(vaultDir, branch, deps)
    return shared.ok
      ? { ...NOTHING, teamReview: shared.review }
      : { ...NOTHING, shareError: shared.reason }
  }
  if (!(await deps.isPersonal(remote.url))) return toTeam()
  // 순서는 "지금 올리기" 와 같다(ipc/vault-handlers.ts pushRemote) — 받기 → 공개 검사 → 올리기
  const state = await deps.sync(vaultDir)
  // 아직 열려 있는 확인 요청(위키화·내 수정)이 있으면 기본 줄기를 바로 올리지 않는다 — 요청을 건너뛰면 요청과 기본 줄기가 어긋난다.
  // 기록이 아니라 받은 뒤의 판정(`SyncState.shared`)을 본다: 기록은 되돌리기만 지워 GitHub 에서 합쳐진 요청도 남는다
  if (state.shared !== null) return toTeam()
  const blocked = pushBlockedReason(state)
  if (blocked) return { ...NOTHING, publishError: blocked }
  if ((await deps.isPublic(remote.webUrl)) === true)
    return { ...NOTHING, publishError: mainT().syncMain.publicRepo }
  const pushed = await deps.pushDefault(vaultDir)
  return pushed.ok
    ? { ...NOTHING, published: remote.webUrl }
    : { ...NOTHING, publishError: pushed.reason }
}
