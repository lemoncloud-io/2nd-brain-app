// main.css 읽기 본문 토큰 — 위키 리더·자료 미리보기·채팅 답이 같이 쓴다.
// 타입 스케일(7단계)과 포커스 링(focus-ring)의 정본은 DESIGN.md § 토큰이다.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./main.css', import.meta.url), 'utf8')

const ruleOf = (selector: string): string => {
  const at = css.indexOf(selector)
  expect(at, `${selector} 규칙이 main.css에 있다`).toBeGreaterThan(-1)
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('prose-wiki 토큰', () => {
  it('h2는 18px(text-title)이다 — 20px은 스케일 밖이다', () => {
    expect(ruleOf('.prose-wiki h2')).toContain('font-size: 1.125em')
  })

  it('위키 링크 포커스는 focus-ring과 같은 2px 링이다 — 브라우저 기본 윤곽 밖이다', () => {
    const rule = ruleOf('.prose-wiki a:focus-visible')
    expect(rule).toContain('hsl(var(--primary-ink))')
    expect(rule).toContain('0 0 0 4px')
  })

  it('리더 체크박스는 편집기와 같은 24px 히트·2px 링이다', () => {
    const rule = ruleOf('.prose-wiki .wiki-task-box')
    expect(rule).toContain('padding: 5px')
    const focus = ruleOf('.prose-wiki .wiki-task-box:focus-visible')
    expect(focus).toContain('hsl(var(--primary-ink))')
    expect(focus).toContain('0 0 0 4px')
  })

  it('접은 속성 칩 포커스는 2px 링이다 — 브라우저 기본 1px 밖이다', () => {
    const focus = ruleOf('.live-preview .cm-lp-props:focus-visible')
    expect(focus).toContain('hsl(var(--primary-ink))')
    expect(focus).toContain('0 0 0 4px')
  })
})
