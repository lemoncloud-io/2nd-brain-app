import { describe, expect, it, vi } from 'vitest'
import { fetchGithubUser, parseGithubUser } from './user'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('parseGithubUser', () => {
  it.each([
    [
      { login: 'alice', id: 7 },
      { login: 'alice', id: 7 }
    ],
    [
      { login: 'a-b-1', id: 123, name: 'Alice' },
      { login: 'a-b-1', id: 123 }
    ],
    // 커밋 작성자로 git 인자에 들어간다 — 아이디 모양이 아니면 버린다
    [{ login: '-c', id: 7 }, null],
    [{ login: 'a\nb', id: 7 }, null],
    [{ login: 'alice', id: '7' }, null],
    [{ login: 'alice', id: 1.5 }, null],
    [null, null]
  ])('%j', (input, expected) => {
    expect(parseGithubUser(input)).toEqual(expected)
  })
})

describe('fetchGithubUser', () => {
  it('로그인 토큰으로 내 GitHub 아이디를 읽는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ login: 'alice', id: 7 }))
    expect(await fetchGithubUser({ token: 'gho_x', fetch: fetchMock })).toEqual({
      login: 'alice',
      id: 7
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/user')
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer gho_x' })
  })

  it('토큰이 없거나 읽지 못하면 null — 커밋은 앱 이름으로 남는다', async () => {
    expect(await fetchGithubUser({ token: null, fetch: vi.fn() })).toBeNull()
    expect(
      await fetchGithubUser({ token: 'gho_x', fetch: vi.fn().mockResolvedValue(json({}, 401)) })
    ).toBeNull()
    expect(
      await fetchGithubUser({ token: 'gho_x', fetch: vi.fn().mockRejectedValue(new Error('x')) })
    ).toBeNull()
  })
})
