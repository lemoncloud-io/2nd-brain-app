// @vitest-environment jsdom
// 고르기 — 팀/내 것 두 단추의 접근성 이름이 달라야 한다(이름 중복 회귀).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SetupContext } from '../hooks/use-setup'
import type { SetupState } from '../hooks/use-setup-state'
import type { ConflictSides } from '../../../shared/ipc-contract'
import { ConflictPicker } from './conflict-picker'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const sides: ConflictSides = { path: 'wiki/a.md', team: '팀이 고친 글', mine: '내가 고친 글' }

const api = {
  readConflict: vi.fn<(path: string) => Promise<ConflictSides | { error: string }>>(),
  resolveConflict:
    vi.fn<
      (
        path: string,
        pick: 'team' | 'mine'
      ) => Promise<{ ok: true; remaining: string[] } | { ok: false; reason: string }>
    >()
}
;(window as unknown as { api: typeof api }).api = api

const syncBase = {
  ahead: 0,
  aheadFiles: [],
  newDocs: [],
  held: null,
  skipped: null,
  shared: null,
  running: false,
  conflicts: ['wiki/a.md'],
  received: 0,
  behind: 0,
  error: null,
  via: null,
  at: 'abc'
}

const setupWith = (sync: Record<string, unknown>): SetupState =>
  ({
    sync: { ...syncBase, ...sync },
    receiveTeamChanges: vi.fn(),
    refresh: vi.fn()
  }) as unknown as SetupState

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.readConflict.mockResolvedValue(sides)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const byTestId = (id: string): HTMLElement | null => document.querySelector(`[data-testid="${id}"]`)

/** aria-label → aria-labelledby 해소 → 텍스트 순으로 접근성 이름을 구한다 */
const accName = (el: Element): string => {
  const labelledby = el.getAttribute('aria-labelledby')
  if (labelledby !== null) {
    return labelledby
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
  }
  return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''
}

const open = async (): Promise<void> => {
  await act(async () => {
    root.render(
      <SetupContext.Provider value={setupWith({})}>
        <ConflictPicker />
      </SetupContext.Provider>
    )
  })
}

describe('ConflictPicker', () => {
  it('원문 pre는 키보드로 스크롤할 수 있다 — 긴 본문을 검토자가 읽는다', async () => {
    await open()
    expect(byTestId('conflict-pick-team-text')?.getAttribute('tabindex')).toBe('0')
    expect(byTestId('conflict-pick-mine-text')?.getAttribute('tabindex')).toBe('0')
  })

  it('팀/내 것 고르기 단추의 접근성 이름이 다르다', async () => {
    await open()
    const team = byTestId('conflict-pick-team')
    const mine = byTestId('conflict-pick-mine')
    expect(team).not.toBeNull()
    expect(mine).not.toBeNull()
    // 보이는 글("이 내용 남기기")을 품은 정확한 이름 — 음성 제어도 같은 말로 닿는다
    expect(accName(team as HTMLElement)).toBe('팀이 고친 내용 이 내용 남기기')
    expect(accName(mine as HTMLElement)).toBe('내가 고친 내용 이 내용 남기기')
  })

  it('고른 쪽을 저장하고, 실패하면 이유를 말한다', async () => {
    api.resolveConflict.mockResolvedValue({ ok: true, remaining: [] })
    await open()
    await act(async () => byTestId('conflict-pick-team')?.click())
    expect(api.resolveConflict).toHaveBeenCalledWith('wiki/a.md', 'team')
  })

  it('저장이 거절되면 이유를 말한다', async () => {
    api.resolveConflict.mockResolvedValue({ ok: false, reason: '팀 최신을 받지 못했어요' })
    await open()
    await act(async () => byTestId('conflict-pick-mine')?.click())
    expect(byTestId('conflict-error')?.textContent).toContain('팀 최신을 받지 못했어요')
  })

  it('다음 문서로 넘어가면 이전 오류는 붙지 않는다', async () => {
    const sidesB = { path: 'wiki/b.md', team: 'B팀 글', mine: 'B내 글' }
    let resolveB!: (value: ConflictSides | { error: string }) => void
    api.readConflict.mockImplementation((path: string) =>
      path === 'wiki/b.md'
        ? new Promise<ConflictSides | { error: string }>((resolve) => {
            resolveB = resolve
          })
        : Promise.reject(new Error('끊겼어요'))
    )
    await act(async () => {
      root.render(
        <SetupContext.Provider value={setupWith({ conflicts: ['wiki/a.md'] })}>
          <ConflictPicker />
        </SetupContext.Provider>
      )
    })
    expect(byTestId('conflict-error')).not.toBeNull()
    await act(async () => {
      root.render(
        <SetupContext.Provider value={setupWith({ conflicts: ['wiki/b.md'] })}>
          <ConflictPicker />
        </SetupContext.Provider>
      )
    })
    // b 읽기 전에는 이전 오류도 이전 내용도 보이지 않는다
    expect(byTestId('conflict-error')).toBeNull()
    expect(byTestId('conflict-path')?.textContent).toBe('wiki/b.md')
    await act(async () => {
      resolveB(sidesB)
    })
    expect(byTestId('conflict-error')).toBeNull()
  })

  it('다음 문서 읽기도 실패하면 다음 오류만 말한다 — 늦은 이전 답도 못 지운다', async () => {
    let resolveA!: (value: ConflictSides | { error: string }) => void
    api.readConflict.mockImplementation((path: string) =>
      path === 'wiki/a.md'
        ? new Promise<ConflictSides | { error: string }>((resolve) => {
            resolveA = resolve
          })
        : Promise.resolve({ error: 'b 읽기 실패' })
    )
    await act(async () => {
      root.render(
        <SetupContext.Provider value={setupWith({ conflicts: ['wiki/a.md'] })}>
          <ConflictPicker />
        </SetupContext.Provider>
      )
    })
    await act(async () => {
      root.render(
        <SetupContext.Provider value={setupWith({ conflicts: ['wiki/b.md'] })}>
          <ConflictPicker />
        </SetupContext.Provider>
      )
    })
    expect(byTestId('conflict-error')?.textContent).toContain('b 읽기 실패')
    await act(async () => {
      resolveA({ error: 'a 읽기 실패' })
    })
    expect(byTestId('conflict-error')?.textContent).toContain('b 읽기 실패')
    expect(byTestId('conflict-error')?.textContent).not.toContain('a 읽기 실패')
  })

  it('연타해도 저장은 한 번만 날아간다', async () => {
    let release!: (value: { ok: true; remaining: string[] }) => void
    api.resolveConflict.mockImplementation(
      () =>
        new Promise<{ ok: true; remaining: string[] }>((resolve) => {
          release = resolve
        })
    )
    await open()
    // 한 프레임에 두 번 눌림 — 다시 그리기 전이라 disabled 가 늦는다
    act(() => {
      byTestId('conflict-pick-team')?.click()
      byTestId('conflict-pick-team')?.click()
    })
    await act(async () => {
      release({ ok: true, remaining: [] })
    })
    expect(api.resolveConflict).toHaveBeenCalledTimes(1)
  })
})
