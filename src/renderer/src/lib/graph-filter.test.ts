import { describe, expect, it } from 'vitest'
import type { GraphNode } from '../../../shared/wiki/graph'
import type { NodeKind } from './graph-node-look'
import { matchesFilter, type GraphFilter } from './graph-filter'

const page = (over: Partial<GraphNode> = {}): GraphNode => ({
  key: 'wiki/a.md',
  rel: 'wiki/a.md',
  label: 'A',
  ghost: false,
  community: 0,
  ...over
})

const filter = (over: Partial<GraphFilter> = {}): GraphFilter => ({
  kinds: new Set<NodeKind>(['page', 'system', 'ghost']),
  community: null,
  ...over
})

describe('matchesFilter', () => {
  it('아무것도 안 고르면 다 보인다', () => {
    expect(matchesFilter(page(), filter())).toBe(true)
    expect(matchesFilter(page({ key: 'ghost:b', rel: null, ghost: true }), filter())).toBe(true)
  })

  it('끈 종류는 숨는다', () => {
    const noGhosts = filter({ kinds: new Set(['page', 'system']) })
    expect(matchesFilter(page({ key: 'ghost:b', rel: null, ghost: true }), noGhosts)).toBe(false)
    expect(matchesFilter(page(), noGhosts)).toBe(true)
  })

  it('묶음을 고르면 그 묶음만 남는다', () => {
    const only1 = filter({ community: 1 })
    expect(matchesFilter(page({ community: 1 }), only1)).toBe(true)
    expect(matchesFilter(page({ community: 0 }), only1)).toBe(false)
  })

  // 종류와 묶음은 둘 다 통과해야 한다 — 유령이 고른 묶음에 있어도 종류가 꺼져 있으면 숨는다
  it('종류가 먼저다 — 묶음이 맞아도 종류가 꺼져 있으면 안 보인다', () => {
    const onlyPages = filter({ kinds: new Set<NodeKind>(['page']), community: 0 })
    expect(
      matchesFilter(page({ key: 'ghost:b', rel: null, ghost: true, community: 0 }), onlyPages)
    ).toBe(false)
    expect(matchesFilter(page({ community: 0 }), onlyPages)).toBe(true)
  })
})
