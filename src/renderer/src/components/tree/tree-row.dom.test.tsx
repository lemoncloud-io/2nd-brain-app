// @vitest-environment jsdom
// 트리 진행 고리 — 다 끝나면 꽉 찬 모양 + 읽히는 이름. 색은 밝은 면에서도 읽히는 ink다.
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ProgressRing } from './tree-row'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ProgressRing', () => {
  it('다 끝나면 고리가 primary-ink다 — 밝은 면 Spark(2.33:1) 밖이다', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<ProgressRing rel="wiki/a.md" count={{ done: 2, total: 2 }} />))
    const ring = container.querySelector('[data-testid="tree-progress:wiki/a.md"]')!
    expect(ring.getAttribute('aria-label')).toBe('할 일 2/2')
    expect(ring.classList.contains('text-primary-ink')).toBe(true)
    expect(ring.classList.contains('text-primary')).toBe(false)
    act(() => root.unmount())
    container.remove()
  })
})
