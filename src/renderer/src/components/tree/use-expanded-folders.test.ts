import { describe, expect, it } from 'vitest'
import { withAncestors } from './use-expanded-folders'

describe('withAncestors', () => {
  it('열린 파일을 감싼 폴더를 편다 — 이미 편 것은 그대로', () => {
    const expanded = new Set(['wiki'])
    expect([...withAncestors(expanded, 'areas/daily/노트.md')].sort()).toEqual([
      'areas',
      'areas/daily',
      'wiki'
    ])
  })

  it('펼 것이 없으면 같은 Set 을 돌려준다 — 헛 렌더를 만들지 않는다', () => {
    const expanded = new Set(['areas', 'areas/daily'])
    expect(withAncestors(expanded, 'areas/daily/노트.md')).toBe(expanded)
    expect(withAncestors(expanded, 'VAULT_RULES.md')).toBe(expanded)
    expect(withAncestors(expanded, null)).toBe(expanded)
  })
})
