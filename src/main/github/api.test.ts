import { describe, expect, it, vi } from 'vitest'
import { githubRequest } from './api'

const call = (
  fetch: ReturnType<typeof vi.fn>
): { token: string; fetch: typeof globalThis.fetch } => ({
  token: 'gho_x',
  fetch: fetch as unknown as typeof globalThis.fetch
})

describe('githubRequest', () => {
  it('순환 참조 본문은 offline으로 위장하지 않고 throw한다', async () => {
    const fetch = vi.fn()
    const body: Record<string, unknown> = {}
    body.self = body
    await expect(githubRequest(call(fetch), '/p', { method: 'POST', body })).rejects.toThrow(
      TypeError
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('토큰이 없으면 보내지 않고 login이다', async () => {
    const fetch = vi.fn()
    expect(
      await githubRequest({ token: null, fetch: fetch as unknown as typeof globalThis.fetch }, '/p')
    ).toEqual({ ok: false, unreached: 'login' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('정상 본문은 JSON으로 보내고 ok를 돌려준다', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    const result = await githubRequest(call(fetch), '/p', { method: 'POST', body: { a: 1 } })
    expect(result).toMatchObject({ ok: true, status: 200 })
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      body: JSON.stringify({ a: 1 }),
      headers: expect.objectContaining({ authorization: 'Bearer gho_x' })
    })
  })

  it('204는 본문 없이 ok다', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    expect(await githubRequest(call(fetch), '/p')).toMatchObject({ ok: true, status: 204 })
  })

  it('비-204에서 본문 파싱 실패는 null 본문으로 ok다', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('not json', { status: 200, headers: {} }))
    expect(await githubRequest(call(fetch), '/p')).toMatchObject({ ok: true, body: null })
  })

  it('fetch 실패는 offline이다', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    expect(await githubRequest(call(fetch), '/p')).toEqual({ ok: false, unreached: 'offline' })
  })
})
