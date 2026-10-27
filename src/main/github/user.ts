// 로그인한 GitHub 계정 — 앱이 만드는 커밋의 작성자가 된다(`vault/app-identity.ts`).
import { githubRequest, type GithubCall } from './api'

export type GithubUser = { login: string; id: number }

// GitHub 아이디 규칙(영문·숫자·하이픈, 하이픈으로 시작하지 않음, 39자 이하) — git 인자로 들어가므로 이 밖은 받지 않는다
export const GITHUB_LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/

export const parseGithubUser = (raw: unknown): GithubUser | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const { login, id } = raw as Record<string, unknown> // 위에서 객체임을 확인했다 — 필드는 아래에서 하나씩 본다
  if (typeof login !== 'string' || !GITHUB_LOGIN.test(login)) return null
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null
  return { login, id }
}

/** 로그인 토큰으로 `GET /user` — 읽지 못하면 null(커밋은 앱 이름으로 남는다) */
export const fetchGithubUser = async (deps: GithubCall): Promise<GithubUser | null> => {
  // 로그인 마무리가 이 답을 기다린다 — GitHub 가 멈추면 코드 화면이 계속 떠 있다
  const reply = await githubRequest(deps, '/user', { timeoutMs: 5000 })
  return reply.ok && reply.status === 200 ? parseGithubUser(reply.body) : null
}
