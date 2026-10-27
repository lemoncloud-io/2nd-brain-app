// @vitest-environment jsdom
// 빈 화면 다음 행동 3분기 — 미완료→시작하기, 자료 있음→위키초안, 그 밖→자료넣기를 핀한다(회귀).
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { SetupContext } from './use-setup'
import type { SetupState } from './use-setup-state'
import { useNextStep } from './use-next-step'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const setup = (over: Partial<SetupState>): SetupState =>
  ({
    vault: 'ok',
    engine: 'ok',
    engineKind: 'claude',
    engineStatus: null,
    journey: null,
    remote: null,
    github: null,
    sync: null,
    error: null,
    refresh: () => undefined,
    refreshJourney: () => undefined,
    ...over
  }) as SetupState

const labelFor = (value: SetupState): string => {
  let label = ''
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  const Probe = (): null => {
    label = useNextStep().label
    return null
  }
  act(() => {
    root.render(
      <SetupContext.Provider value={value}>
        <Probe />
      </SetupContext.Provider>
    )
  })
  root.unmount()
  el.remove()
  return label
}

describe('useNextStep', () => {
  it('준비가 덜 됐으면 시작하기로', () => {
    expect(labelFor(setup({ engine: 'checking' }))).toBe('시작하기로')
  })

  it('자료가 있으면 위키 초안 만들기', () => {
    expect(labelFor(setup({ journey: { clippings: 2, ingested: false, merged: false } }))).toBe(
      '위키 초안 만들기'
    )
  })

  it('자를 것도 없을 땐 자료 넣기', () => {
    expect(labelFor(setup({ journey: { clippings: 0, ingested: true, merged: true } }))).toBe(
      '자료 넣기'
    )
  })

  it('진행을 모르면 자료 넣기로 (clippings 없음 취급)', () => {
    expect(labelFor(setup({ journey: null }))).toBe('자료 넣기')
  })
})
