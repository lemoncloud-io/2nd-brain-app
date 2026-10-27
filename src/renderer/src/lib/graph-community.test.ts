import { describe, expect, it } from 'vitest'
import { buildGraph, type WikiGraph } from '../../../shared/wiki/graph'
import { communitySizes, visibleCommunities } from './graph-community'

describe('communitySizes', () => {
  it('유령을 빼고 무리마다 읽을 점 수를 센다 — test: graph-community sizes', () => {
    const graph = buildGraph([
      { rel: 'wiki/a.md', slug: 'a', frontmatter: null, links: [{ target: 'b' }] },
      { rel: 'wiki/b.md', slug: 'b', frontmatter: null, links: [] },
      { rel: 'wiki/c.md', slug: 'c', frontmatter: null, links: [{ target: 'ghost-x' }] }
    ])
    const sizes = communitySizes(graph)
    const total = [...sizes.values()].reduce((a, b) => a + b, 0)
    expect(total).toBe(3)
    expect([...sizes.keys()].every((id) => Number.isInteger(id))).toBe(true)
  })
})

const fakeGraph = (sizes: number[]): WikiGraph => ({
  nodes: sizes.flatMap((n, c) =>
    Array.from({ length: n }, (_, i) => ({
      key: `c${c}-n${i}`,
      rel: `c${c}/n${i}.md`,
      label: `n${i}`,
      ghost: false,
      community: c
    }))
  ),
  edges: [],
  communities: sizes.map((_, c) => ({ id: c, cohesion: 1, weak: false }))
})

describe('visibleCommunities', () => {
  it('점 많은 순 상위 N개만 — test: graph-community visible', () => {
    const graph = fakeGraph([5, 1, 3])
    expect(visibleCommunities(graph, null, 2)).toEqual([0, 2])
  })

  it('골라 둔 무리는 순위 밖이어도 남긴다', () => {
    const graph = fakeGraph([5, 1, 3])
    expect(visibleCommunities(graph, 1, 2)).toEqual([0, 2, 1])
  })

  it('적을 때는 전부', () => {
    const graph = fakeGraph([2, 2])
    expect(visibleCommunities(graph, null, 30)).toEqual([0, 1])
  })
})
