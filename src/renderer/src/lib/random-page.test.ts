import { describe, expect, it } from 'vitest'
import { randomPage } from './random-page'

describe('randomPage', () => {
  it('지금 페이지와 구조 페이지는 고르지 않는다', () => {
    const rels = ['wiki/INDEX.md', 'wiki/a.md', 'wiki/b.md', 'wiki/VAULT_MEMORY.md']
    const picked = new Set([0, 0.5, 0.999].map((roll) => randomPage(rels, 'wiki/a.md', () => roll)))
    expect([...picked]).toEqual(['wiki/b.md'])
  })

  it('고를 것이 없으면 null', () => {
    expect(randomPage([], null)).toBeNull()
    expect(randomPage(['wiki/a.md', 'wiki/INDEX.md'], 'wiki/a.md')).toBeNull()
  })

  it('굴린 값대로 고루 고른다', () => {
    const rels = ['wiki/a.md', 'wiki/b.md', 'wiki/c.md']
    expect([0, 0.34, 0.67].map((roll) => randomPage(rels, null, () => roll))).toEqual(rels)
  })
})
