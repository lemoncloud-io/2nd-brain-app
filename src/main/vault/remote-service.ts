// GitHub 로 올리기 — 기본 브랜치는 `pushVault`(승인해 병합된 것), 팀 확인용 작업 브랜치는 `pushBranch`·`pushBranchAs`.
// 기본 브랜치에는 승인해 병합된 것만 들어 있다.
// 로그인은 앱의 GitHub 로그인 토큰 하나다 — `spawnGit` 이 github.com 으로 가는 요청에만 싣는다.
import { git, GIT_TIMEOUT_MS, spawnGit, type GitFailure } from '../git'
import { failureKind, lastStderrLine } from '../git-failure'
import { GITHUB_API } from '../github/endpoints'
import { repoFromUrl } from '../github/pull-request'
import { defaultBranchOf } from '../engine/work-branch'
import type { PushResult, RemoteStatus } from '../../shared/ipc-contract'
import { mainT } from '../i18n'

const REMOTE = 'origin'

/** 연결한 주소 그대로 — `remote get-url` 은 git 의 주소 바꿔 쓰기(`insteadOf`)를 거친 뒤라 사람이 넣은 주소가 아닐 수 있다 */
export const readRemote = (vaultDir: string): RemoteStatus => {
  let url: string
  try {
    url = git(vaultDir, ['config', '--get', `remote.${REMOTE}.url`]).trim()
  } catch {
    return null
  }
  return { url, webUrl: url.replace(/\.git$/, '') }
}

export const setRemote = (vaultDir: string, url: string): void => {
  if (readRemote(vaultDir)) git(vaultDir, ['remote', 'set-url', REMOTE, url])
  else git(vaultDir, ['remote', 'add', REMOTE, url])
}

/** 이 컴퓨터의 연결만 지운다 — GitHub 에 올라간 내용은 그대로 남는다 */
export const clearRemote = (vaultDir: string): void => {
  if (readRemote(vaultDir)) git(vaultDir, ['remote', 'remove', REMOTE])
}

/**
 * 로그인하지 않은 채로 그 저장소가 보이는가.
 * 200 = 누구나 볼 수 있다(공개). 404 = 로그인 없이는 안 보인다(비공개이거나 없는 저장소 — 어느 쪽이든
 * 남에게 열려 있지는 않다). 그 밖(403 한도·네트워크 실패·GitHub 주소가 아님)은 **판정하지 않는다**:
 * 확인하지 못한 것을 비공개라고 단정하면 공개된 남의 문서를 안전하다고 말하게 된다.
 */
export const isPublicRepo = async (webUrl: string): Promise<boolean | undefined> => {
  const repo = repoFromUrl(webUrl)
  if (!repo) return undefined
  try {
    const response = await fetch(`${GITHUB_API}/repos/${repo.owner}/${repo.repo}`, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000)
    })
    if (response.status === 200) return true
    if (response.status === 404) return false
    return undefined
  } catch {
    return undefined
  }
}

/**
 * 공개 여부 기억 — 저장소 주소마다 한 번만 묻는다.
 * 비인증 GitHub API 는 IP 당 시간 60회다. 화면 갱신마다 물으면 사내 NAT 뒤 한 팀이 그 한도를 함께 태우고,
 * 그 뒤부터는 403 이 돌아와 경고가 조용히 사라진다 — 가장 필요한 순간에 없어지는 경고다.
 */
const VISIBILITY_TTL_MS = 10 * 60_000
const seen = new Map<string, { public: boolean | undefined; at: number }>()

/** 기억해 둔 답. 아직 물어본 적 없으면 `miss` */
export const rememberedVisibility = (webUrl: string): boolean | undefined | 'miss' => {
  const hit = seen.get(webUrl)
  if (!hit || Date.now() - hit.at > VISIBILITY_TTL_MS) return 'miss'
  return hit.public
}

/**
 * 공개 저장소를 거절할 때 쓰는 한 문장 — 연결·올리기·승인이 같은 말을 한다.
 * 같은 판정을 두 군데에서 다르게 말하면 사용자는 두 가지 규칙이 있다고 읽는다.
 */

/** 물어보고 기억한다. 화면이 기다려도 되는 자리(연결 직전)에서만 부른다 */
export const checkVisibility = async (webUrl: string): Promise<boolean | undefined> => {
  const answer = await isPublicRepo(webUrl)
  seen.set(webUrl, { public: answer, at: Date.now() })
  return answer
}

/** 주소가 바뀌었거나 사용자가 GitHub 에서 공개 범위를 고쳤을 때 */
export const forgetVisibility = (webUrl?: string): void => {
  if (webUrl) seen.delete(webUrl)
  else seen.clear()
}

/** 저장소에 이미 무언가 들어 있는가 — 빈 저장소가 아니면 push 가 거절된다 */
export const remoteHasCommits = async (
  vaultDir: string,
  url: string
): Promise<boolean | undefined> => {
  const run = await spawnGit(vaultDir, ['ls-remote', '--heads', url])
  // 읽지 못한 것을 "비어 있다" 로 읽지 않는다 — push 가 실패하면 그때 사유를 말한다
  if (!run.ok) return undefined
  return run.stdout.trim() !== ''
}

/** git push 실패 → 사용자가 할 일 */
export const pushFailureMessage = (run: GitFailure): string => {
  const { stderr } = run
  switch (failureKind(run)) {
    case 'not-found':
      return mainT().syncMain.pushNotFound
    case 'login':
      return mainT().syncMain.pushLogin
    case 'auth':
      return mainT().syncMain.loginExpired
    case 'rejected':
      // 연결은 빈 저장소인지 먼저 본다(`remoteHasCommits`) — 여기 오는 것은 연결 뒤 팀이 먼저 올린 경우다
      return mainT().syncMain.pushBehind
    case 'offline':
      return mainT().syncMain.pushOffline
    default:
      return `${mainT().syncMain.pushFailed}${lastStderrLine(stderr)}`
  }
}

/** 작업 브랜치 하나를 올린다 — 승인한 묶음을 팀이 확인할 수 있게 */
export const pushBranch = (vaultDir: string, branch: string): Promise<PushResult> =>
  pushBranchAs(vaultDir, branch, branch)

/** 이 보관함의 `local` 을 팀 저장소의 `remote` 이름으로 올린다 — 내 수정을 팀 확인 요청으로 보낼 때 */
export const pushBranchAs = async (
  vaultDir: string,
  local: string,
  remote: string
): Promise<PushResult> => {
  if (!readRemote(vaultDir))
    return {
      ok: false,
      reason: mainT().syncMain.notLinked
    }
  const run = await spawnGit(vaultDir, [
    'push',
    '--porcelain',
    REMOTE,
    `refs/heads/${local}:refs/heads/${remote}`
  ])
  if (run.ok) return { ok: true }
  if (run.failure === 'spawn')
    return { ok: false, reason: `${mainT().syncMain.sendFailed} — ${run.stderr}` }
  return { ok: false, reason: pushFailureMessage(run) }
}

/** 원격에 올려 둔 작업 브랜치를 지운다 — 도로 빼기 뒤 팀 저장소를 깨끗이 둔다 */
export const deleteRemoteBranch = (vaultDir: string, branch: string): Promise<PushResult> =>
  spawnGit(vaultDir, ['push', REMOTE, `:refs/heads/${branch}`]).then((run) =>
    run.ok ? { ok: true } : { ok: false, reason: pushFailureMessage(run) }
  )

/** 기본 브랜치를 올린다. 처음 올리는 큰 보관함은 오래 걸려 넉넉히 기다린다 */
export const pushVault = async (vaultDir: string): Promise<PushResult> => {
  const branch = defaultBranchOf(vaultDir)
  if (!branch) return { ok: false, reason: mainT().mainErrors.noDefaultBranch }
  if (!readRemote(vaultDir))
    return {
      ok: false,
      reason: mainT().syncMain.githubNotLinked
    }
  const run = await spawnGit(vaultDir, [
    'push',
    '--porcelain',
    '-u',
    REMOTE,
    `refs/heads/${branch}:refs/heads/${branch}`
  ])
  if (run.ok) return { ok: true }
  if (run.failure === 'spawn')
    return { ok: false, reason: `${mainT().syncMain.pushFailed} — ${run.stderr}` }
  if (run.failure === 'timeout') {
    return {
      ok: false,
      reason: mainT().syncMain.pushTimeout(GIT_TIMEOUT_MS / 60_000)
    }
  }
  return { ok: false, reason: pushFailureMessage(run) }
}
