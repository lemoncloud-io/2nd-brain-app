import { describe, expect, it, vi } from 'vitest'
import { createDeviceAuth, type TokenStore } from './device-auth'

const store = (): TokenStore & { value: string | null } => ({
  value: null,
  read(): string | null {
    return this.value
  },
  write(token: string | null): void {
    this.value = token
  }
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('device flow 로그인', () => {
  it('코드를 받아 사람이 읽을 수 있게 돌려준다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        device_code: 'dev-1',
        user_code: '8915-14A6',
        verification_uri: 'https://github.com/login/device',
        expires_in: 899,
        interval: 5
      })
    )
    const auth = createDeviceAuth({ clientId: 'cid', fetch: fetchMock, store: store() })
    const started = await auth.start()
    expect(started).toEqual({
      ok: true,
      userCode: '8915-14A6',
      verificationUri: 'https://github.com/login/device'
    })
  })

  // 팀 저장소를 조직 아래에 만들려면 조직 목록을 읽어야 한다 — 저장소 범위만으로는 조직이 안 보인다
  it('저장소와 조직 읽기 범위를 함께 청한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: 'slow_down' }))
    await createDeviceAuth({ clientId: 'cid', fetch: fetchMock, store: store() }).start()
    const body = new URLSearchParams((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.get('scope')).toBe('repo read:org')
  })

  it('사람이 승인할 때까지 기다렸다가 토큰을 보관한다', async () => {
    const saved = store()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          device_code: 'dev-1',
          user_code: 'AAAA-BBBB',
          verification_uri: 'https://github.com/login/device',
          expires_in: 899,
          interval: 0
        })
      )
      .mockResolvedValueOnce(json({ error: 'authorization_pending' }))
      .mockResolvedValueOnce(json({ access_token: 'gho_secret', token_type: 'bearer' }))
    const auth = createDeviceAuth({ clientId: 'cid', fetch: fetchMock, store: saved })
    expect((await auth.start()).ok).toBe(true)

    expect(await auth.finish()).toEqual({ ok: true })
    expect(saved.value).toBe('gho_secret')
    expect(auth.token()).toBe('gho_secret')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('거절하면 사유를 사람 말로 돌려주고 토큰을 남기지 않는다', async () => {
    const saved = store()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          device_code: 'dev-1',
          user_code: 'AAAA-BBBB',
          verification_uri: 'https://github.com/login/device',
          expires_in: 899,
          interval: 0
        })
      )
      .mockResolvedValueOnce(json({ error: 'access_denied' }))
    const auth = createDeviceAuth({ clientId: 'cid', fetch: fetchMock, store: saved })
    await auth.start()
    const result = await auth.finish()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('승인')
    expect(saved.value).toBeNull()
  })

  it('조직이 막아 둔 경우는 일반 로그인 실패와 다르게 말한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          device_code: 'dev-1',
          user_code: 'AAAA-BBBB',
          verification_uri: 'https://github.com/login/device',
          expires_in: 899,
          interval: 0
        })
      )
      .mockResolvedValueOnce(json({ error: 'device_flow_disabled' }))
    const auth = createDeviceAuth({ clientId: 'cid', fetch: fetchMock, store: store() })
    await auth.start()
    const result = await auth.finish()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('관리자')
  })

  it('로그아웃하면 보관한 토큰을 지운다', async () => {
    const saved = store()
    saved.value = 'gho_old'
    const auth = createDeviceAuth({ clientId: 'cid', fetch: vi.fn(), store: saved })
    expect(auth.token()).toBe('gho_old')
    auth.signOut()
    expect(saved.value).toBeNull()
    expect(auth.token()).toBeNull()
  })
})
