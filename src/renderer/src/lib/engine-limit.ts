// 구독 한도에 걸린 사실을 화면 하나가 아니라 앱이 기억한다.
// 한도는 계정의 상태다 — 위키화 화면에서 걸렸더라도, 왜 아무것도 안 되는지 묻는 사람은 "AI 연결"을 본다.
// 거기서 "연결됨"만 보이면 화면이 거짓말을 한다.
//
// 기록은 오류를 사용자 문장으로 바꾸는 통로(`lib/user-error.ts`)가 남긴다 — 실패가 지나가는 유일한 길목이다.
import { classifyEngineFailure, limitResetAt } from '../../../shared/engine-failure'

/** 해제 시각을 못 읽었을 때 한도를 잊기까지 기다리는 시간 — 화면에 시각으로 적지는 않는다 */
const BLIND_WINDOW_MS = 60 * 60_000

/** 지금 걸려 있는 한도. `at` 이 null 이면 해제 시각을 모른다 — 모르는 것을 시각으로 말하지 않는다 */
export type EngineLimit = { at: number | null }

let limit: EngineLimit | null = null
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

const publish = (): void => listeners.forEach((listener) => listener())

const forgetAfter = (ms: number): void => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(
    () => {
      timer = null
      limit = null
      publish()
    },
    Math.max(ms, 0)
  )
}

/** 실패 원문을 본다. 한도면 기억하고, 한도가 아니면 아무것도 하지 않는다 */
export const noteEngineFailure = (detail: string): void => {
  if (classifyEngineFailure(detail) !== 'usage-limit') return
  const at = limitResetAt(detail)
  // 시각을 아는 기억이 이미 있으면 모르는 기억으로 덮지 않는다
  if (limit && limit.at !== null && at === null) return
  limit = { at: at ? at.getTime() : null }
  forgetAfter(at ? at.getTime() - Date.now() : BLIND_WINDOW_MS)
  publish()
}

/** 로그인·로그아웃처럼 계정이 바뀌면 지난 한도는 의미가 없다 */
export const clearEngineLimit = (): void => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (limit === null) return
  limit = null
  publish()
}

/**
 * 지금 걸려 있는 한도, 없으면 null.
 * 읽기만 한다 — `useSyncExternalStore` 가 렌더 중에 부르는 자리라 여기서 상태를 바꾸면
 * 같은 화면의 다른 인스턴스가 알림 없이 어긋난다. 잊는 일은 위 타이머가 한다.
 */
export const engineLimit = (): EngineLimit | null => limit

export const subscribeEngineLimit = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
