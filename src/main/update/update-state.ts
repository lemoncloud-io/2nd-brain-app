// 자동 업데이트 상태 — 화면은 이 모양만 본다. electron-updater 이벤트를 여기서 한 줄로 접는다.
import type { UpdateState } from '../../shared/ipc-contract'

export type UpdateEvent =
  | { type: 'check' }
  | { type: 'available'; version: string }
  | { type: 'none' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; detail: string }
  /** 받아 둔 새 버전으로 다시 시작하지 못했다 — ready 를 풀 수 있는 유일한 이벤트 */
  | { type: 'install-failed'; detail: string }

export const updateReducer = (state: UpdateState, event: UpdateEvent): UpdateState => {
  // 꺼진 앱은 무엇을 받아도 꺼진 채다
  if (state.kind === 'off') return state
  // 받아 둔 새 버전은 다시 확인·실패로 잃지 않는다 — 다시 시작하면 설치된다. 설치 자체가 실패했을 때만 푼다
  if (state.kind === 'ready')
    return event.type === 'install-failed'
      ? { kind: 'failed', during: 'install', detail: event.detail }
      : state
  switch (event.type) {
    case 'check':
      // 받는 중에 주기 확인이 끼어도 진행률을 지우지 않는다. 이미 확인 중이면 같은 상태 — 다시 알리지 않는다
      return state.kind === 'downloading' || state.kind === 'checking'
        ? state
        : { kind: 'checking' }
    case 'available':
      // 긴 받기 중에 주기 확인이 같은 버전을 다시 알려도 진행률을 0 으로 되돌리지 않는다
      return state.kind === 'downloading' && state.version === event.version
        ? state
        : { kind: 'downloading', version: event.version, percent: 0 }
    case 'none':
      return { kind: 'latest' }
    case 'progress':
      return state.kind === 'downloading'
        ? { ...state, percent: Math.max(0, Math.min(100, Math.round(event.percent))) }
        : state
    case 'downloaded':
      return { kind: 'ready', version: event.version }
    case 'install-failed':
      // 준비 전에는 설치를 부르지 않는다(startUpdater.install) — 오면 실패로 둔다
      return { kind: 'failed', during: 'install', detail: event.detail }
    case 'error':
      // electron-updater 는 실패를 error 이벤트로 알리고 같은 오류를 다시 던진다(AppUpdater.checkForUpdates) — 한 번만 알린다
      return state.kind === 'failed' && state.during === 'check' && state.detail === event.detail
        ? state
        : { kind: 'failed', during: 'check', detail: event.detail }
  }
}
