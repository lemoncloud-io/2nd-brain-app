// GitHub REST 한 창구 — 토큰 확인·헤더·시간 제한·연결 실패를 한 곳에서 한다.
// 응답을 어떻게 사람 말로 바꿀지는 부르는 쪽(PR·팀 저장소·내 계정)이 정한다.
import { GITHUB_API } from './endpoints'

export type GithubCall = { token: string | null; fetch: typeof globalThis.fetch }

export type GithubReply = { ok: true; status: number; body: unknown; headers: Headers }
/** login = 토큰이 없어 보내지 않았다 · offline = 보냈는데 닿지 못했다(네트워크·시간 초과)
 * @throws TypeError 요청 본문을 직렬화하지 못하면 (프로그래머 오류 — offline으로 위장하지 않음) */
export type GithubUnreached = { ok: false; unreached: 'login' | 'offline' }

export const githubRequest = async (
  deps: GithubCall,
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<GithubReply | GithubUnreached> => {
  if (!deps.token) return { ok: false, unreached: 'login' }
  let bodyText: string | undefined
  try {
    bodyText = init.body === undefined ? undefined : JSON.stringify(init.body)
  } catch (error) {
    console.error('could not build the GitHub request body', path, error)
    throw new TypeError(`could not serialize the GitHub request body: ${path}`, { cause: error })
  }
  try {
    const response = await deps.fetch(`${GITHUB_API}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${deps.token}`,
        'content-type': 'application/json'
      },
      // 멈춘 GitHub 를 화면이 끝없이 기다리지 않게
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
      ...(bodyText === undefined ? {} : { body: bodyText })
    })
    // 204(이미 들어와 있음 등)는 본문이 없다
    const body: unknown = await response.json().catch((error: unknown) => {
      if (response.status !== 204)
        console.error('could not read the GitHub response', path, response.status, error)
      return null
    })
    return { ok: true, status: response.status, body, headers: response.headers }
  } catch (error) {
    const name = error instanceof Error ? error.name : String(error)
    console.error('GitHub request failed', path, name, error)
    return { ok: false, unreached: 'offline' }
  }
}
