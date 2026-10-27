import { describe, expect, it } from 'vitest'
import type { GitFailure } from '../git'
import { fetchFailed } from './sync-failure'

const failure = (failure: GitFailure['failure'], stderr = ''): GitFailure => ({
  ok: false,
  code: null,
  stderr,
  failure
})

describe('fetchFailed', () => {
  it('asks to retry on timeout', () => {
    expect(fetchFailed(failure('timeout'))).toEqual({
      ok: false,
      reason: '팀 저장소에 연결하지 못했어요. 잠시 뒤 다시 받아 주세요'
    })
  })

  it('shows stderr on spawn failure', () => {
    const outcome = fetchFailed(failure('spawn', 'boom'))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toContain('boom')
  })

  it('delegates other failures to the login-aware message', () => {
    const outcome = fetchFailed(failure('login'))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toContain('GitHub 로그인')
  })

  it('covers every failure kind with its action sentence', () => {
    const reasonOf = (f: GitFailure['failure'], stderr = ''): string => {
      const outcome = fetchFailed(failure(f, stderr))
      expect(outcome.ok).toBe(false)
      if (outcome.ok) throw new Error('unreachable')
      return outcome.reason
    }
    expect(reasonOf('exit', 'fatal: Authentication failed')).toContain('로그아웃한 뒤 다시 로그인')
    expect(reasonOf('exit', 'fatal: Could not resolve host x')).toContain('인터넷 연결을 확인')
    expect(reasonOf('exit', 'ERROR: Repository not found.')).toContain('주소를 확인')
    // rejected는 dedicated 문구가 없어 원문 꼬리를 덧붙인다
    expect(reasonOf('exit', 'Updates were rejected because the remote has work')).toContain(
      'Updates were rejected'
    )
    // 모르는 실패 + 빈 stderr는 꼬리 없이 끝난다
    expect(reasonOf('exit', 'zzz')).toBe('팀 변경을 받지 못했어요 — zzz')
    expect(reasonOf('exit', '')).toBe('팀 변경을 받지 못했어요')
  })
})
