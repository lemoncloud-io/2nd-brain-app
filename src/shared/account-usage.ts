// 계정의 남은 여유 — main 이 계산해 내보내는 숫자만 있다. 토큰이 들어갈 자리는 만들지 않는다
// (PRODUCT.md § Naming: 토큰은 main 프로세스 메모리 밖으로 나가지 않는다).

/** 모델별 주간 한도 — 이름은 응답이 주는 표시 이름 그대로다 */
export type ScopedUsage = { name: string; percent: number }

export type AccountUsage = {
  /** 5시간 창에서 쓴 비율(0~100) */
  fiveHour: number | null
  /** 7일 창에서 쓴 비율(0~100) */
  sevenDay: number | null
  /** ISO 문자열 — 언제 다시 채워지나 */
  fiveHourResetsAt: string | null
  sevenDayResetsAt: string | null
  scoped: ScopedUsage[]
}

export const EMPTY_ACCOUNT_USAGE: AccountUsage = {
  fiveHour: null,
  sevenDay: null,
  fiveHourResetsAt: null,
  sevenDayResetsAt: null,
  scoped: []
}
