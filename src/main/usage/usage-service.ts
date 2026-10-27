// 계정의 남은 여유 — CLI 가 이미 넣어 둔 토큰으로 사용량 엔드포인트에 한 번 묻는다.
// 경계는 이 파일이다: 안에서는 자격증명을 만지고, 밖으로는 숫자와 시각만 나간다.
// 앱은 로그인을 제공하지 않는다 — 로그인은 CLI 의 일이고 여기서는 읽기만 한다(PRODUCT.md § Naming).
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  EMPTY_ACCOUNT_USAGE,
  type AccountUsage,
  type ScopedUsage
} from '../../shared/account-usage'

// 설정으로 빼지 않는다 — 자격증명이 가는 주소는 코드에 박혀 있어야 한다
const USAGE_URL = 'https://api.anthropic.com/oauth/usage'
const KEYCHAIN_SERVICE = 'Claude Code-credentials'
/** 느린 망에서 지표 줄이 영영 안 뜨지 않게 — 참조 구현도 3초다 */
const TIMEOUT_MS = 3000
const CACHE_MS = 60_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** `.claudeAiOauth.accessToken` — 그 밖의 필드는 보지 않는다 */
const tokenIn = (raw: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(raw)
    const oauth = isRecord(parsed) ? parsed['claudeAiOauth'] : null
    const token = isRecord(oauth) ? oauth['accessToken'] : null
    return typeof token === 'string' && token !== '' ? token : null
  } catch {
    return null
  }
}

const fromKeychain = (): Promise<string | null> =>
  new Promise((resolve) => {
    execFile(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8', timeout: TIMEOUT_MS, windowsHide: true },
      (error, stdout) => resolve(error ? null : tokenIn(stdout))
    )
  })

/** CLAUDE_CONFIG_DIR 을 지키는 자격증명 파일 — macOS 밖의 기본 자리다 */
const fromFile = (): string | null => {
  const dir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  try {
    return tokenIn(readFileSync(join(dir, '.credentials.json'), 'utf8'))
  } catch {
    return null
  }
}

/** 둘 다 없으면 사용량은 없는 것으로 둔다 — 로그인을 권하지 않는다(CLI 의 일이다) */
const readToken = async (): Promise<string | null> =>
  (process.platform === 'darwin' ? await fromKeychain() : null) ?? fromFile()

const percentIn = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null

const isoIn = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null

/** 모델별 주간 한도만 — 다른 종류는 이 줄에서 말할 자리가 없다 */
const scopedIn = (limits: unknown): ScopedUsage[] => {
  if (!Array.isArray(limits)) return []
  const out: ScopedUsage[] = []
  for (const limit of limits) {
    if (!isRecord(limit) || limit['kind'] !== 'weekly_scoped') continue
    const scope = isRecord(limit['scope']) ? limit['scope'] : {}
    const model = isRecord(scope['model']) ? scope['model'] : {}
    const name = model['display_name']
    const percent = percentIn(limit['percent'])
    if (typeof name === 'string' && name !== '' && percent !== null) out.push({ name, percent })
  }
  return out
}

/** 응답 모양이 바뀌어도 읽을 수 있는 만큼만 읽는다 — 파싱 실패를 에러로 올리지 않는다 */
export const parseUsage = (body: unknown): AccountUsage => {
  if (!isRecord(body)) return EMPTY_ACCOUNT_USAGE
  const fiveHour = isRecord(body['five_hour']) ? body['five_hour'] : {}
  const sevenDay = isRecord(body['seven_day']) ? body['seven_day'] : {}
  return {
    fiveHour: percentIn(fiveHour['utilization']),
    sevenDay: percentIn(sevenDay['utilization']),
    fiveHourResetsAt: isoIn(fiveHour['resets_at']),
    sevenDayResetsAt: isoIn(sevenDay['resets_at']),
    scoped: scopedIn(body['limits'])
  }
}

type Fetched = { usage: AccountUsage; at: number }

export type UsageDeps = {
  readToken: () => Promise<string | null>
  ask: (token: string) => Promise<{ status: number; body: unknown }>
  now: () => number
}

const askEndpoint = async (token: string): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(USAGE_URL, {
    headers: {
      accept: 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
      authorization: `Bearer ${token}`,
      'user-agent': 'claude-code/2.1.11'
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  const body: unknown = response.ok ? await response.json().catch(() => null) : null
  return { status: response.status, body }
}

/**
 * 읽는 창구 하나 — 60초 캐시와 겹친 요청 합치기를 여기서 한다.
 * 실패도 같은 길이로 기억한다: 토큰이 만료돼 있으면 성공이 영영 안 오는데, 기억하지 않으면
 * 화면이 물을 때마다 Keychain 과 엔드포인트를 두 번씩 두드린다.
 * 실패의 결과는 언제나 빈 사용량이다 — 여유 칸은 조용히 빠지는 쪽이 맞다(보조 정보).
 */
export const createUsageReader = (
  deps: UsageDeps = { readToken, ask: askEndpoint, now: () => Date.now() }
): ((fresh?: boolean) => Promise<AccountUsage>) => {
  let cached: Fetched | null = null
  let inFlight: Promise<AccountUsage> | null = null

  const fetchOnce = async (): Promise<AccountUsage> => {
    const startedAt = deps.now()
    // 401·403 은 토큰이 갈린 것이다 — 한 번만 다시 읽고, 또 아니면 이번에는 보여 주지 않는다
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // 읽기 전체에 시간 예산 하나 — 자격증명 읽기가 오래 끌면 다시 시도하지 않는다
      if (attempt > 0 && deps.now() - startedAt > TIMEOUT_MS) break
      const token = await deps.readToken()
      if (token === null) return EMPTY_ACCOUNT_USAGE
      const { status, body } = await deps.ask(token)
      if (status === 401 || status === 403) continue
      if (status < 200 || status >= 300) return EMPTY_ACCOUNT_USAGE
      return parseUsage(body)
    }
    return EMPTY_ACCOUNT_USAGE
  }

  // `fresh` 는 사람이 다시 보기를 누른 것이다 — 기억해 둔 값을 건너뛴다. 이미 나가 있는 요청에는
  // 그대로 붙는다: 누른 사람이 여럿이어도 바깥으로 나가는 요청은 하나다
  return async (fresh = false): Promise<AccountUsage> => {
    if (!fresh && cached !== null && deps.now() - cached.at < CACHE_MS) return cached.usage
    // 대화 여럿이 같은 시점에 물어도 바깥으로 나가는 요청은 하나다
    if (inFlight !== null) return inFlight
    inFlight = fetchOnce()
      .catch(() => EMPTY_ACCOUNT_USAGE)
      .then((usage) => {
        cached = { usage, at: deps.now() }
        return usage
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }
}
