// @vitest-environment jsdom
// 승인 카드 — 원문은 접어도 전체를 볼 수 있고, 단추 셋이 각 답을 돌려준다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PermissionCard } from './permission-card'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

const mount = (tool: string, target: string, onAnswer = vi.fn()): ReturnType<typeof vi.fn> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<PermissionCard tool={tool} target={target} onAnswer={onAnswer} />))
  return onAnswer
}

const button = (testId: string): HTMLButtonElement | null =>
  document.querySelector(`[data-testid="${testId}"]`)

describe('PermissionCard', () => {
  it('도구 한 줄과 원문을 보여 준다', () => {
    mount('Bash', 'date')
    expect(document.querySelector('[data-testid="chat-permission-card"]')?.textContent).toContain(
      '허용할까요?'
    )
    expect(document.querySelector('[data-testid="chat-permission-raw"]')?.textContent).toContain(
      'Bash date'
    )
    expect(
      document.querySelector('[data-testid="chat-permission-raw"]')?.getAttribute('title')
    ).toBe('Bash date')
  })

  it('긴 원문은 접고 전체 보기로 펼친다', () => {
    const long = `Bash ${'x'.repeat(200)}`
    mount('Bash', 'x'.repeat(200))
    const raw = document.querySelector('[data-testid="chat-permission-raw"]')
    expect(raw?.textContent).toContain('…')
    expect(raw?.textContent?.length).toBeLessThan(long.length)
    act(() => button('chat-permission-more')?.click())
    expect(document.querySelector('[data-testid="chat-permission-raw"]')?.textContent).toBe(long)
  })

  it('단추 셋이 각 답을 돌려준다', () => {
    const onAnswer = mount('Bash', 'date')
    act(() => button('chat-permission-allow')?.click())
    act(() => button('chat-permission-session')?.click())
    act(() => button('chat-permission-deny')?.click())
    expect(onAnswer).toHaveBeenNthCalledWith(1, 'allow')
    expect(onAnswer).toHaveBeenNthCalledWith(2, 'session')
    expect(onAnswer).toHaveBeenNthCalledWith(3, 'deny')
  })
})
