// 엔진(CLI) 실패를 사용자 말 한 문장으로(shared/engine-failure.ts). lead = 안 된 일 + " — " 또는 빈 문자열
export const engineFailure = {
  clock: (hours: number, minutes: number): string =>
    `${hours}시${minutes > 0 ? ` ${minutes}분` : ''}`,
  usageLimitAt: (lead: string, at: string): string =>
    `${lead}AI 사용량이 한도에 닿았어요. ${at}쯤 다시 쓸 수 있어요`,
  usageLimit: (lead: string): string =>
    `${lead}AI 사용량이 한도에 닿았어요. 잠시 뒤 다시 쓸 수 있어요`,
  contextTooLong: (lead: string): string =>
    `${lead}한 번에 다루기엔 내용이 너무 많아요. 새 대화로 나눠 묻거나 자료를 나눠 넣어 주세요`,
  overloaded: (lead: string): string => `${lead}AI가 지금 붐벼요. 잠시 뒤 다시 시도해 주세요`,
  offline: (lead: string): string =>
    `${lead}인터넷에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요`,
  sessionExpired: (lead: string): string => `${lead}이전 대화를 이어가지 못했어요`,
  unknown: 'AI를 실행하지 못했어요'
}
