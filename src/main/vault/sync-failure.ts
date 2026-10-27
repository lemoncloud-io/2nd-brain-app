// 팀 동기화 실패 문구 — git 실패 종류를 사용자가 할 일로 바꾼다.
import type { GitFailure } from '../git'
import { failureKind, lastStderrLine } from '../git-failure'
import type { SyncOutcome } from './sync-service'
import { mainT } from '../i18n'

/** git fetch 실패 → 사용자가 할 일 */
export const fetchFailureMessage = (run: GitFailure): string => {
  const { stderr } = run
  switch (failureKind(run)) {
    case 'login':
      return mainT().syncMain.fetchLogin
    case 'auth':
      return mainT().syncMain.loginExpired
    case 'not-found':
      return mainT().syncMain.fetchNotFound
    case 'offline':
      return mainT().syncMain.fetchOffline
    default:
      return `${mainT().syncMain.fetchFailed}${lastStderrLine(stderr)}`
  }
}

export const fetchFailed = (run: GitFailure): SyncOutcome => {
  if (run.failure === 'timeout') {
    return { ok: false, reason: mainT().syncMain.fetchTimeout }
  }
  if (run.failure === 'spawn') {
    return { ok: false, reason: `${mainT().syncMain.fetchFailed} — ${run.stderr}` }
  }
  return { ok: false, reason: fetchFailureMessage(run) }
}
