import { describe, expect, it } from 'vitest'
import { FIRST_STEPS, firstRunProgress } from './first-run'

describe('firstRunProgress', () => {
  it('세 걸음 순서가 오늘 노트·자료 위키화·승인이다', () => {
    expect([...FIRST_STEPS]).toEqual(['today', 'clip', 'approve'])
  })

  it('아직 모르면 확인 중이고 지금 단계를 정하지 않는다', () => {
    expect(firstRunProgress({ today: null, ingested: null, merged: null })).toMatchObject({
      checking: true,
      current: null,
      complete: false
    })
  })

  it('처음에는 오늘 노트가 지금 단계다', () => {
    expect(firstRunProgress({ today: false, ingested: false, merged: false }).current).toBe('today')
  })

  it('오늘 노트가 있으면 자료가 지금 단계다', () => {
    const progress = firstRunProgress({ today: true, ingested: false, merged: false })
    expect(progress.done).toMatchObject({ today: true, clip: false, approve: false })
    expect(progress.current).toBe('clip')
  })

  it('위키화를 마치면 승인이 지금 단계다', () => {
    const progress = firstRunProgress({ today: true, ingested: true, merged: false })
    expect(progress.done.clip).toBe(true)
    expect(progress.current).toBe('approve')
  })

  it('승인까지 마치면 끝났다', () => {
    const progress = firstRunProgress({ today: true, ingested: true, merged: true })
    expect(progress.complete).toBe(true)
    expect(progress.current).toBeNull()
  })

  it('되돌리면 승인이 다시 열린다', () => {
    const progress = firstRunProgress({ today: true, ingested: true, merged: false })
    expect(progress.complete).toBe(false)
    expect(progress.current).toBe('approve')
  })
})
