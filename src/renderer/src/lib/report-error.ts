// 렌더러 오류를 main 기록(main.log)으로 보낸다 — 배포본에서는 DevTools 가 없어 여기가 유일한 흔적이다.
import type { RendererReport } from '../../../shared/ipc-contract'

/** 같은 오류(글·stack 이 같다)는 이만큼만 보낸다 — 매 프레임 던지는 오류가 다른 오류를 밀어내지 않게 */
const SAME_LIMIT = 5
/** 세어 두는 서로 다른 오류 수 상한 — 넘으면 센 것을 비운다 */
const SEEN_LIMIT = 200
const seen = new Map<string, number>()

const describe = (value: unknown): { message: string; stack?: string } => {
  if (!(value instanceof Error)) return { message: String(value) }
  const causes: string[] = []
  let cause: unknown = value.cause
  // 감싼 오류는 원인이 진짜 단서다 — 세 겹까지
  for (let depth = 0; cause !== undefined && depth < 3; depth += 1) {
    causes.push(
      `caused by: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}`
    )
    cause = cause instanceof Error ? cause.cause : undefined
  }
  return {
    message: `${value.name}: ${value.message}`,
    stack: [value.stack, ...causes].filter(Boolean).join('\n')
  }
}

/** 보내기가 실패해도 다시 보내지 않는다 — 실패를 보고하다 또 실패하는 고리를 만들지 않게 */
export const reportError = (report: RendererReport): void => {
  const key = `${report.message}\n${report.stack ?? ''}`
  const count = (seen.get(key) ?? 0) + 1
  if (seen.size >= SEEN_LIMIT && !seen.has(key)) seen.clear()
  seen.set(key, count)
  if (count > SAME_LIMIT) return
  try {
    void window.api.reportError(report).catch(() => {})
  } catch {
    // 일부러 버린다 — preload 가 없는 시험 환경 등
  }
}

/** 잡히지 않은 오류와 거부된 promise — main.tsx 에서 한 번 */
export const installErrorReporting = (target: Window = window): void => {
  target.addEventListener('error', (event) => {
    const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : ''
    const { message, stack } = describe(event.error ?? event.message)
    reportError({ level: 'error', message: `window: ${message}${where}`, stack })
  })
  target.addEventListener('unhandledrejection', (event) => {
    const { message, stack } = describe(event.reason)
    reportError({ level: 'error', message: `unhandledrejection: ${message}`, stack })
  })
}

/** 렌더 중 throw — 앱 전체 경계가 부른다 */
export const reportRenderError = (error: unknown, componentStack?: string | null): void => {
  const { message, stack } = describe(error)
  reportError({
    level: 'error',
    message: `render: ${message}`,
    stack: [stack, componentStack].filter(Boolean).join('\n')
  })
}
