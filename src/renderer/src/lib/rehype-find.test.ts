import { describe, expect, it } from 'vitest'
import { rehypeFind } from './rehype-find'

type N = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: N[]
}

const p = (...children: N[]): N => ({
  type: 'root',
  children: [{ type: 'element', tagName: 'p', children }]
})
const text = (value: string): N => ({ type: 'text', value })

const flat = (n: N): string =>
  n.type === 'text'
    ? (n.value ?? '')
    : n.tagName === 'mark'
      ? `[${(n.children ?? []).map(flat).join('')}]`
      : (n.children ?? []).map(flat).join('')

describe('rehypeFind — test: rehype-find.ts', () => {
  it('텍스트 노드를 쪼개 mark 로 감싼다 — 코드 안도, 번호는 안 매긴다', () => {
    const tree = p(text('가 나 가'), { type: 'element', tagName: 'code', children: [text('가')] })
    rehypeFind({ query: '가' })(tree as never)
    expect(flat(tree)).toBe('[가] 나 [가][가]')
    const marks: N[] = []
    const collect = (n: N): void => {
      if (n.tagName === 'mark') marks.push(n)
      n.children?.forEach(collect)
    }
    collect(tree)
    expect(marks.map((m) => m.properties)).toEqual([
      { dataHit: '' },
      { dataHit: '' },
      { dataHit: '' }
    ])
  })

  it('빈 질의·일치 없음이면 트리를 건드리지 않는다', () => {
    const tree = p(text('본문'))
    rehypeFind({ query: '' })(tree as never)
    rehypeFind({ query: '없다' })(tree as never)
    expect(flat(tree)).toBe('본문')
  })
})
