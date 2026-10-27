import { describe, expect, it } from 'vitest'
import { setupComplete, startProgress } from './start-steps'

/** 첫 실행 — 아무것도 안 됐다. 테스트마다 바뀐 것만 덮는다 */
const firstRun = {
  purpose: false,
  engine: 'missing',
  github: false,
  vault: 'none',
  remote: false,
  deferredGithub: false,
  startDone: false
} as const

describe('startProgress', () => {
  it('첫 실행은 질문 → AI 연결 → GitHub → 보관함 순서이고 질문부터 한다', () => {
    const progress = startProgress(firstRun)
    expect(progress.steps).toEqual(['purpose', 'engine', 'github', 'vault', 'publish'])
    expect(progress.current).toBe('purpose')
    expect(progress.position).toBe(1)
  })

  it('시작하기를 한 번 끝낸 사람은 질문·GitHub 단계를 보지 않는다', () => {
    const progress = startProgress({ ...firstRun, startDone: true })
    expect(progress.steps).toEqual(['engine', 'vault', 'publish'])
    expect(progress.current).toBe('engine')
  })

  it('질문에 답했으면 다음은 AI 연결이다', () => {
    const progress = startProgress({ ...firstRun, purpose: true })
    expect(progress.current).toBe('engine')
    expect(progress.position).toBe(2)
  })

  it('AI 연결이 끝나면 github 로그인이 지금 단계다', () => {
    const progress = startProgress({ ...firstRun, purpose: true, engine: 'ok' })
    expect(progress.current).toBe('github')
    expect(progress.done.github).toBe(false)
  })

  it('github 로그인을 마치면 보관함이 지금 단계다', () => {
    const progress = startProgress({ ...firstRun, purpose: true, engine: 'ok', github: true })
    expect(progress.done.github).toBe(true)
    expect(progress.current).toBe('vault')
    expect(progress.position).toBe(4)
  })

  it('github 를 나중에 하기로 했으면 로그인 없이 보관함으로 간다', () => {
    const progress = startProgress({
      ...firstRun,
      purpose: true,
      engine: 'ok',
      deferredGithub: true
    })
    expect(progress.done.github).toBe(true)
    expect(progress.current).toBe('vault')
  })

  it('보관함이 이미 있으면 질문·github 단계는 끝난 것으로 본다', () => {
    const progress = startProgress({ ...firstRun, engine: 'ok', vault: 'ok', remote: true })
    expect(progress.done.purpose).toBe(true)
    expect(progress.done.github).toBe(true)
    expect(progress.complete).toBe(true)
    expect(progress.current).toBeNull()
    expect(progress.position).toBeNull()
  })

  it('질문 답을 아직 모르면 지금 단계를 정하지 않고, github 상태는 기다리지 않는다', () => {
    expect(startProgress({ ...firstRun, purpose: null })).toMatchObject({
      checking: true,
      current: null
    })
    // github 상태는 기다리지 않는다 — 로그인 칸이 확인 중·읽기 실패를 스스로 보인다
    expect(startProgress({ ...firstRun, purpose: true, engine: 'ok', github: null })).toMatchObject(
      { checking: false, current: 'github' }
    )
    // 다 끝낸 사람은 질문·github 를 기다리지 않는다
    expect(startProgress({ ...firstRun, purpose: null, startDone: true }).checking).toBe(false)
  })

  it('확인 중에는 지금 단계를 정하지 않는다', () => {
    expect(startProgress({ ...firstRun, startDone: true, engine: 'checking' })).toMatchObject({
      checking: true,
      current: null
    })
    expect(
      startProgress({ ...firstRun, startDone: true, engine: 'ok', vault: 'checking' })
    ).toMatchObject({ checking: true, current: null })
  })

  it('엔진이 안 됐으면 보관함이 있어도 엔진부터', () => {
    expect(startProgress({ ...firstRun, engine: 'missing', vault: 'ok' }).current).toBe('engine')
  })

  it('원격이 없는 준비 완료 보관함은 GitHub에 올리기가 지금 단계다 — 준비는 끝난 채로', () => {
    const progress = startProgress({ ...firstRun, startDone: true, engine: 'ok', vault: 'ok' })
    expect(progress.current).toBe('publish')
    expect(progress.position).toBe(3)
    expect(progress.complete).toBe(true)
  })

  it('원격을 아직 모르거나 읽지 못했으면 GitHub에 올리기를 지금 단계로 내밀지 않는다', () => {
    const progress = startProgress({
      ...firstRun,
      startDone: true,
      engine: 'ok',
      vault: 'ok',
      remote: null
    })
    expect(progress.current).toBeNull()
    expect(progress.done.publish).toBe(false)
  })

  it('보관함이 생기기 전에는 GitHub에 올리기를 하지 않는다', () => {
    const progress = startProgress({ ...firstRun, startDone: true, engine: 'ok', vault: 'none' })
    expect(progress.current).toBe('vault')
    expect(progress.done.publish).toBe(false)
  })

  it('로그아웃되면 다시 안 끝난 상태다', () => {
    expect(startProgress({ ...firstRun, engine: 'logged-out', vault: 'ok' }).complete).toBe(false)
  })
})

describe('setupComplete', () => {
  // 하루 루프만 쓰는 사람은 위키화·승인을 영영 하지 않는다 — 그 둘을 준비 조건으로 두면
  // 앱이 매번 시작하기 화면으로 열린다(2026-09-18 사람 확인). 질문·GitHub 도 준비 조건이 아니다
  it('준비는 연결과 보관함 둘뿐이다', () => {
    expect(setupComplete({ engine: 'ok', vault: 'ok' })).toBe(true)
    expect(setupComplete({ engine: 'ok', vault: 'none' })).toBe(false)
    expect(setupComplete({ engine: 'logged-out', vault: 'ok' })).toBe(false)
  })
})
