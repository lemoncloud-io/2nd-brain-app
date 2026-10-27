// 승인 화면 IPC — 현재 볼트의 작업 브랜치를 페이지 단위로 보여 주고, 확정하면 정리·검증·병합한다.
import { ipcMain } from 'electron'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import type { FinalizeOutcome, ReviewListing, UndoMergeOutcome } from '../../shared/ipc-contract'
import { finalize, listPages, undoMerge } from '../review/review-service'
import { publishApproved, unshare, type PublishDeps } from '../review/team-share'
import { isPersonalRepo } from '../github/repos'
import { githubLogin, githubToken } from './github-handlers'
import { createPullRequest, closePullRequest } from '../github/pull-request'
import { checkVisibility, deleteRemoteBranch, pushBranch, pushVault } from '../vault/remote-service'
import { refreshSyncState, runSync } from './sync-handlers'
import { vaultActivity } from '../vault/vault-activity'
import { currentVaultDir } from './clip-handlers'
import { requireFullVault } from '../vault/vault-service'
import { reviewItems } from './review-items-handlers'
import { recordFinalizeOutcome } from '../review/review-item-store'
import { mainT } from '../i18n'

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const listReview = (senderId?: number): ReviewListing | { error: string; idle?: true } => {
  const vaultDir = currentVaultDir(senderId)
  if (!vaultDir) return { error: mainT().common.noVault }
  const generic = requireFullVault(vaultDir)
  if (generic) return { error: generic }
  const listing = listPages(vaultDir)
  if (!listing.ok)
    return 'idle' in listing ? { error: listing.reason, idle: true } : { error: listing.reason }
  const { branch, defaultBranch, pages, others } = listing
  return { branch, defaultBranch, pages, others }
}

// 확정은 git 을 여러 번 바꾼다 — 창의 busy 표시와 별개로 main 에서도 한 번에 하나만 받는다
const finalizeReview = async (rejected: unknown, senderId?: number): Promise<FinalizeOutcome> => {
  if (!isStringArray(rejected)) return { status: 'failed', reason: mainT().reviewMain.badRejects }
  const vaultDir = currentVaultDir(senderId)
  if (!vaultDir) return { status: 'failed', reason: mainT().common.noVault }
  const generic = requireFullVault(vaultDir)
  if (generic) return { status: 'failed', reason: generic }
  const end = vaultActivity.begin('finalize', vaultDir)
  if (typeof end !== 'function') return { status: 'failed', reason: end.busy }
  let outcome: FinalizeOutcome
  try {
    // 병합을 막은 검증 결함은 검토 항목으로도 남긴다 — 기록이 실패해도 확정 결과는 돌려준다
    outcome = recordFinalizeOutcome(reviewItems, vaultDir, await finalize(vaultDir, rejected))
  } finally {
    end()
  }
  if (outcome.status !== 'merged') return outcome
  // 내 위키의 승인은 이미 끝났다 — GitHub 에 보내는 일이 실패해도 되돌리지 않고 사유만 얹는다.
  // 잠금을 푼 뒤에 보낸다 — 혼자 쓰는 저장소는 올리기 전에 받는데, 잠금 안에서 받으면 `busy` 로 건너뛴다
  const shared = await publishApproved(vaultDir, outcome.branch, publishDeps)
  refreshSyncState(vaultDir)
  return { ...outcome, ...shared }
}

/** GitHub 에 보내는 실제 동작 — 올리기는 번들 git, PR·구성원 확인은 GitHub API */
const publishDeps: PublishDeps = {
  isPublic: (webUrl) => checkVisibility(webUrl),
  push: (vaultDir, branch) => pushBranch(vaultDir, branch),
  openPullRequest: (input) =>
    createPullRequest({ token: githubToken(), fetch: globalThis.fetch }, input),
  isPersonal: async (url) => {
    const login = await githubLogin()
    return (
      login !== null &&
      isPersonalRepo({ token: githubToken(), fetch: globalThis.fetch }, { url, login })
    )
  },
  sync: (vaultDir) => runSync({}, vaultDir),
  pushDefault: pushVault
}

// 되돌리기도 브랜치를 옮긴다 — 확정과 같은 활동으로 잡아 위키화·편집 저장과 겹치지 않게 한다
const undoReviewMerge = async (branch: unknown, senderId?: number): Promise<UndoMergeOutcome> => {
  if (typeof branch !== 'string') return { status: 'failed', reason: mainT().reviewMain.badBranch }
  const vaultDir = currentVaultDir(senderId)
  if (!vaultDir) return { status: 'failed', reason: mainT().common.noVault }
  const generic = requireFullVault(vaultDir)
  if (generic) return { status: 'failed', reason: generic }
  const end = vaultActivity.begin('finalize', vaultDir)
  if (typeof end !== 'function') return { status: 'failed', reason: end.busy }
  try {
    // 팀이 이미 확인 중이면 그것부터 닫는다 — 닫지 못하면 로컬도 되돌리지 않는다(둘이 어긋나면 더 헷갈린다)
    const closed = await unshare(vaultDir, branch, {
      closePullRequest: (url, number) =>
        closePullRequest({ token: githubToken(), fetch: globalThis.fetch }, { url, number })
    })
    if (!closed.ok) return { status: 'failed', reason: closed.reason }
    const result = undoMerge(vaultDir, branch)
    // 원격의 작업 브랜치는 로컬 되돌리기가 끝난 뒤에 치운다 — 거절되면 팀 쪽만 지워져 다시 보낼 길이 없어진다
    if (result.status === 'undone') await deleteRemoteBranch(vaultDir, branch)
    refreshSyncState(vaultDir)
    return result
  } finally {
    end()
  }
}

export const registerReviewHandlers = (): void => {
  ipcMain.handle(APP_CHANNELS.listReview, (event) => listReview(event.sender.id))
  ipcMain.handle(APP_CHANNELS.finalizeReview, (event, rejected: unknown) =>
    finalizeReview(rejected, event.sender.id)
  )
  ipcMain.handle(APP_CHANNELS.undoMerge, (event, branch: unknown) =>
    undoReviewMerge(branch, event.sender.id)
  )
}
