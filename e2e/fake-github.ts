// 가짜 GitHub — 로그인(device flow)·내 계정(`alice`, id 7)·PR·팀 저장소 만들기·조직·초대 API 만.
// 팀 저장소 `acme/team` 은 비공개(로그인 없이 404)다. 조직은 `acme`(만들 수 있음)와 `locked`(OAuth 앱 접근을 막아 둠).
// 있는 GitHub 아이디는 `alice`·`bob` 뿐이다. 들어갈 수 있는 보관함·받은 초대는 `options` 로 정한다.
// 템플릿 `lemoncloud-io/2nd-brain-template` 으로 만들기(generate)는 `created` 에 남기기만 한다 — 받을 내용은 시험이
// git `insteadOf` 로 로컬 bare 저장소에 돌린다. `templateHidden` 이면 템플릿이 안 보인다(404).
// 앱에는 `SECOND_BRAIN_GITHUB_API`·`SECOND_BRAIN_GITHUB_WEB` 로 이 주소를 준다.
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { expect, type ServeFixture } from './fixtures'
import { goTo } from './helpers'

export const TEAM_URL = 'https://github.com/acme/team.git'

export type Pull = { title: string; head: string; base: string; body?: string; auth: string }

/** 앱이 만든 저장소와 보낸 초대 — 시험이 무엇이 GitHub 로 갔는지 본다 */
export type Created = { owner: string; name: string; private: boolean; template?: string }
export type Invited = { repo: string; user: string }
/** 받은 초대 — 수락(PATCH)하면 들어갈 수 있는 보관함이 된다 */
export type Invitation = { id: number; repo: string; inviter: string }

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((done) => {
    let text = ''
    req.on('data', (chunk: Buffer) => (text += chunk.toString()))
    req.on('end', () => done(text))
  })

export const fakeGithub = async (
  serve: ServeFixture,
  options: { vaults?: string[]; invitations?: Invitation[]; templateHidden?: boolean } = {}
): Promise<{
  url: string
  env: Record<string, string>
  pulls: Pull[]
  created: Created[]
  invited: Invited[]
  accepted: number[]
}> => {
  const vaults = [...(options.vaults ?? [])]
  const invitations = [...(options.invitations ?? [])]
  const accepted: number[] = []
  const cloneOf = (repo: string): string => `https://github.com/${repo}.git`
  const pulls: Pull[] = []
  const created: Created[] = []
  const invited: Invited[] = []
  let base = ''
  const port = await serve((req: IncomingMessage, res: ServerResponse) => {
    void readBody(req).then((text) => {
      const send = (status: number, body: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      const url = req.url ?? ''
      const signedIn = req.headers.authorization === 'Bearer gho_fake'
      if (url === '/login/device/code') {
        return send(200, {
          device_code: 'dev-1',
          user_code: 'ABCD-1234',
          verification_uri: `${base}/device`,
          interval: '0',
          expires_in: '900'
        })
      }
      if (url === '/login/oauth/access_token') return send(200, { access_token: 'gho_fake' })
      if (url === '/user' && req.method === 'GET') {
        return signedIn
          ? send(200, { login: 'alice', id: 7 })
          : send(401, { message: 'Requires authentication' })
      }
      if (url === '/user/orgs?per_page=100' && signedIn) {
        res.setHeader('x-oauth-scopes', 'repo, read:org')
        return send(200, [{ login: 'acme' }, { login: 'locked' }])
      }
      const createIn = url === '/user/repos' ? 'alice' : /^\/orgs\/([^/]+)\/repos$/.exec(url)?.[1]
      if (createIn && req.method === 'POST' && signedIn) {
        if (createIn === 'locked') {
          return send(403, {
            message:
              'Although you appear to have the correct authorization credentials, the `locked` organization has enabled OAuth App access restrictions'
          })
        }
        const input = JSON.parse(text) as { name: string; private: boolean }
        if (created.some((repo) => repo.owner === createIn && repo.name === input.name)) {
          return send(422, {
            message: 'Repository creation failed.',
            errors: [{ message: 'name already exists on this account' }]
          })
        }
        created.push({ owner: createIn, name: input.name, private: input.private })
        return send(201, { clone_url: `https://github.com/${createIn}/${input.name}.git` })
      }
      const template = /^\/repos\/([^/]+\/[^/]+)\/generate$/.exec(url)?.[1]
      if (template && req.method === 'POST' && signedIn) {
        if (options.templateHidden) return send(404, { message: 'Not Found' })
        const input = JSON.parse(text) as { owner: string; name: string; private: boolean }
        if (created.some((repo) => repo.owner === input.owner && repo.name === input.name)) {
          return send(422, {
            message: 'Repository creation failed.',
            errors: [{ message: 'name already exists on this account' }]
          })
        }
        created.push({ owner: input.owner, name: input.name, private: input.private, template })
        const fullName = `${input.owner}/${input.name}`
        return send(201, { full_name: fullName, clone_url: cloneOf(fullName) })
      }
      if (url.startsWith('/user/repos?') && req.method === 'GET' && signedIn) {
        // 보관함 아닌 저장소도 섞어 둔다 — 앱이 VAULT_RULES.md 로 거르는지 본다
        const repos = [...vaults, 'alice/code'].map((repo) => ({
          full_name: repo,
          clone_url: cloneOf(repo)
        }))
        return send(200, repos)
      }
      const marked = /^\/repos\/([^/]+\/[^/]+)\/contents\/VAULT_RULES\.md$/.exec(url)?.[1]
      if (marked && req.method === 'GET' && signedIn) {
        return vaults.includes(marked) ? send(200, { name: 'VAULT_RULES.md' }) : send(404, {})
      }
      if (url === '/user/repository_invitations' && req.method === 'GET' && signedIn) {
        return send(
          200,
          invitations.map((invite) => ({
            id: invite.id,
            repository: { full_name: invite.repo, clone_url: cloneOf(invite.repo) },
            inviter: { login: invite.inviter }
          }))
        )
      }
      const accept = /^\/user\/repository_invitations\/(\d+)$/.exec(url)?.[1]
      if (accept && req.method === 'PATCH' && signedIn) {
        const index = invitations.findIndex((invite) => invite.id === Number(accept))
        if (index < 0) return send(404, { message: 'Not Found' })
        const [invite] = invitations.splice(index, 1)
        vaults.push(invite!.repo)
        accepted.push(invite!.id)
        res.writeHead(204)
        return res.end()
      }
      const user = /^\/users\/([^/]+)$/.exec(url)?.[1]
      if (user && req.method === 'GET') {
        return ['alice', 'bob'].includes(user)
          ? send(200, { login: user })
          : send(404, { message: 'Not Found' })
      }
      // 구성원 — alice 의 저장소는 alice 혼자다(초대는 수락 전이라 구성원이 아니다)
      const members = /^\/repos\/alice\/[^/]+\/collaborators\?per_page=2$/.test(url)
      if (members && req.method === 'GET' && signedIn) return send(200, [{ login: 'alice' }])
      const collaborator = /^\/repos\/([^/]+\/[^/]+)\/collaborators\/([^/]+)$/.exec(url)
      if (collaborator && req.method === 'PUT' && signedIn) {
        const [, repo, who] = collaborator as unknown as [string, string, string]
        if (invited.some((one) => one.repo === repo && one.user === who)) {
          res.writeHead(204)
          return res.end()
        }
        invited.push({ repo, user: who })
        return send(201, { id: invited.length })
      }
      if (url === '/repos/acme/team' && req.method === 'GET') return send(404, {})
      if (url === '/repos/acme/team/pulls' && req.method === 'POST') {
        const input = JSON.parse(text) as Omit<Pull, 'auth'>
        pulls.push({ ...input, auth: String(req.headers.authorization) })
        const number = pulls.length
        return send(201, { number, html_url: `https://github.com/acme/team/pull/${number}` })
      }
      const one = /^\/repos\/acme\/team\/pulls\/(\d+)$/.exec(url)
      if (one && req.method === 'GET') {
        return send(Number(one[1]) <= pulls.length ? 200 : 404, { state: 'open' })
      }
      return send(404, { message: 'Not Found' })
    })
  })
  base = `http://127.0.0.1:${port}`
  return {
    url: base,
    env: { SECOND_BRAIN_GITHUB_API: base, SECOND_BRAIN_GITHUB_WEB: base },
    pulls,
    created,
    invited,
    accepted
  }
}

/** 숨겨 둔 화면도 마운트돼 있다 — 같은 칸이 설정과 시작하기에 둘 있으면 지금 보이는 쪽을 누른다 */
const shown = (page: Page, id: string): Locator => page.getByTestId(id).filter({ visible: true })

/**
 * 시작하기의 팀 저장소 칸을 보이게 한다 — 원격이 없으면 "GitHub에 올리기" 걸음에 펼쳐져 있고,
 * 올린 뒤에는 접힌 팀 저장소 칸(#64)이다. 칸이 이미 보이면 손대지 않는다. 보관함이 있어야 칸이 있다
 */
export const openStartTeam = async (page: Page): Promise<void> => {
  if ((await shown(page, 'team-repo').count()) === 0) {
    await page.getByTestId('start-team-toggle').click()
  }
}

/** 지금 보이는 GitHub 로그인 버튼으로 가짜 GitHub 에 `alice` 로 로그인한다 — 브라우저는 띄우지 않는다 */
export const signIn = async (page: Page, app: ElectronApplication): Promise<void> => {
  // 브라우저를 띄우지 않고 무엇을 열려 했는지만 남긴다
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { opened?: string[] }).opened = opened
    shell.openExternal = (target: string) => {
      opened.push(target)
      return Promise.resolve()
    }
  })
  await shown(page, 'github-login-start').click()
  await expect(shown(page, 'github-login-state')).toContainText('로그인돼 있어요 (alice)', {
    timeout: 30_000
  })
}

/**
 * 버튼으로 로그인하고 팀 저장소에 연결해 올린다. 팀 저장소 주소는 진짜 github.com 이고,
 * 보관함 git 설정 `url.<bare>.insteadOf` 가 그 주소를 로컬 bare 저장소로 돌린다.
 */
export const loginAndConnect = async (
  page: Page,
  app: ElectronApplication,
  vaultDir: string,
  bare: string,
  repoUrl = TEAM_URL
): Promise<void> => {
  execFileSync('git', ['config', `url.${bare}.insteadOf`, repoUrl], { cwd: vaultDir })
  await goTo(page, 'settings')
  await page.getByTestId('reopen-start').click()
  await openStartTeam(page)
  await signIn(page, app)
  await shown(page, 'github-paste-open').click()
  await shown(page, 'github-url').fill(repoUrl)
  await shown(page, 'github-connect').click()
  await expect(shown(page, 'github-push-result')).toContainText('올렸어요', { timeout: 60_000 })
}

/** 앱이 열려고 한 바깥 주소들 — `signIn` 뒤에만 쌓인다 */
export const openedUrls = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? [])
