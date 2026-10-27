// macOS 창 닫기 = 숨기기. 숨긴 동안에도 앱은 열린 때와 같다(진행 작업·볼트 감시·팀 살펴보기가 그대로 돈다).
// 끝내는 길은 ⌘Q(before-quit)와 업데이트 설치다 — 그때의 창 닫기는 숨기지 않고 닫아야 앱이 끝난다.
// Windows 는 예전처럼 닫으면 끝난다.

/** 무엇이 앱을 끝내려 했나 — ⌘Q·메뉴 종료(user)와 업데이트 설치(update)는 막힌 뒤 잇는 길이 다르다 */
export type QuitReason = 'user' | 'update'

export type QuitGuard = {
  /** 종료가 시작됐다 — before-quit(user), 또는 업데이트 설치 직전(update — 설치는 창을 먼저 닫고 before-quit 을 나중에 낸다) */
  quitStarted: (reason?: QuitReason) => void
  /** 설치가 실패해 종료가 멈췄다 */
  quitCanceled: () => void
  /**
   * 저장 안 한 글이 창 닫기를 막아 종료가 취소됐다(will-prevent-unload) — 버리기를 고르면 잇는다.
   * 막힌 종료의 이유를 돌려준다(종료 중이 아니었으면 null)
   */
  quitBlocked: () => QuitReason | null
  /** 창 닫기를 숨기기로 바꿀까 */
  hidesOnClose: () => boolean
  /** 버리기를 고른 뒤의 닫기가 이어야 할 종료 — 한 번만 돌려주고, 잇지 않으면 null */
  resumesQuit: () => QuitReason | null
}

export const createQuitGuard = (platform: NodeJS.Platform): QuitGuard => {
  let quitting: QuitReason | null = null
  let blocked: QuitReason | null = null
  return {
    // 새 종료 시도는 지난번에 막힌 종료(계속 편집을 골라 남은 표시)를 잇지 않는다
    quitStarted: (reason = 'user') => {
      // before-quit 은 설치 종료에서도 뒤늦게 온다 — 설치라는 이유를 덮지 않는다. 설치는 언제나 이유를 바꾼다
      quitting = reason === 'update' ? 'update' : (quitting ?? reason)
      blocked = null
    },
    quitCanceled: () => {
      quitting = null
      blocked = null
    },
    quitBlocked: () => {
      const reason = quitting
      blocked = reason
      quitting = null
      return reason
    },
    hidesOnClose: () => platform === 'darwin' && quitting === null,
    resumesQuit: () => {
      const reason = blocked
      blocked = null
      return reason
    }
  }
}

/** 앱 하나에 하나 — 창·업데이트·창 닫기 IPC 가 같은 판정을 본다 */
export const quitGuard = createQuitGuard(process.platform)

/** Dock 배지 — 받을 팀 변경 수. 빈 글자는 배지를 지운다 */
export const dockBadge = (behind: number): string => (behind > 0 ? String(behind) : '')
