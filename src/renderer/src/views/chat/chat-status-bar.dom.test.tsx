// @vitest-environment jsdom
// 지표 줄 — 켠 사람에게만, 그리고 보일 값이 있을 때만 그린다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EngineUsage } from '../../../../shared/ipc-contract'
import { EMPTY_ACCOUNT_USAGE } from '../../../../shared/account-usage'
import { ChatStatusBar } from './chat-status-bar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

const noAccount = (): void => {
  window.api = {
    getAccountUsage: () => Promise.resolve(EMPTY_ACCOUNT_USAGE)
  } as unknown as typeof window.api
}

beforeEach(() => {
  noAccount()
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

const render = (usage: EngineUsage | null, show = true): HTMLElement => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<ChatStatusBar usage={usage} show={show} />))
  return container
}

const bar = (c: HTMLElement): HTMLElement | null =>
  c.querySelector('[data-testid="chat-status-bar"]')

describe('ChatStatusBar', () => {
  it('모델과 찬 정도를 한 줄로 — 모델 원문은 title 에 남는다', () => {
    const container = render({ model: 'claude-opus-5[1m]', contextPercent: 31 })
    expect(bar(container)?.textContent).toContain('opus-5')
    expect(bar(container)?.textContent).toContain('기억 31%')
    // 원문은 모델 칸에 붙는다 — 줄 전체에 붙이면 여유 칸을 가리켜도 모델 이름이 뜬다
    expect(bar(container)?.querySelector('[title]')?.getAttribute('title')).toBe(
      'claude-opus-5[1m]'
    )
  })

  // 채팅 칸은 320px 까지 좁아진다 — 줄을 넓히면 가로 스크롤이 생긴다
  it('좁으면 꼬리를 자른다 — 줄을 넓히지 않는다', () => {
    const container = render({ model: 'claude-opus-5[1m]', contextPercent: 31 })
    expect(bar(container)!.querySelector('.truncate')).not.toBeNull()
    expect(bar(container)?.className).toContain('flex-wrap')
  })

  it('고급 표시를 끈 사람에게는 줄이 없다', () => {
    expect(bar(render({ model: 'claude-opus-5', contextPercent: 31 }, false))).toBeNull()
  })

  it('계정 사용량은 쓴 비율과 다시 채워지기까지 남은 시간으로 같은 줄에 붙는다', async () => {
    window.api = {
      getAccountUsage: () =>
        Promise.resolve({
          fiveHour: null,
          sevenDay: 69,
          fiveHourResetsAt: null,
          sevenDayResetsAt: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
          scoped: []
        })
    } as unknown as typeof window.api
    const container = render({ model: 'claude-opus-5', contextPercent: 31 })
    await act(async () => {
      await Promise.resolve()
    })

    expect(bar(container)?.textContent).toContain('7d 69%')
    expect(bar(container)?.textContent).toContain('(3d)')
    expect(bar(container)?.textContent).not.toContain('31%)')
    // 줄 전체가 이미 흐린 글자다 — 그 안에서 한 번 더 흐리게 하지 않는다(작은 글자가 안 읽힌다)
    const dimmedTwice = [...(bar(container)?.querySelectorAll('*') ?? [])].filter(
      (node) =>
        node.getAttribute('aria-hidden') === null &&
        /text-muted-foreground\/\d+/.test(node.className)
    )
    expect(dimmedTwice).toHaveLength(0)
  })

  // codex 대화에 claude 계정의 한도를 그리면 남의 숫자를 자기 것으로 읽는다
  it('모델을 안 알려 온 엔진(codex)에는 계정 여유도 묻지 않는다', async () => {
    const asked: true[] = []
    window.api = {
      getAccountUsage: () => {
        asked.push(true)
        return Promise.resolve({
          fiveHour: 10,
          sevenDay: 20,
          fiveHourResetsAt: null,
          sevenDayResetsAt: null,
          scoped: []
        })
      }
    } as unknown as typeof window.api
    const container = render({ model: null, contextPercent: null })
    await act(async () => {
      await Promise.resolve()
    })

    expect(asked).toEqual([])
    expect(bar(container)).toBeNull()
  })

  // 채팅 칸은 마운트를 유지한다 — 안 비우면 앞 대화에서 받은 남의 한도가 그대로 남는다
  it('claude 대화에서 받은 여유는 codex 대화로 넘어가면 사라진다', async () => {
    window.api = {
      getAccountUsage: () =>
        Promise.resolve({
          fiveHour: null,
          sevenDay: 69,
          fiveHourResetsAt: null,
          sevenDayResetsAt: null,
          scoped: []
        })
    } as unknown as typeof window.api
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() =>
      root.render(
        <ChatStatusBar usage={{ model: 'claude-opus-5', contextPercent: 31 }} show={true} />
      )
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(bar(container)?.textContent).toContain('7d 69%')

    act(() =>
      root.render(<ChatStatusBar usage={{ model: null, contextPercent: null }} show={true} />)
    )

    expect(bar(container)).toBeNull()
  })

  // 5시간 한도는 대화와 무관하게 흐른다 — 턴이 끝나기를 기다리게 두지 않는다
  it('다시 보기를 누르면 main 의 기억을 건너뛰고 새로 묻는다', async () => {
    const asked: boolean[] = []
    window.api = {
      getAccountUsage: (fresh?: boolean) => {
        asked.push(fresh === true)
        return Promise.resolve({
          fiveHour: 45,
          sevenDay: null,
          fiveHourResetsAt: null,
          sevenDayResetsAt: null,
          scoped: []
        })
      }
    } as unknown as typeof window.api
    const container = render({ model: 'claude-opus-5', contextPercent: 31 })
    await act(async () => {
      await Promise.resolve()
    })
    expect(asked).toEqual([false])

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="account-usage-reread"]'
    )
    await act(async () => {
      button?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(asked).toEqual([false, true])
    expect(bar(container)?.textContent).toContain('5h 45%')
  })

  it('알려 온 것이 없으면(codex) 줄 자체를 그리지 않는다', () => {
    expect(bar(render(null))).toBeNull()
    expect(bar(render({ model: null, contextPercent: null }))).toBeNull()
  })

  it('사용률만 모르면 모델만 뜬다 — 빈 칸을 남기지 않는다', () => {
    const container = render({ model: 'claude-opus-5', contextPercent: null })
    expect(bar(container)?.textContent).toBe('opus-5')
  })
})
