// 계정 사용량을 지표 줄 한 칸으로 — 다른 AI 도구의 상태 줄과 같은 모양으로 쓴다:
// `5h 49% (1h 32m) · 7d 16% (6d 17h) · Fable 0%`. 숫자는 쓴 비율이고, 괄호는 다시 채워지기까지 남은 시간이다.
// 이 줄은 설정 `고급 표시` 를 켠 사람에게만 보인다 — 그 사람들이 익숙한 표기를 따른다(2026-10-01 사람 확인).
import type { AccountUsage } from '../../../shared/account-usage'

/** `20m`·`1h 32m`·`6d 17h` — 지난 시각이면 null(곧 채워진다는 말을 지어내지 않는다) */
export const resetsIn = (isoAt: string | null, now: number): string | null => {
  if (isoAt === null) return null
  const at = Date.parse(isoAt)
  if (Number.isNaN(at)) return null
  const minutes = Math.round((at - now) / 60_000)
  if (minutes <= 0) return null
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`
}

/** 사용량 칸 하나 — `5h` 를 얼마나 썼고(`used`) 언제 다시 채워지나(`when`) */
export type UsagePart = { label: string; used: number; when: string | null }

/** 이만큼 넘게 쓰면 눈에 띄게 그린다 — 곧 막힌다는 말을 숫자만으로는 못 한다 */
export const HIGH_USED = 85

/** 지표 줄에 들어갈 사용량 칸 — 5h·7d, 그리고 모델별 한도 수만큼. 모르는 값은 아예 만들지 않는다 */
export const usageParts = (usage: AccountUsage | null, now: number): UsagePart[] => {
  if (usage === null) return []
  const parts: UsagePart[] = []
  const add = (label: string, percent: number | null, resetsAt: string | null): void => {
    if (percent === null) return
    parts.push({ label, used: Math.min(100, percent), when: resetsIn(resetsAt, now) })
  }
  add('5h', usage.fiveHour, usage.fiveHourResetsAt)
  add('7d', usage.sevenDay, usage.sevenDayResetsAt)
  // 모델별 주간 한도 — 언제 채워지는지는 `7d` 칸이 이미 말했으므로 여기서는 쓴 비율만이다
  for (const scope of usage.scoped) {
    parts.push({ label: scope.name, used: Math.min(100, scope.percent), when: null })
  }
  return parts
}
