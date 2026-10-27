import { describe, expect, it } from 'vitest'
import { knowledgeBadge, knowledgeBadgeLabel } from './knowledge-badge'

describe('knowledgeBadge', () => {
  it('셋을 더한다', () => {
    expect(knowledgeBadge({ approvals: 2, items: 1, clippings: 3 })).toBe(6)
  })

  it('풀이는 있는 것만, 승인 대기가 맨 앞', () => {
    expect(knowledgeBadgeLabel({ approvals: 2, items: 0, clippings: 3 })).toBe(
      '승인 대기 2 · 자료 3'
    )
    expect(knowledgeBadgeLabel({ approvals: 0, items: 1, clippings: 0 })).toBe('검토 1')
    expect(knowledgeBadgeLabel({ approvals: 0, items: 0, clippings: 0 })).toBe('')
  })
})
