// 앱 업데이트 상태를 화면 한 줄로 — 설정의 "앱 업데이트" 칸과 사이드바의 다시 시작 버튼이 같이 쓴다.
// 화면에 "업데이트 서버"·"릴리스" 같은 배포 말을 내지 않는다(DESIGN.md § 화면 말). 실패는 무엇이 안 됐나 +
// 할 일 하나 + 접어 둔 원문(detail)이다.
import type { UpdateState } from '../../../shared/ipc-contract'
import { getT } from './i18n'

export interface UpdateLine {
  text: string
  tone: 'ok' | 'warn' | 'idle'
  /** 줄 옆 버튼 — restart: 다시 시작해 설치 · check: 지금 다시 확인 */
  action: 'restart' | 'check' | null
  /** "자세히" 뒤에 둘 원문 */
  detail: string | null
}

const line = (
  text: string,
  tone: UpdateLine['tone'],
  action: UpdateLine['action'] = null
): UpdateLine => ({
  text,
  tone,
  action,
  detail: null
})

/** current 는 지금 버전 — 읽지 못했으면 null(버전 없이 상태만 보인다) */
export const updateLine = (state: UpdateState, current: string | null): UpdateLine => {
  const t = getT().update
  const now = t.now(current)
  switch (state.kind) {
    case 'off':
      return line(t.off(now), 'idle')
    // 첫 확인 전이다 — 최신이라고 말하지 않는다
    case 'idle':
      return line(now, 'idle')
    case 'latest':
      return line(t.latest(now), 'ok')
    case 'checking':
      return line(t.checking(now), 'idle')
    case 'downloading':
      return line(t.downloading(state.version, state.percent), 'idle')
    case 'ready':
      return line(t.ready(state.version), 'ok', 'restart')
    case 'failed':
      // 설치 실패의 할 일은 다시 시도다 — 받아 둔 파일로 같은 실행에서 다시 설치할 수 있다
      // (electron-updater BaseUpdater.quitAndInstall 은 실패하면 quitAndInstallCalled 를 되돌린다)
      return state.during === 'install'
        ? {
            text: t.installFailed(now),
            tone: 'warn',
            action: 'restart',
            detail: state.detail
          }
        : {
            text: t.checkFailed(now),
            tone: 'warn',
            action: 'check',
            detail: state.detail
          }
  }
}
