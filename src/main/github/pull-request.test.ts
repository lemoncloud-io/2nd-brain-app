import { describe, expect, it, vi } from 'vitest'
import { createPullRequest, closePullRequest, pullRequestOpen, repoFromUrl } from './pull-request'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('repoFromUrl', () => {
  it.each([
    ['https://github.com/team/vault.git', { owner: 'team', repo: 'vault' }],
    ['https://github.com/team/vault', { owner: 'team', repo: 'vault' }],
    ['git@github.com:team/vault.git', { owner: 'team', repo: 'vault' }],
    ['https://gitlab.com/team/vault.git', null]
  ])('%s', (url, expected) => {
    expect(repoFromUrl(url)).toEqual(expected)
  })
})

describe('createPullRequest', () => {
  it('팀 저장소에 PR 을 열고 사람이 열어 볼 주소를 돌려준다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ number: 12, html_url: 'https://github.com/team/vault/pull/12' }, 201)
      )
    const result = await createPullRequest(
      { token: 'gho_x', fetch: fetchMock },
      {
        url: 'https://github.com/team/vault.git',
        branch: 'app/ingest-2026-09-16',
        base: 'main',
        title: '위키 페이지 3개'
      }
    )
    expect(result).toEqual({
      ok: true,
      number: 12,
      url: 'https://github.com/team/vault/pull/12'
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/team/vault/pulls')
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      head: 'app/ingest-2026-09-16',
      base: 'main',
      title: '위키 페이지 3개'
    })
  })

  it('조직이 막아 두면 관리자 승인이 필요하다고 말한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ message: 'Resource protected by organization SAML enforcement' }, 403)
      )
    const result = await createPullRequest(
      { token: 'gho_x', fetch: fetchMock },
      { url: 'https://github.com/team/vault.git', branch: 'b', base: 'main', title: 't' }
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('관리자')
  })

  it('로그인이 없으면 먼저 로그인하라고 말한다', async () => {
    const result = await createPullRequest(
      { token: null, fetch: vi.fn() },
      { url: 'https://github.com/team/vault.git', branch: 'b', base: 'main', title: 't' }
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('로그인')
  })

  it('이미 열린 PR 이 있으면 그 사실을 말한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(
        {
          message: 'Validation Failed',
          errors: [{ message: 'A pull request already exists for team:b.' }]
        },
        422
      )
    )
    const result = await createPullRequest(
      { token: 'gho_x', fetch: fetchMock },
      { url: 'https://github.com/team/vault.git', branch: 'b', base: 'main', title: 't' }
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('이미')
  })
})

describe('closePullRequest', () => {
  it('열어 둔 PR 을 닫는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ state: 'closed' }))
    const result = await closePullRequest(
      { token: 'gho_x', fetch: fetchMock },
      { url: 'https://github.com/team/vault.git', number: 12 }
    )
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/team/vault/pulls/12')
    expect((init as RequestInit).method).toBe('PATCH')
  })

  it('이미 머지됐으면 닫지 못한다고 말한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ message: 'Not Found' }, 404))
    const result = await closePullRequest(
      { token: 'gho_x', fetch: fetchMock },
      { url: 'https://github.com/team/vault.git', number: 12 }
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('찾지 못했어요')
  })
})

describe('pullRequestOpen', () => {
  it('열림·닫힘을 읽고, 묻지 못하면 null 이다', async () => {
    const target = { url: 'https://github.com/team/vault.git', number: 3 }
    const open = vi.fn().mockResolvedValue(json({ state: 'open' }))
    expect(await pullRequestOpen({ token: 'gho_x', fetch: open }, target)).toBe(true)
    expect(open.mock.calls[0]![0]).toBe('https://api.github.com/repos/team/vault/pulls/3')
    const closed = vi.fn().mockResolvedValue(json({ state: 'closed', merged: true }))
    expect(await pullRequestOpen({ token: 'gho_x', fetch: closed }, target)).toBe(false)
    const denied = vi.fn().mockResolvedValue(json({ message: 'Not Found' }, 404))
    expect(await pullRequestOpen({ token: 'gho_x', fetch: denied }, target)).toBeNull()
    expect(await pullRequestOpen({ token: null, fetch: open }, target)).toBeNull()
  })
})
