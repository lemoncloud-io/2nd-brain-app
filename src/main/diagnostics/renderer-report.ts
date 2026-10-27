// 렌더러가 보내는 오류 한 건 — renderer 입력이라 모양을 거르고 길이를 자르며, 오류 루프가 기록을 채우지 않게 창마다 상한을 둔다.
import type { RendererReport } from '../../shared/ipc/diagnostics'

/** message·stack 한 칸의 상한 — 줄 상한(redact MAX_LINE)보다 넉넉히, 가림 뒤 다시 자른다 */
export const MAX_REPORT = 8192

// 보낸 글이 다른 출처의 기록 줄을 꾸미지 못하게 — message 는 한 줄로, stack 은 이어지는 줄마다 표시를 붙인다
// U+2028·U+2029 도 묶음이 줄로 나눈다(bundle redactLines)
const oneLine = (value: string): string => value.replace(/\r\n|[\r\n\u2028\u2029]/g, '\\n')
const indented = (value: string): string => value.split(/\r\n|[\r\n\u2028\u2029]/).join('\n  | ')

export const normalizeReport = (raw: unknown): RendererReport | null => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const input = raw as Record<string, unknown>
  const level = input.level === 'warn' ? 'warn' : 'error'
  const message =
    typeof input.message === 'string' ? oneLine(input.message.slice(0, MAX_REPORT)) : '(no message)'
  if (typeof input.stack !== 'string') return { level, message }
  return { level, message, stack: indented(input.stack.slice(0, MAX_REPORT)) }
}

export interface ReportGate {
  /** true 면 기록한다 */
  take(): boolean
}

/**
 * 창(windowMs)마다 max 건까지. 처음 버릴 때 창 끝에 타이머를 하나 걸어 버린 수를 알린다 —
 * 폭주 뒤 보고가 더 오지 않아도 남는다
 */
export const createReportGate = (opts: {
  max: number
  windowMs: number
  onSuppressed: (count: number) => void
  now?: () => number
  setTimer?: (run: () => void, ms: number) => void
}): ReportGate => {
  const now = opts.now ?? Date.now
  const setTimer = opts.setTimer ?? ((run, ms): void => void setTimeout(run, ms).unref?.())
  let start = now()
  let count = 0
  let suppressed = 0
  return {
    take() {
      const at = now()
      if (at - start >= opts.windowMs) {
        start = at
        count = 0
      }
      count += 1
      if (count <= opts.max) return true
      if (suppressed === 0) {
        setTimer(
          () => {
            opts.onSuppressed(suppressed)
            suppressed = 0
          },
          Math.max(0, start + opts.windowMs - at)
        )
      }
      suppressed += 1
      return false
    }
  }
}
