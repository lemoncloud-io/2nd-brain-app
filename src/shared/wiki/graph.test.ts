import { describe, expect, it } from 'vitest'
import { parseWikiPage } from './parse'
import { buildGraph, type GraphPageInput } from './graph'

const page = (text: string, rel = 'wiki/x.md'): GraphPageInput => {
  const p = parseWikiPage(rel, text)
  return { rel: p.rel, slug: p.slug, frontmatter: p.frontmatter, links: p.links }
}

const mulberry32 =
  (seed: number): (() => number) =>
  () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

describe('buildGraph', () => {
  it('볼트 파일로 이어진 링크(vaultFile)는 유령 노드를 만들지 않는다', () => {
    const a = page('# A\n\n[[projects/demo/README]] [[missing]]\n', 'wiki/a.md')
    const g = buildGraph([
      {
        ...a,
        links: a.links.map((link) =>
          link.target === 'missing' ? link : { ...link, vaultFile: true }
        )
      }
    ])
    expect(g.nodes.map((n) => n.key).sort()).toEqual(['ghost:missing', 'wiki/a.md'])
  })

  it('wiki 밖 문서 링크도 풀리면 실제 엣지가 된다 — test: graph cross-root', () => {
    const a = page('# A\n\n[[b]]\n', 'docs/a.md')
    const b = page('# B\n', 'docs/b.md')
    const g = buildGraph([
      { ...a, links: a.links.map((link) => ({ ...link, vaultFile: true })) },
      b
    ])
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ source: 'docs/a.md', target: 'docs/b.md', direct: 1 })
  })

  it('철자가 달라도 자기 자신 링크는 엣지 없음 — test: self-edge', () => {
    const g = buildGraph([page('# Alpha\n\n[[alpha]] [[Alpha]]\n', 'wiki/Alpha.md')])
    expect(g.edges).toEqual([])
  })

  it('— test: 직접 링크 3.0, 양방향이면 한 번 — test: buildGraph', () => {
    const g = buildGraph([page('# A\n\n[[b]]\n', 'wiki/a.md'), page('# B\n\n[[a]]\n', 'wiki/b.md')])
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({
      source: 'wiki/a.md',
      target: 'wiki/b.md',
      direct: 1,
      weight: 3.0
    })
  })

  it('— test: 출처 겹침 4.0 × 공유 수 — test: buildGraph', () => {
    const g = buildGraph([
      page('---\nsources: [s1, s2]\n---\n\n# A\n', 'wiki/a.md'),
      page('---\nsources: [s1, s2, s3]\n---\n\n# B\n', 'wiki/b.md')
    ])
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ sourceOverlap: 2, weight: 8.0, direct: 0 })
  })

  it('— test: Adamic-Adar 1.5 × Σ 1/ln(deg) — test: buildGraph', () => {
    // a-b, a-c, b-c 직접 링크 + b,c가 모두 d를 가리킴 → a를 공통 이웃으로 하는 b-c는 없음.
    // b-c 엣지의 공통 이웃: a(deg 2 → 1/ln2)
    const g = buildGraph([
      page('# A\n\n[[b]] [[c]]\n', 'wiki/a.md'),
      page('# B\n\n[[a]] [[c]] [[d]]\n', 'wiki/b.md'),
      page('# C\n\n[[a]] [[b]] [[d]]\n', 'wiki/c.md'),
      page('# D\n\n[[b]] [[c]]\n', 'wiki/d.md')
    ])
    const bc = g.edges.find((e) => e.source === 'wiki/b.md' && e.target === 'wiki/c.md')
    const expected = 1.5 * (1 / Math.log(2)) // 공통 이웃 a와 d, 둘 다 deg 2? b,c,d... a의 이웃 b,c → deg 2
    // 공통 이웃: a(이웃 b,c → deg 2), d(이웃 b,c → deg 2) → 2 × 1.5/ln(2)
    expect(bc?.adamicAdar).toBeCloseTo(1.5 * (1 / Math.log(2)) * 2, 5)
    expect(expected).toBeGreaterThan(0)
  })

  it('— test: 타입 친화 — 같은 type 1.0, type 없으면 0 — test: buildGraph', () => {
    const g = buildGraph([
      page('---\ntype: topic\n---\n\n# A\n\n[[b]] [[c]]\n', 'wiki/a.md'),
      page('---\ntype: topic\n---\n\n# B\n', 'wiki/b.md'),
      page('# C\n', 'wiki/c.md')
    ])
    const ab = g.edges.find((e) => e.source === 'wiki/a.md' && e.target === 'wiki/b.md')
    const ac = g.edges.find((e) => e.source === 'wiki/a.md' && e.target === 'wiki/c.md')
    expect(ab).toMatchObject({ typeAffinity: 1 })
    expect(ac).toMatchObject({ typeAffinity: 0 })
  })

  it('— test: 가중치 합산 — 직접 + 출처 + 타입 — test: buildGraph', () => {
    const g = buildGraph([
      page('---\ntype: topic\nsources: [s1]\n---\n\n# A\n\n[[b]]\n', 'wiki/a.md'),
      page('---\ntype: topic\nsources: [s1]\n---\n\n# B\n', 'wiki/b.md')
    ])
    expect(g.edges[0].weight).toBeCloseTo(3.0 + 4.0 + 1.0, 5)
  })

  it('— test: 같은 rng면 같은 커뮤니티 배정 — test: buildGraph', () => {
    const pages = Array.from({ length: 12 }, (_, i) =>
      page(`# P${i}\n\n[[p${(i + 1) % 6}]]\n`, `wiki/p${i}.md`)
    )
    const g1 = buildGraph(pages, mulberry32(42))
    const g2 = buildGraph(pages, mulberry32(42))
    expect(g1.nodes.map((n) => n.community)).toEqual(g2.nodes.map((n) => n.community))
  })

  it('— test: 페이지 0개·1개 — test: buildGraph', () => {
    expect(buildGraph([])).toMatchObject({ nodes: [], edges: [] })
    const g = buildGraph([page('# A\n', 'wiki/a.md')])
    expect(g.nodes).toHaveLength(1)
    expect(g.edges).toHaveLength(0)
  })

  it('— test: 자기 자신 링크는 엣지 없음 — test: buildGraph', () => {
    const g = buildGraph([page('# A\n\n[[a]]\n', 'wiki/a.md')])
    expect(g.edges).toHaveLength(0)
  })

  it('— test: raw/ 를 가리키는 링크는 노드 아님 — test: buildGraph', () => {
    const g = buildGraph([page('# A\n\n[[raw/노트]] [[Clippings/x]]\n', 'wiki/a.md')])
    expect(g.nodes).toHaveLength(1)
    expect(g.edges).toHaveLength(0)
  })

  it('— test: 없는 링크 대상은 점선 유령 노드 — test: buildGraph', () => {
    const g = buildGraph([page('# A\n\n[[ghost]]\n', 'wiki/a.md')])
    const ghost = g.nodes.find((n) => n.ghost)
    expect(ghost).toMatchObject({ rel: null, label: 'ghost' })
    expect(g.edges[0]).toMatchObject({ target: ghost?.key, direct: 1, weight: 3.0 })
  })
})

describe('buildGraph 성능 기록', () => {
  it('— test: 500노드 빌드 시간 기록 — test: buildGraph', () => {
    const pages = Array.from({ length: 500 }, (_, i) =>
      page(`# P${i}\n\n[[p${(i + 1) % 500}]] [[p${(i + 7) % 500}]]\n`, `wiki/p${i}.md`)
    )
    const t0 = performance.now()
    const g = buildGraph(pages, mulberry32(1))
    const ms = performance.now() - t0
    // 기록용 — 회귀 감지용 상한은 넉넉히
    expect(ms).toBeLessThan(5_000)
    expect(g.nodes).toHaveLength(500)
    console.info(`buildGraph 500 nodes: ${ms.toFixed(1)}ms`)
  })
})
