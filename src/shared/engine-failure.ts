// 엔진(CLI)이 실패했을 때 그것이 무엇이었는지 가려내는 한 곳.
// 이 판정이 두 가지를 정한다: 사용자에게 무엇이라 말할지, 그리고 다시 시도해도 되는지.
// 한도에 걸린 요청을 곧바로 다시 보내면 같은 한도에 한 번 더 부딪칠 뿐이다.
//
// 문구는 CLI 가 프로바이더 응답을 그대로 실어 보내므로 영어다. 아래 패턴은 실제로 본 형태에서 왔다:
// `Claude AI usage limit reached|1758067200` (claude CLI, 파이프 뒤는 해제 유닉스 초),
// `rate limit`, `overloaded_error`, `context length exceeded`, `prompt is too long`.
import { currentT } from './i18n'

/**
 * 사용자 문장과 원문을 한 문자열에 실어 나를 때 쓰는 칸막이 — 눈에 보이는 글자가 아니다.
 * 줄바꿈으로 가르면 스택 트레이스의 첫 줄이 사용자 문장으로 오해된다.
 */
export const DETAIL_MARK = '\u241f'

export type EngineFailureKind =
  /** 이어가려던 대화 세션이 없다 — 새 세션으로 다시 물어도 된다 */
  | 'session-expired'
  /** 구독 사용량 한도 — 시간이 풀어 준다. 다시 시도하면 안 된다 */
  | 'usage-limit'
  /** 보낸 내용이 모델이 한 번에 담을 수 있는 양을 넘었다 */
  | 'context-too-long'
  /** 프로바이더가 붐빈다 — 잠시 뒤에는 될 수 있다 */
  | 'overloaded'
  /** 네트워크 */
  | 'offline'
  | 'unknown'

// 상태 코드는 낱말 경계로만 — 세션 id(uuid) 속 숫자를 코드로 읽지 않는다
const PATTERNS: [EngineFailureKind, RegExp][] = [
  [
    'usage-limit',
    /usage limit|rate[ _-]?limit|quota|\b429\b|too many requests|insufficient_quota/i
  ],
  ['context-too-long', /context (?:length|window)|prompt is too long|maximum context|token limit/i],
  ['overloaded', /overloaded|server error|\b50[23]\b|temporarily unavailable/i],
  ['offline', /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|fetch failed|getaddrinfo/i],
  [
    'session-expired',
    // ui-hangul-ignore: CLI 가 내는 한국어 원문을 알아보는 패턴이다
    /no conversation found|no rollout found|session not found|no such session|--resume|세션을 찾을 수 없|세션이 만료/i
  ]
]

export const classifyEngineFailure = (raw: string): EngineFailureKind => {
  for (const [kind, pattern] of PATTERNS) if (pattern.test(raw)) return kind
  return 'unknown'
}

/** 한도 해제 시각 — `…|<유닉스 초>` 형태로 올 때만. 못 읽으면 null */
export const limitResetAt = (raw: string): Date | null => {
  const match = /\|\s*(\d{9,13})\b/.exec(raw)
  if (!match) return null
  const value = Number(match[1])
  const ms = value > 1e11 ? value : value * 1000
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? null : date
}

const clock = (date: Date): string =>
  currentT().engineFailure.clock(date.getHours(), date.getMinutes())

/**
 * 실패를 사용자 말 한 문장으로. 원문은 버리지 않고 부르는 쪽이 접어서 들고 간다.
 * `what` 은 안 된 일("위키화를 마치지 못했다")이고, 없으면 일반 문장을 쓴다.
 */
export const describeEngineFailure = (raw: string, what?: string): string => {
  const kind = classifyEngineFailure(raw)
  const lead = what ? `${what} — ` : ''
  const t = currentT().engineFailure
  switch (kind) {
    case 'usage-limit': {
      const at = limitResetAt(raw)
      return at ? t.usageLimitAt(lead, clock(at)) : t.usageLimit(lead)
    }
    case 'context-too-long':
      return t.contextTooLong(lead)
    case 'overloaded':
      return t.overloaded(lead)
    case 'offline':
      return t.offline(lead)
    case 'session-expired':
      return t.sessionExpired(lead)
    case 'unknown':
      return what ?? t.unknown
  }
}

/** 사용자 말 한 문장 + 접어 둔 원문 — 엔진 실패를 화면에 낼 때의 모양 */
export const layeredFailure = (raw: string): string =>
  `${describeEngineFailure(raw)}${DETAIL_MARK}${raw}`
