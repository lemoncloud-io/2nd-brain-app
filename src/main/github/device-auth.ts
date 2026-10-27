// GitHub 로그인 — device flow. 사용자는 앱이 보여 준 여덟 글자를 브라우저에 넣고 승인만 한다.
// 비밀번호도 토큰도 손으로 만들지 않는다: 현장에서 `gh auth login` 이 세 회사를 막았다.
// client_id 는 공개값이라 코드에 둔다. client_secret 은 쓰지 않는다(public client).
import { GITHUB_WEB } from './endpoints'
import { mainT } from '../i18n'

export type TokenStore = {
  read(): string | null
  write(token: string | null): void
}

export type StartResult =
  { ok: true; userCode: string; verificationUri: string } | { ok: false; reason: string }

export type FinishResult = { ok: true } | { ok: false; reason: string }

export type DeviceAuth = {
  start(): Promise<StartResult>
  finish(): Promise<FinishResult>
  token(): string | null
  signOut(): void
}

const DEVICE_CODE_URL = `${GITHUB_WEB}/login/device/code`
const TOKEN_URL = `${GITHUB_WEB}/login/oauth/access_token`
const GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
/**
 * repo = 비공개 저장소 올리기·받기·만들기·초대·PR. read:org = 팀 저장소를 만들 조직 목록.
 * 이 범위가 늘기 전 로그인은 read:org 가 없다 — 조직 목록이 다시 로그인하라고 말한다(`github/repos.ts`)
 */
export const SCOPE = 'repo read:org'

/** GitHub 가 돌려주는 실패 코드 → 사용자가 할 일 */
export const authFailureMessage = (error: string): string => {
  if (error === 'access_denied') return mainT().githubMain.denied
  if (error === 'expired_token') return mainT().githubMain.expired
  if (error === 'device_flow_disabled' || error === 'unauthorized_client') {
    return mainT().githubMain.orgBlockedLogin
  }
  if (error === 'slow_down') return mainT().githubMain.slowDown
  return mainT().githubMain.loginUnfinished(error)
}

type Pending = { deviceCode: string; intervalMs: number; expiresAt: number }

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

export const createDeviceAuth = (deps: {
  clientId: string
  fetch: typeof globalThis.fetch
  store: TokenStore
}): DeviceAuth => {
  let pending: Pending | null = null

  const post = async (
    url: string,
    body: Record<string, string>
  ): Promise<Record<string, string>> => {
    const response = await deps.fetch(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      // 끊긴 인터넷에 매달리지 않는다 — 시작·승인대기 모두 이 post 를 쓴다(api.ts 와 같은 15초)
      signal: AbortSignal.timeout(15_000)
    })
    return (await response.json()) as Record<string, string>
  }

  return {
    async start(): Promise<StartResult> {
      try {
        const body = await post(DEVICE_CODE_URL, { client_id: deps.clientId, scope: SCOPE })
        if (typeof body.error === 'string')
          return { ok: false, reason: authFailureMessage(body.error) }
        const { device_code: deviceCode, user_code: userCode, verification_uri: uri } = body
        if (!deviceCode || !userCode || !uri) {
          return {
            ok: false,
            reason: mainT().githubMain.noCode
          }
        }
        pending = {
          deviceCode,
          intervalMs: Number(body.interval ?? '5') * 1000,
          expiresAt: Date.now() + Number(body.expires_in ?? '900') * 1000
        }
        return { ok: true, userCode, verificationUri: uri }
      } catch {
        return { ok: false, reason: mainT().githubMain.unreachable }
      }
    },

    // 사람이 브라우저에서 승인할 때까지 기다린다. 기다리는 동안 앱은 다른 일을 할 수 있다
    async finish(): Promise<FinishResult> {
      if (!pending) return { ok: false, reason: mainT().githubMain.startFirst }
      const now = pending
      for (;;) {
        if (Date.now() > now.expiresAt) {
          pending = null
          return { ok: false, reason: authFailureMessage('expired_token') }
        }
        let body: Record<string, string>
        try {
          body = await post(TOKEN_URL, {
            client_id: deps.clientId,
            device_code: now.deviceCode,
            grant_type: GRANT
          })
        } catch {
          pending = null
          return { ok: false, reason: mainT().githubMain.unreachable }
        }
        if (typeof body.access_token === 'string') {
          deps.store.write(body.access_token)
          pending = null
          return { ok: true }
        }
        const error = body.error ?? 'unknown'
        if (error !== 'authorization_pending' && error !== 'slow_down') {
          pending = null
          return { ok: false, reason: authFailureMessage(error) }
        }
        // slow_down 은 간격을 5초 늘리라는 뜻이다
        if (error === 'slow_down') now.intervalMs += 5000
        await wait(now.intervalMs)
      }
    },

    token: () => deps.store.read(),

    signOut(): void {
      pending = null
      deps.store.write(null)
    }
  }
}
