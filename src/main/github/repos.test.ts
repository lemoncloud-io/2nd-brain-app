import { describe, expect, it, vi } from 'vitest'
import {
  acceptInvitation,
  createTeamRepo,
  inviteMember,
  isPersonalRepo,
  listOrgs,
  listTeamVaults
} from './repos'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

const call = (
  fetch: ReturnType<typeof vi.fn>
): { token: string; fetch: typeof globalThis.fetch } => ({
  token: 'gho_x',
  fetch: fetch as unknown as typeof globalThis.fetch // 테스트 대역 — 부른 인자만 본다
})

describe('listOrgs', () => {
  it('내가 속한 조직 이름을 돌려준다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json([{ login: 'acme' }, { login: 'lab' }], 200, { 'x-oauth-scopes': 'repo, read:org' })
      )
    expect(await listOrgs(call(fetch))).toEqual({ ok: true, orgs: ['acme', 'lab'] })
    expect(fetch.mock.calls[0]![0]).toBe('https://api.github.com/user/orgs?per_page=100')
  })

  // 이 기능 전 로그인은 조직을 읽을 권한(read:org)이 없다 — 조직은 다시 로그인해야 보이고, 내 계정 만들기는 그대로 된다
  it.each([
    ['403', json({ message: 'Forbidden' }, 403)],
    ['권한 목록에 read:org 없음', json([], 200, { 'x-oauth-scopes': 'repo' })]
  ])('%s — 다시 로그인하라고 한다', async (_, response) => {
    const result = await listOrgs(call(vi.fn().mockResolvedValue(response)))
    expect(result).toMatchObject({ ok: false, relogin: true })
    if (result.ok) return
    expect(result.reason).toContain('다시 로그인')
  })
})

describe('listOrgs — 로그인이 풀림·일시 실패', () => {
  it('401 이면 로그인이 풀렸다고 말하고, 내 계정에는 된다고 하지 않는다', async () => {
    const result = await listOrgs(call(vi.fn().mockResolvedValue(json({}, 401))))
    expect(result).toMatchObject({ ok: false })
    if (result.ok) return
    expect(result.reason).toContain('로그인이 풀렸어요')
    expect(result.reason).not.toContain('내 계정에는')
  })

  it('닿지 못하면 인터넷을 확인하라고 한다', async () => {
    const result = await listOrgs(call(vi.fn().mockRejectedValue(new TypeError('fetch failed'))))
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('인터넷') })
  })
})

describe('createTeamRepo — 그 밖의 실패', () => {
  it.each([
    ['401', { org: null, status: 401, body: {} }, '로그인이 풀렸어요'],
    // OAuth 제한 문구가 없는 조직 403 — 조직 설정 주소가 아니라 권한을 말한다
    ['조직 403', { org: 'acme', status: 403, body: { message: 'Forbidden' } }, '권한이 없어요'],
    ['조직 404', { org: 'acme', status: 404, body: { message: 'Not Found' } }, '권한이 없어요'],
    ['201 인데 주소 없음', { org: null, status: 201, body: {} }, '주소를 받지 못했어요'],
    ['500', { org: null, status: 500, body: {} }, '잠시 뒤 다시']
  ])('%s', async (_, { org, status, body }, phrase) => {
    const result = await createTeamRepo(call(vi.fn().mockResolvedValue(json(body, status))), {
      org,
      name: 'team'
    })
    expect(result).toMatchObject({ ok: false })
    if (result.ok) return
    expect(result.reason).toContain(phrase)
    expect(result.link).toBeUndefined()
  })
})

describe('createTeamRepo', () => {
  it('내 계정에 비공개 저장소를 만들고 받을 주소를 돌려준다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ clone_url: 'https://github.com/alice/2nd-brain.git' }, 201))
    expect(await createTeamRepo(call(fetch), { org: null, name: '2nd-brain' })).toEqual({
      ok: true,
      url: 'https://github.com/alice/2nd-brain.git'
    })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.github.com/user/repos')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      name: '2nd-brain',
      private: true
    })
  })

  it('조직을 고르면 그 조직 아래에 만든다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ clone_url: 'https://github.com/acme/team.git' }, 201))
    await createTeamRepo(call(fetch), { org: 'acme', name: 'team' })
    expect(fetch.mock.calls[0]![0]).toBe('https://api.github.com/orgs/acme/repos')
  })

  // 조직이 OAuth 앱 접근을 막아 두었다 — 일반 실패로 읽히면 대표는 무엇을 해야 하는지 모른다
  it('조직이 앱을 막아 두었으면 조직 관리자가 허용해야 한다고 말하고 그 설정 주소를 준다', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json(
        {
          message:
            'Although you appear to have the correct authorization credentials, the `acme` organization has enabled OAuth App access restrictions'
        },
        403
      )
    )
    const result = await createTeamRepo(call(fetch), { org: 'acme', name: 'team' })
    expect(result).toMatchObject({
      ok: false,
      link: 'https://github.com/organizations/acme/settings/oauth_application_policy'
    })
    if (result.ok) return
    expect(result.reason).toContain('조직 관리자')
    expect(result.detail).toContain('OAuth App access restrictions')
  })

  it('같은 이름이 이미 있으면 다른 이름을 넣으라고 한다', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json(
        {
          message: 'Repository creation failed.',
          errors: [{ message: 'name already exists on this account' }]
        },
        422
      )
    )
    const result = await createTeamRepo(call(fetch), { org: null, name: '2nd-brain' })
    expect(result).toMatchObject({ ok: false })
    if (result.ok) return
    expect(result.reason).toContain('같은 이름')
    expect(result.exists).toBe(true)
  })

  it.each(['', '../x', 'a b', '-'.repeat(101)])('저장소 이름 %j 는 보내지 않는다', async (name) => {
    const fetch = vi.fn()
    expect((await createTeamRepo(call(fetch), { org: null, name })).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('로그인하지 않았으면 보내지 않는다', async () => {
    const fetch = vi.fn()
    const result = await createTeamRepo({ token: null, fetch }, { org: null, name: 'x' })
    expect(result).toMatchObject({ ok: false })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('inviteMember', () => {
  const TEAM = 'https://github.com/acme/team.git'

  it('있는 아이디면 저장소에 쓰기 권한으로 초대한다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ login: 'bob', id: 9 }))
      .mockResolvedValueOnce(json({ id: 1 }, 201))
    expect(await inviteMember(call(fetch), { url: TEAM, username: 'bob' })).toEqual({
      ok: true,
      state: 'invited'
    })
    const [url, init] = fetch.mock.calls[1]!
    expect(url).toBe('https://api.github.com/repos/acme/team/collaborators/bob')
    expect((init as RequestInit).method).toBe('PUT')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ permission: 'push' })
  })

  it('이미 들어와 있으면 그렇게 말한다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ login: 'bob', id: 9 }))
      .mockResolvedValueOnce(json(null, 204))
    expect(await inviteMember(call(fetch), { url: TEAM, username: 'bob' })).toEqual({
      ok: true,
      state: 'already'
    })
  })

  // 오타를 GitHub 에 그대로 보내면 엉뚱한 사람이 초대받을 수 있다 — 먼저 있는 아이디인지 본다
  it('없는 아이디면 초대를 보내지 않고 없다고 말한다', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ message: 'Not Found' }, 404))
    const result = await inviteMember(call(fetch), { url: TEAM, username: 'nobody-here' })
    expect(result).toMatchObject({ ok: false })
    if (result.ok) return
    expect(result.reason).toContain('그런 GitHub 아이디가 없어요')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each(['', '-bob', 'bob/../x', '@bob'])('아이디 %j 는 묻지도 않는다', async (username) => {
    const fetch = vi.fn()
    expect((await inviteMember(call(fetch), { url: TEAM, username })).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('아이디를 확인하지 못하면 초대를 보내지 않고 다시 하라고 한다', async () => {
    const fetch = vi.fn().mockResolvedValue(json({}, 502))
    const result = await inviteMember(call(fetch), { url: TEAM, username: 'bob' })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('잠시 뒤 다시') })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('초대할 권한이 없으면 저장소를 만든 계정을 말한다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ login: 'bob', id: 9 }))
      .mockResolvedValueOnce(json({ message: 'Must have admin rights to Repository.' }, 403))
    const result = await inviteMember(call(fetch), { url: TEAM, username: 'bob' })
    expect(result).toMatchObject({ ok: false, detail: 'Must have admin rights to Repository.' })
    if (result.ok) return
    expect(result.reason).toContain('권한')
  })
})

describe('listTeamVaults', () => {
  /** 경로마다 답을 정해 두는 가짜 GitHub */
  const routes = (table: Record<string, Response | (() => Response)>): ReturnType<typeof vi.fn> =>
    vi.fn((url: string) => {
      const path = url.replace('https://api.github.com', '')
      const hit = table[path]
      if (!hit) return Promise.resolve(json({ message: 'Not Found' }, 404))
      return Promise.resolve(typeof hit === 'function' ? hit() : hit.clone())
    })
  const REPOS =
    '/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100'

  // 보관함인지는 VAULT_RULES.md 로 가른다 — 코드 저장소까지 늘어놓으면 팀원이 고를 수 없다
  it('들어갈 수 있는 저장소 중 보관함만, 받은 초대와 함께 돌려준다', async () => {
    const fetch = routes({
      [REPOS]: json([
        { full_name: 'acme/team', clone_url: 'https://github.com/acme/team.git' },
        { full_name: 'alice/code', clone_url: 'https://github.com/alice/code.git' }
      ]),
      '/repos/acme/team/contents/VAULT_RULES.md': json({ name: 'VAULT_RULES.md' }),
      '/user/repository_invitations': json([
        {
          id: 42,
          repository: { full_name: 'lab/notes', clone_url: 'https://github.com/lab/notes.git' },
          inviter: { login: 'carol' }
        }
      ])
    })
    expect(await listTeamVaults(call(fetch))).toEqual({
      ok: true,
      vaults: [{ fullName: 'acme/team', url: 'https://github.com/acme/team.git' }],
      invitations: [
        { id: 42, fullName: 'lab/notes', url: 'https://github.com/lab/notes.git', inviter: 'carol' }
      ]
    })
  })

  it('저장소는 최근 것 30개까지만 들여다본다', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      full_name: `acme/r${i}`,
      clone_url: `https://github.com/acme/r${i}.git`
    }))
    const fetch = routes({ [REPOS]: json(many), '/user/repository_invitations': json([]) })
    await listTeamVaults(call(fetch))
    const looked = fetch.mock.calls.filter(([url]) => String(url).includes('/contents/'))
    expect(looked).toHaveLength(30)
  })

  it('GitHub 주소가 아닌 받을 주소는 버린다', async () => {
    const fetch = routes({
      [REPOS]: json([{ full_name: 'acme/team', clone_url: 'git@github.com:acme/team.git' }]),
      '/repos/acme/team/contents/VAULT_RULES.md': json({}),
      '/user/repository_invitations': json([])
    })
    expect(await listTeamVaults(call(fetch))).toEqual({ ok: true, vaults: [], invitations: [] })
  })

  it('로그인하지 않았으면 묻지 않는다', async () => {
    const fetch = vi.fn()
    expect((await listTeamVaults({ token: null, fetch })).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('초대를 읽지 못해도 보관함 목록은 보여 준다', async () => {
    const fetch = routes({
      [REPOS]: json([{ full_name: 'acme/team', clone_url: 'https://github.com/acme/team.git' }]),
      '/repos/acme/team/contents/VAULT_RULES.md': json({}),
      '/user/repository_invitations': json({}, 500)
    })
    expect(await listTeamVaults(call(fetch))).toEqual({
      ok: true,
      vaults: [{ fullName: 'acme/team', url: 'https://github.com/acme/team.git' }],
      invitations: []
    })
  })

  // 보관함인지 하나도 확인하지 못했다(한도·네트워크) — "들어갈 수 있는 보관함이 없어요" 로 읽히면 엉뚱한 사람을 찾게 된다
  it('보관함인지 하나도 확인하지 못하면 다시 읽으라고 한다', async () => {
    const fetch = routes({
      [REPOS]: json([{ full_name: 'acme/team', clone_url: 'https://github.com/acme/team.git' }]),
      '/repos/acme/team/contents/VAULT_RULES.md': json({ message: 'rate limit' }, 403),
      '/user/repository_invitations': json([])
    })
    const result = await listTeamVaults(call(fetch))
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('다시 읽어') })
  })

  it('이름은 받을 주소에서 읽는다 — API 가 준 이름을 그대로 경로에 넣지 않는다', async () => {
    const fetch = routes({
      [REPOS]: json([{ full_name: '../x', clone_url: 'https://github.com/acme/team.git' }]),
      '/repos/acme/team/contents/VAULT_RULES.md': json({}),
      '/user/repository_invitations': json([])
    })
    expect(await listTeamVaults(call(fetch))).toMatchObject({
      ok: true,
      vaults: [{ fullName: 'acme/team', url: 'https://github.com/acme/team.git' }]
    })
  })

  it('저장소 목록을 읽지 못하면 다시 하라고 한다', async () => {
    const fetch = routes({ [REPOS]: json({}, 500), '/user/repository_invitations': json([]) })
    const result = await listTeamVaults(call(fetch))
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('다시') })
  })
})

describe('acceptInvitation', () => {
  it('받은 초대를 수락한다', async () => {
    const fetch = vi.fn().mockResolvedValue(json(null, 204))
    expect(await acceptInvitation(call(fetch), 42)).toEqual({ ok: true })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.github.com/user/repository_invitations/42')
    expect((init as RequestInit).method).toBe('PATCH')
  })

  // 수락했는데 받기가 실패해 다시 누른 경우 — 초대는 이미 없다. 받기로 넘어가고, 정말 취소된 초대면 받기가 찾지 못했다고 말한다
  it('초대가 이미 없으면 수락된 것으로 보고 넘어간다', async () => {
    expect(await acceptInvitation(call(vi.fn().mockResolvedValue(json({}, 404))), 42)).toEqual({
      ok: true
    })
  })

  it('로그인이 풀렸으면 다시 로그인하라고 한다', async () => {
    const result = await acceptInvitation(call(vi.fn().mockResolvedValue(json({}, 401))), 42)
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining('로그인이 풀렸어요')
    })
  })

  it.each([0, -1, 1.5, Number.NaN])('초대 번호 %s 는 보내지 않는다', async (id) => {
    const fetch = vi.fn()
    expect((await acceptInvitation(call(fetch), id)).ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('isPersonalRepo', () => {
  const url = 'https://github.com/alice/2nd-brain.git'

  it('내 계정 저장소이고 구성원이 나뿐이면 참이다', async () => {
    const fetch = vi.fn().mockResolvedValue(json([{ login: 'Alice' }]))
    expect(await isPersonalRepo(call(fetch), { url, login: 'alice' })).toBe(true)
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://api.github.com/repos/alice/2nd-brain/collaborators?per_page=2'
    )
  })

  it('다른 구성원이 있으면 거짓이다', async () => {
    const fetch = vi.fn().mockResolvedValue(json([{ login: 'alice' }, { login: 'bob' }]))
    expect(await isPersonalRepo(call(fetch), { url, login: 'alice' })).toBe(false)
  })

  it('주인이 로그인 아이디가 아니면(조직 저장소) 묻지도 않고 거짓이다', async () => {
    const fetch = vi.fn()
    expect(
      await isPersonalRepo(call(fetch), { url: 'https://github.com/acme/team.git', login: 'alice' })
    ).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  // 이 판정이 기본 줄기에 바로 올릴지를 가른다 — 경로에 github.com 이 든 다른 서버 주소를 GitHub 으로 보지 않는다
  it('github.com 이 아닌 서버 주소면 묻지도 않고 거짓이다', async () => {
    const fetch = vi.fn()
    expect(
      await isPersonalRepo(call(fetch), {
        url: 'https://git.example.com/github.com/alice/2nd-brain.git',
        login: 'alice'
      })
    ).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  // 확인하지 못하면 안전한 쪽(확인 요청)으로 — 남과 쓰는 저장소의 기본 줄기에 바로 올리지 않는다
  it.each([
    ['403', (): Promise<Response> => Promise.resolve(json({ message: 'Forbidden' }, 403))],
    ['오프라인', (): Promise<Response> => Promise.reject(new TypeError('fetch failed'))],
    ['모양이 다름', (): Promise<Response> => Promise.resolve(json({ message: 'x' }))]
  ])('%s 면 거짓이다', async (_, reply) => {
    const fetch = vi.fn().mockImplementation(reply)
    expect(await isPersonalRepo(call(fetch), { url, login: 'alice' })).toBe(false)
  })
})
