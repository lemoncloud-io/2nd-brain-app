// 팀 저장소에 PR 열기·닫기 — 앱은 여는 것까지만 한다. 머지는 사람이 GitHub 웹에서 한다.
// `gh` CLI 는 쓰지 않는다(현장에서 세 회사가 `gh auth login` 에서 막혔다).
import { githubRequest, type GithubCall } from './api'
import { mainT } from '../i18n'

export type Repo = { owner: string; repo: string }

export type PullRequestResult =
  { ok: true; number: number; url: string } | { ok: false; reason: string }

export type CloseResult = { ok: true } | { ok: false; reason: string }

const GITHUB_REPO = /github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/

/** 저장소 주소 → owner·repo. GitHub 주소가 아니면 null */
export const repoFromUrl = (url: string): Repo | null => {
  const match = GITHUB_REPO.exec(url.trim())
  return match ? { owner: match[1]!, repo: match[2]! } : null
}

/** GitHub API 응답 → 사용자가 할 일 */
const apiFailure = (
  status: number,
  body: { message?: string; errors?: { message?: string }[] }
): string => {
  const detail = [body.message, ...(body.errors ?? []).map((e) => e.message)].join(' ')
  if (/already exists/i.test(detail)) {
    return mainT().githubMain.alreadySent
  }
  if (status === 403 && /saml|sso|organization/i.test(detail)) {
    return mainT().githubMain.orgBlocked
  }
  if (status === 401 || status === 403) {
    return mainT().githubMain.noPushRight(status)
  }
  if (status === 404) {
    return mainT().githubMain.repoNotFound
  }
  return `${mainT().githubMain.sendFailed(status)}${body.message ? ` — ${body.message}` : ''}`
}

const call = async (
  deps: GithubCall,
  path: string,
  init: { method: string; body?: unknown }
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; reason: string }> => {
  const reply = await githubRequest(deps, path, init)
  if (!reply.ok)
    return {
      ok: false,
      reason:
        reply.unreached === 'login' ? mainT().githubMain.needLogin : mainT().githubMain.offline
    }
  // 객체가 아닌 본문(빈 본문 포함)은 빈 객체로 읽는다 — 필드는 부르는 쪽이 하나씩 본다
  const body =
    typeof reply.body === 'object' && reply.body !== null
      ? (reply.body as Record<string, unknown>)
      : {}
  if (reply.status < 200 || reply.status >= 300) {
    return { ok: false, reason: apiFailure(reply.status, body) }
  }
  return { ok: true, body }
}

export const createPullRequest = async (
  deps: GithubCall,
  input: { url: string; branch: string; base: string; title: string; body?: string }
): Promise<PullRequestResult> => {
  const repo = repoFromUrl(input.url)
  if (!repo) return { ok: false, reason: mainT().githubMain.notGithubRepo }
  const result = await call(deps, `/repos/${repo.owner}/${repo.repo}/pulls`, {
    method: 'POST',
    body: {
      title: input.title,
      head: input.branch,
      base: input.base,
      ...(input.body === undefined ? {} : { body: input.body })
    }
  })
  if (!result.ok) return result
  const number = result.body.number
  const url = result.body.html_url
  if (typeof number !== 'number' || typeof url !== 'string') {
    return { ok: false, reason: mainT().githubMain.noResult }
  }
  return { ok: true, number, url }
}

export const closePullRequest = async (
  deps: GithubCall,
  input: { url: string; number: number }
): Promise<CloseResult> => {
  const repo = repoFromUrl(input.url)
  if (!repo) return { ok: false, reason: mainT().githubMain.notGithubRepo }
  const result = await call(deps, `/repos/${repo.owner}/${repo.repo}/pulls/${input.number}`, {
    method: 'PATCH',
    body: { state: 'closed' }
  })
  return result.ok ? { ok: true } : { ok: false, reason: result.reason }
}

/** 열어 둔 PR 이 아직 열려 있나 — 머지·닫힘이면 false, 물어보지 못했으면 null */
export const pullRequestOpen = async (
  deps: GithubCall,
  input: { url: string; number: number }
): Promise<boolean | null> => {
  const repo = repoFromUrl(input.url)
  if (!repo) return null
  const result = await call(deps, `/repos/${repo.owner}/${repo.repo}/pulls/${input.number}`, {
    method: 'GET'
  })
  if (!result.ok) return null
  return result.body.state === 'open'
}
