// @vitest-environment jsdom
// 고친 곳 두기 — 둔 곳이 DOM에서 사라져도 키보드 위치는 이웃 곳이나 끝 문장으로 간다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChatContext } from './chat-context'
import type { ChatSession } from './use-chat-session'
import type { HunkReview } from '../../../../shared/ipc-contract'
import { HunkReviewPanel } from './hunk-review'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const review: HunkReview = {
  hunks: [
    { line: 1, removed: ['a'], added: ['b'] },
    { line: 5, removed: ['c'], added: ['d'] }
  ],
  hash: 'h'
}

const twinReview: HunkReview = {
  hunks: [
    { line: 1, removed: ['x'], added: ['y'] },
    { line: 9, removed: ['x'], added: ['y'] }
  ],
  hash: 't'
}

const api = {
  changeReview: vi.fn<() => Promise<HunkReview>>(),
  rejectChangeHunk: vi.fn()
}
;(window as unknown as { api: typeof api }).api = api

const chat = { activeId: 'c1', applyChanges: vi.fn() } as unknown as ChatSession

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.changeReview.mockResolvedValue(review)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
})

const byTestId = (id: string): HTMLElement | null => document.querySelector(`[data-testid="${id}"]`)

const open = async (): Promise<void> => {
  await act(async () => {
    root.render(
      <ChatContext.Provider value={chat}>
        <HunkReviewPanel changeId="ch1" rel="wiki/a.md" />
      </ChatContext.Provider>
    )
  })
}

const keep = (index: number): void => {
  const button = byTestId(`hunk-accept:${index}`) as HTMLButtonElement
  act(() => button.focus())
  act(() => button.click())
}

describe('HunkReviewPanel', () => {
  it('둔 곳이 사라지면 초점이 다음 곳의 두기로 간다', async () => {
    await open()
    keep(0)
    expect(byTestId('hunk:0')).toBeNull()
    expect(document.activeElement?.getAttribute('data-testid')).toBe('hunk-accept:1')
  })

  it('마지막 곳을 두면 초점이 끝 문장으로 간다', async () => {
    await open()
    keep(1)
    // 뒤쪽을 먼저 두면 앞쪽 이웃으로 간다
    expect(document.activeElement?.getAttribute('data-testid')).toBe('hunk-accept:0')
    keep(0)
    expect(byTestId('hunk-done')).not.toBeNull()
    expect(document.activeElement?.getAttribute('data-testid')).toBe('hunk-done')
  })

  it('같은 내용 두 곳 중 하나를 두면 다른 하나는 남는다', async () => {
    api.changeReview.mockResolvedValue(twinReview)
    await open()
    keep(0)
    expect(byTestId('hunk:0')).toBeNull()
    expect(byTestId('hunk:1')).not.toBeNull()
    expect(byTestId('hunk-done')).toBeNull()
  })

  it('뒤쪽 쌍둥이를 먼저 두면 그 자리가 사라지고 초점은 앞쪽에 남는다', async () => {
    api.changeReview.mockResolvedValue(twinReview)
    await open()
    keep(1)
    expect(byTestId('hunk:1')).toBeNull()
    expect(byTestId('hunk:0')).not.toBeNull()
    expect(document.activeElement?.getAttribute('data-testid')).toBe('hunk-accept:0')
  })

  it('쌍둥이를 둘 다 두면 끝 문장으로 간다', async () => {
    api.changeReview.mockResolvedValue(twinReview)
    await open()
    keep(0)
    keep(1)
    expect(byTestId('hunk-done')).not.toBeNull()
    expect(document.activeElement?.getAttribute('data-testid')).toBe('hunk-done')
  })
})
