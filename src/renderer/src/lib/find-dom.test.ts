// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { clampHit, countHits, markCurrentHit } from './find-dom'

const root = (n: number): HTMLElement => {
  const el = document.createElement('div')
  el.innerHTML = Array.from({ length: n }, (_, i) => `<mark data-hit="">${i}</mark>`).join(' ')
  return el
}
const current = (el: HTMLElement): string | undefined =>
  el.querySelector('mark[data-current]')?.textContent ?? undefined

describe('find-dom — test: find-dom.ts', () => {
  it('화면 순서로 세고 at 번째에만 data-current', () => {
    const el = root(3)
    expect(countHits(el)).toBe(3)
    markCurrentHit(el, 1)
    expect(current(el)).toBe('1')
    markCurrentHit(el, 2)
    expect(el.querySelectorAll('mark[data-current]')).toHaveLength(1)
    expect(current(el)).toBe('2')
  })

  it('총계를 넘는 at 은 마지막으로 접고, 0개면 0', () => {
    expect(clampHit(5, 2)).toBe(1)
    expect(clampHit(3, 0)).toBe(0)
    const el = root(2)
    markCurrentHit(el, 5)
    expect(current(el)).toBe('1')
    expect(countHits(root(0))).toBe(0)
  })

  it('scroll=false 면 표시만 되살리고 스크롤하지 않는다', () => {
    const el = root(2)
    const scrolled = vi.fn()
    el.querySelectorAll<HTMLElement>('mark').forEach((m) => {
      m.scrollIntoView = scrolled
    })
    markCurrentHit(el, 1, false)
    expect(current(el)).toBe('1')
    expect(scrolled).not.toHaveBeenCalled()
    markCurrentHit(el, 1)
    expect(scrolled).toHaveBeenCalledTimes(1)
  })
})
