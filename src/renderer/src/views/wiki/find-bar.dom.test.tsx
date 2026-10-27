// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FindBar } from './find-bar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const mount = (
  total: number,
  at = 0
): {
  onQueryChange: ReturnType<typeof vi.fn>
  onStep: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
} => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  const onQueryChange = vi.fn()
  const onStep = vi.fn()
  const onClose = vi.fn()
  act(() =>
    root.render(
      <FindBar
        query=""
        onQueryChange={onQueryChange}
        total={total}
        at={at}
        onStep={onStep}
        onClose={onClose}
      />
    )
  )
  return { onQueryChange, onStep, onClose }
}

const input = (): HTMLInputElement => document.querySelector('input') as HTMLInputElement
const key = (init: KeyboardEventInit): void => {
  act(() => {
    input().dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    )
  })
}
const count = (): string =>
  document.querySelector('[data-testid="wiki-find-count"]')?.textContent ?? ''

describe('FindBar — test: find-bar.tsx', () => {
  it('일치 0 이면 0/0 이고 이동 버튼이 잠긴다, 있으면 n/m', () => {
    mount(0)
    expect(count()).toBe('0/0')
    expect(
      (document.querySelector('[aria-label="다음 찾은 곳"]') as HTMLButtonElement).disabled
    ).toBe(true)
    document.body.innerHTML = ''
    mount(5, 2)
    expect(count()).toBe('3/5')
  })

  it('Enter 다음·Shift+Enter 이전·Esc 닫기, 열리면 입력칸에 초점', () => {
    const { onStep, onClose } = mount(3)
    expect(document.activeElement).toBe(input())
    key({ key: 'Enter' })
    key({ key: 'Enter', shiftKey: true })
    key({ key: 'Escape' })
    expect(onStep.mock.calls.map((c) => c[0])).toEqual([1, -1])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('한글 조합 중에는 질의를 올리지 않고 조합이 끝나면 올린다', () => {
    const { onQueryChange } = mount(0)
    const el = input()
    act(() => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    })
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(el, 'ㄱ')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onQueryChange).not.toHaveBeenCalled()
    act(() => {
      setter?.call(el, '가')
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    })
    expect(onQueryChange).toHaveBeenLastCalledWith('가')
  })
})
