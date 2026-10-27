// 팀 저장소 — 대표가 앱에서 비공개 저장소를 만들고 팀원을 GitHub 아이디로 초대한다.
// 사람은 GitHub 화면을 오가지 않는다. 실패 사유는 할 일로 말하고, GitHub 가 한 말은 "자세히" 에 남긴다(`detail`).
import type {
  CreateTeamRepoResult,
  GithubFailure,
  GithubOrgs,
  InviteResult,
  TeamInvitation,
  TeamVault,
  TeamVaults
} from '../../shared/ipc-contract'
import { githubRequest, type GithubCall, type GithubReply } from './api'
import { repoFromUrl } from './pull-request'
import { GITHUB_LOGIN } from './user'
import { mainT } from '../i18n'

// GitHub 저장소 이름 규칙 — 영문·숫자·`.`·`_`·`-`, 100자 이하. `.`·`..` 는 경로라 받지 않는다
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/

/** 보내지 못했으면 할 일 문장, 받았으면 응답 그대로 */
const request = async (
  deps: GithubCall,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<GithubReply | GithubFailure> => {
  const reply = await githubRequest(deps, path, init)
  if (reply.ok) return reply
  return {
    ok: false,
    reason: reply.unreached === 'login' ? mainT().githubMain.loginAbove : mainT().githubMain.offline
  }
}

const failed = (reply: GithubReply | GithubFailure): reply is GithubFailure => !reply.ok

/** GitHub 가 한 말 — message 와 errors[].message 를 한 줄로. 사람에게는 "자세히" 로만 보인다 */
const githubSaid = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null) return undefined
  const { message, errors } = body as { message?: unknown; errors?: unknown } // 모양은 아래에서 하나씩 본다
  const parts = [
    typeof message === 'string' ? message : '',
    ...(Array.isArray(errors)
      ? errors.map((e: unknown) =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as { message?: unknown }).message === 'string'
            ? (e as { message: string }).message
            : ''
        )
      : [])
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

const withDetail = (reason: string, body: unknown, link?: string): GithubFailure => {
  const detail = githubSaid(body)
  return {
    ok: false,
    reason,
    ...(detail === undefined ? {} : { detail }),
    ...(link === undefined ? {} : { link })
  }
}

/**
 * 내가 속한 조직 — 팀 저장소를 어디에 만들지 고르는 목록. 조직을 읽을 권한(read:org)이 없는 예전 로그인이면
 * 다시 로그인하라고 돌려준다 — 권한 목록 헤더로도 본다(조직이 빈 목록으로 오면 "조직이 없다" 와 가려지지 않는다)
 */
export const listOrgs = async (deps: GithubCall): Promise<GithubOrgs> => {
  const reply = await request(deps, '/user/orgs?per_page=100')
  if (failed(reply)) return reply
  const scopes = reply.headers.get('x-oauth-scopes')
  const canReadOrgs = scopes === null || /(^|[\s,])(read|write|admin):org([\s,]|$)/.test(scopes)
  // 401 = 로그인이 풀렸다(만들기도 안 된다) · 403·권한 목록에 read:org 없음 = 예전 로그인(내 계정은 된다)
  if (reply.status === 401) return { ok: false, reason: mainT().githubMain.signedOut }
  if (reply.status === 403 || !canReadOrgs) {
    return { ok: false, reason: mainT().githubMain.reloginOrgs, relogin: true }
  }
  if (reply.status !== 200 || !Array.isArray(reply.body)) {
    return withDetail(mainT().githubMain.orgsFailed, reply.body)
  }
  const orgs = reply.body
    .map((org: unknown) =>
      typeof org === 'object' && org !== null ? (org as { login?: unknown }).login : undefined
    )
    .filter((login): login is string => typeof login === 'string' && GITHUB_LOGIN.test(login))
  return { ok: true, orgs }
}

/** 조직이 OAuth 앱 접근을 막아 두었다는 GitHub 의 말 */
const OAUTH_RESTRICTED = /oauth app access restrictions/i

/** 비공개 팀 저장소를 만든다 — `org` 가 null 이면 내 계정 아래. 만든 저장소의 받을 주소(https)를 돌려준다 */
export const createTeamRepo = async (
  deps: GithubCall,
  input: { org: string | null; name: string }
): Promise<CreateTeamRepoResult> => {
  const name = input.name.trim()
  if (!REPO_NAME.test(name) || name === '.' || name === '..') {
    return {
      ok: false,
      reason: mainT().githubMain.badRepoName
    }
  }
  if (input.org !== null && !GITHUB_LOGIN.test(input.org)) {
    return { ok: false, reason: mainT().githubMain.noOrg }
  }
  const path = input.org === null ? '/user/repos' : `/orgs/${input.org}/repos`
  const reply = await request(deps, path, {
    method: 'POST',
    body: {
      name,
      private: true,
      // ui-hangul-ignore: GitHub 저장소 설명 — 팀이 보는 저장소 데이터(D8)
      description: '2nd-brain 팀 보관함'
    }
  })
  if (failed(reply)) return reply
  if (reply.status === 201) {
    const url = (reply.body as { clone_url?: unknown } | null)?.clone_url // 모양은 바로 아래에서 본다
    if (typeof url === 'string' && repoFromUrl(url)) return { ok: true, url }
    return withDetail(mainT().githubMain.noRepoUrl, reply.body)
  }
  const said = githubSaid(reply.body) ?? ''
  if (reply.status === 422 && /already exists/i.test(said)) {
    return { ...withDetail(mainT().githubMain.repoExists, reply.body), exists: true }
  }
  if (input.org !== null && reply.status === 403 && OAUTH_RESTRICTED.test(said)) {
    return withDetail(
      mainT().githubMain.orgBlocksApp(input.org),
      reply.body,
      `https://github.com/organizations/${input.org}/settings/oauth_application_policy`
    )
  }
  if (reply.status === 401) return withDetail(mainT().githubMain.signedOut, reply.body)
  if (input.org !== null && (reply.status === 403 || reply.status === 404)) {
    return withDetail(mainT().githubMain.orgNoRight(input.org), reply.body)
  }
  return withDetail(mainT().githubMain.createFailed(reply.status), reply.body)
}

/**
 * 팀 저장소에 팀원을 GitHub 아이디로 초대한다(쓰기 권한). 오타가 남에게 가지 않게 있는 아이디인지 먼저 본다.
 * 초대받은 사람은 GitHub 알림·이메일에서 수락한다 — 수락하기 전에는 저장소가 보이지 않는다
 */
export const inviteMember = async (
  deps: GithubCall,
  input: { url: string; username: string }
): Promise<InviteResult> => {
  const username = input.username.trim()
  if (!GITHUB_LOGIN.test(username)) {
    return { ok: false, reason: mainT().githubMain.badUsername }
  }
  const repo = repoFromUrl(input.url)
  if (!repo) return { ok: false, reason: mainT().githubMain.notGithubRepo }
  const user = await request(deps, `/users/${username}`)
  if (failed(user)) return user
  if (user.status === 404) {
    return { ok: false, reason: mainT().githubMain.noSuchUser(username) }
  }
  if (user.status === 401) return withDetail(mainT().githubMain.signedOut, user.body)
  if (user.status !== 200) {
    return withDetail(mainT().githubMain.userCheckFailed(user.status), user.body)
  }
  const reply = await request(deps, `/repos/${repo.owner}/${repo.repo}/collaborators/${username}`, {
    method: 'PUT',
    body: { permission: 'push' }
  })
  if (failed(reply)) return reply
  if (reply.status === 201) return { ok: true, state: 'invited' }
  if (reply.status === 204) return { ok: true, state: 'already' }
  if (reply.status === 403 || reply.status === 404) {
    return withDetail(mainT().githubMain.noInviteRight, reply.body)
  }
  if (reply.status === 401) return withDetail(mainT().githubMain.signedOut, reply.body)
  return withDetail(mainT().githubMain.inviteFailed(reply.status), reply.body)
}

/** 저장소마다 보관함인지 한 번씩 묻는다 — 최근에 올린 순으로 이만큼만(사람이 고르기에도 충분하다) */
const LOOK_AT_MOST = 30
const VAULT_MARK = 'VAULT_RULES.md'

/** 모양 모르는 응답에서 필드 하나 — 객체가 아니면 undefined */
export const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined // 모양은 부르는 쪽이 typeof 로 본다

/** 받을 주소가 GitHub https 주소일 때만 — 다른 모양은 받기가 로그인 토큰을 싣지 못한다 */
const cloneUrl = (value: unknown): string | null => {
  const url = field(value, 'clone_url')
  return typeof url === 'string' && /^https:\/\/github\.com\//.test(url) && repoFromUrl(url)
    ? url
    : null
}

/**
 * 팀원이 들어갈 수 있는 보관함 — 내 저장소·초대받아 들어간 저장소·조직 저장소 중 보관함(`VAULT_RULES.md` 가 있는 것)과,
 * 아직 수락하지 않은 초대. 팀원은 주소를 몰라도 여기서 골라 받는다
 */
export const listTeamVaults = async (deps: GithubCall): Promise<TeamVaults> => {
  const [repos, invites] = await Promise.all([
    request(
      deps,
      '/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100'
    ),
    request(deps, '/user/repository_invitations')
  ])
  if (failed(repos)) return repos
  if (repos.status === 401) return { ok: false, reason: mainT().githubMain.signedOut }
  if (repos.status !== 200 || !Array.isArray(repos.body)) {
    return withDetail(mainT().githubMain.joinableFailed, repos.body)
  }
  // 이름은 받을 주소에서 읽는다 — 주소와 이름이 어긋나지 않고, 경로에 들어갈 조각도 검사된 것이다
  const candidates = repos.body
    .flatMap((repo: unknown): TeamVault[] => {
      const url = cloneUrl(repo)
      const parts = url === null ? null : repoFromUrl(url)
      return url !== null && parts ? [{ fullName: `${parts.owner}/${parts.repo}`, url }] : []
    })
    .slice(0, LOOK_AT_MOST)
  // 200 = 보관함 · 404 = 보관함 아님 · 그 밖(한도·네트워크) = 모른다
  const marks = await Promise.all(
    candidates.map(async (repo): Promise<boolean | null> => {
      const reply = await request(deps, `/repos/${repo.fullName}/contents/${VAULT_MARK}`)
      if (failed(reply)) return null
      if (reply.status === 200) return true
      return reply.status === 404 ? false : null
    })
  )
  // 하나도 확인하지 못했다 — "들어갈 수 있는 보관함이 없어요" 로 읽히면 엉뚱한 사람을 찾게 된다
  if (candidates.length > 0 && marks.every((mark) => mark === null)) {
    return {
      ok: false,
      reason: mainT().githubMain.vaultCheckFailed
    }
  }
  const vaults = candidates.filter((_, i) => marks[i] === true)
  // 초대를 읽지 못해도 보관함 목록은 보여 준다 — 초대는 GitHub 알림에서도 수락할 수 있다
  const invitations: TeamInvitation[] =
    !failed(invites) && invites.status === 200 && Array.isArray(invites.body)
      ? invites.body.flatMap((invite: unknown) => {
          const id = field(invite, 'id')
          const repo = field(invite, 'repository')
          const fullName = field(repo, 'full_name')
          const url = cloneUrl(repo)
          const inviter = field(field(invite, 'inviter'), 'login')
          return typeof id === 'number' && typeof fullName === 'string' && url !== null
            ? [{ id, fullName, url, inviter: typeof inviter === 'string' ? inviter : '' }]
            : []
        })
      : []
  return { ok: true, vaults, invitations }
}

/** 받은 초대를 수락한다 — 그 뒤로 저장소가 보이고 받을 수 있다 */
export const acceptInvitation = async (
  deps: GithubCall,
  id: number
): Promise<{ ok: true } | GithubFailure> => {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, reason: mainT().githubMain.unknownInvite }
  }
  const reply = await request(deps, `/user/repository_invitations/${id}`, { method: 'PATCH' })
  if (failed(reply)) return reply
  if (reply.status === 204 || reply.status === 200) return { ok: true }
  if (reply.status === 401) return withDetail(mainT().githubMain.signedOut, reply.body)
  // 이미 수락했다(수락 뒤 받기가 실패해 다시 누름) — 받기로 넘어간다. 취소된 초대면 받기가 찾지 못했다고 말한다
  if (reply.status === 404) return { ok: true }
  return withDetail(mainT().githubMain.acceptFailed(reply.status), reply.body)
}

/**
 * 혼자 쓰는 내 저장소인가 — 주인이 로그인 아이디이고 구성원이 나뿐일 때만 참. 승인이 확인 요청 없이 기본 줄기에 바로
 * 올라가도 되는지를 이것으로 가른다. 확인하지 못하면(권한·네트워크·모양) 거짓 — 남과 쓰는 저장소에 바로 올리지 않는 쪽이 안전하다
 */
export const isPersonalRepo = async (
  deps: GithubCall,
  input: { url: string; login: string }
): Promise<boolean> => {
  // 주소 어딘가에 github.com 이 든 다른 서버를 GitHub 으로 보지 않는다 — 이 판정이 기본 줄기에 바로 올릴지를 가른다
  if (!/^(https:\/\/github\.com\/|git@github\.com:)/i.test(input.url.trim())) return false
  const repo = repoFromUrl(input.url)
  const me = input.login.toLowerCase()
  if (!repo || repo.owner.toLowerCase() !== me) return false
  // 둘만 받아도 판정이 같다 — 나 말고 한 명이라도 있으면 거짓
  const reply = await request(deps, `/repos/${repo.owner}/${repo.repo}/collaborators?per_page=2`)
  if (failed(reply) || reply.status !== 200 || !Array.isArray(reply.body)) return false
  return reply.body.every((user: unknown) => {
    const login = field(user, 'login')
    return typeof login === 'string' && login.toLowerCase() === me
  })
}

/** 첫 실행 저장소 이름 — 겹치면 `2nd-brain-2`… 이만큼까지 */
export const STARTER_REPO = '2nd-brain'
export const STARTER_NAME_TRIES = 10
export const starterRepoName = (n: number): string =>
  n === 1 ? STARTER_REPO : `${STARTER_REPO}-${n}`

/** `owner/name` — 앱이 저장소 주소를 만들기 전에 거른다 */
export const FULL_NAME = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/

export type GenerateResult =
  { ok: true; fullName: string } | (GithubFailure & { templateHidden?: true })

/**
 * 템플릿 저장소로 내 계정에 비공개 저장소를 만든다 — 이름이 겹치면 `2nd-brain-2`… 로 다시. 템플릿을 볼 수 없으면(404)
 * `templateHidden` — 부르는 쪽이 앱 뼈대로 대신 만든다
 */
export const generateFromTemplate = async (
  deps: GithubCall,
  input: { template: string; owner: string }
): Promise<GenerateResult> => {
  if (!FULL_NAME.test(input.template) || !GITHUB_LOGIN.test(input.owner)) {
    return { ok: false, reason: mainT().githubMain.noOwner }
  }
  for (let n = 1; n <= STARTER_NAME_TRIES; n += 1) {
    const reply = await request(deps, `/repos/${input.template}/generate`, {
      method: 'POST',
      body: {
        owner: input.owner,
        name: starterRepoName(n),
        private: true,
        include_all_branches: false,
        // ui-hangul-ignore: GitHub 저장소 설명 — 저장소 데이터(D8)
        description: '2nd-brain 자료 보관함'
      }
    })
    if (failed(reply)) return reply
    if (reply.status === 201) {
      const fullName = field(reply.body, 'full_name')
      if (typeof fullName === 'string' && FULL_NAME.test(fullName)) return { ok: true, fullName }
      // 저장소는 생겼다 — 보낸 이름으로 이어 간다(실패로 돌리면 다시 누를 때 하나 더 만든다)
      console.warn('could not read the templated repo name from the response', reply.body)
      return { ok: true, fullName: `${input.owner}/${starterRepoName(n)}` }
    }
    if (reply.status === 422 && /already exists/i.test(githubSaid(reply.body) ?? '')) continue
    if (reply.status === 404) {
      return { ...withDetail(mainT().githubMain.templateHidden, reply.body), templateHidden: true }
    }
    if (reply.status === 401) return withDetail(mainT().githubMain.signedOut, reply.body)
    return withDetail(mainT().githubMain.starterFailed(reply.status), reply.body)
  }
  return {
    ok: false,
    reason: mainT().githubMain.starterTaken(STARTER_REPO, STARTER_NAME_TRIES)
  }
}
