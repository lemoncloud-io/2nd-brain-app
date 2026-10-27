// 팀 변경 받기 상태를 사람 말로 — git 어휘는 이 파일의 문장에 나오지 않는다(작업 이름은 "자세히" 에만).
// 할 일 말(받기·다시 확인·고르기…)은 옆 단추가 한다(sync-line) — 문장에 또 쓰면 같은 말이 두 번 보인다.
import type { SyncState } from '../../../shared/ipc-contract'
import { getT } from './i18n'

const aheadText = (sync: SyncState): string => (sync.ahead > 0 ? getT().sync.ahead(sync.ahead) : '')

/** 받기 상태 한 줄 — 무엇이 일어났는지와, 단추가 없는 막힌 상태면 할 일 하나 */
export const syncText = (sync: SyncState): string => {
  const t = getT().sync
  const ahead = aheadText(sync)
  if (sync.running) return t.running
  // 받으러 나가지도 않았다 — 쌓인 수·옛 오류보다 할 일이 먼저다. 단추가 설정의 GitHub 로그인으로 간다(sync-line)
  if (sync.skipped === 'signed-out') return t.signedOut(ahead)
  if (sync.error) return `${sync.error}${ahead}`
  if (sync.conflicts.length > 0) {
    // 단추가 승인의 고르기로 간다(sync-line) — 다시 받아도 같은 목록이라 받기를 권하지 않는다
    return t.conflicts(sync.conflicts.length, ahead)
  }
  if (sync.behind > 0) {
    // 승인 대기 중에는 눌러도 받지 않는다 — 누르라고 하지 않고 언제 받는지 말한다
    return sync.skipped === 'review-pending'
      ? t.behindReviewPending(sync.behind, ahead)
      : t.behind(sync.behind, ahead)
  }
  if (sync.at === null) return t.never(ahead)
  switch (sync.skipped) {
    case 'no-remote':
      return sync.held === null ? t.noRemote : t.noRemoteHeld
    case 'review-pending':
      return t.reviewPending(ahead)
    case 'busy':
      return t.busy(ahead)
    case 'stuck':
      return t.stuck
    case 'switch-blocked':
      return t.switchBlocked
    case null:
      break
  }
  // 팀 확인 중이라는 사유는 바로 아래 보내기 줄(share-line)이 말한다 — 여기서는 받은 결과만
  if (sync.held !== null) return t.held(ahead)
  const received =
    sync.received > 0
      ? sync.via === 'merge'
        ? t.receivedMerge(sync.received)
        : t.received(sync.received)
      : t.nothingNew
  return `${received}${ahead}`
}

const SHOWN_FILES = 5

/** 올리기 전에 무엇이 나가는지 — 앱이 자동 저장한 편집도 여기서 드러난다 */
export const aheadFilesText = (files: string[]): string | null => {
  if (files.length === 0) return null
  const shown = files.slice(0, SHOWN_FILES).join(', ')
  return getT().sync.aheadFiles(shown, files.length - SHOWN_FILES)
}
