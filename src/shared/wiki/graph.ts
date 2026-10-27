import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import { LINT_EXEMPT } from './lint'
import { createLinkResolver, type PageRef, type WikiLink } from './parse'

/** 그래프 입력 — WikiService.list 결과의 최소 부분 */
export interface GraphPageInput {
  rel: string
  slug: string
  frontmatter: Record<string, unknown> | null
  links: WikiLink[]
}

export interface GraphNode {
  /** 페이지는 rel, 유령은 ghost:<target> */
  key: string
  /** 페이지면 rel, 유령이면 null */
  rel: string | null
  label: string
  ghost: boolean
  community: number
}

export interface GraphEdge {
  source: string
  target: string
  /** 4-signal 합 */
  weight: number
  /** 직접 링크(양방향이어도 1) */
  direct: 0 | 1
  /** 공유 출처 수 */
  sourceOverlap: number
  /** 1.5 × Σ 1/ln(deg(공통 이웃)) */
  adamicAdar: number
  /** 같은 type이면 1, type이 없으면 0 */
  typeAffinity: 0 | 1
}

export interface CommunityInfo {
  id: number
  /** 커뮤니티 내부 엣지 비율 */
  cohesion: number
  /** 응집도 < 0.15 */
  weak: boolean
}

export interface WikiGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  communities: CommunityInfo[]
}

// 구조 페이지(INDEX·TOPIC_MAP·VAULT_MEMORY) — 정본은 lint 의 LINT_EXEMPT 다.
// 그래프 캔버스는 이 판정으로 시스템 노드를 칠한다.
const STRUCTURAL = new Set<string>(LINT_EXEMPT)

// 볼트 루트의 구조 페이지만 — wiki/topics/INDEX.md 같은 하위 페이지는 일반 페이지다.
// 그래프 캔버스는 이 판정으로 시스템 노드를 칠한다.
export const isStructural = (node: GraphNode): boolean =>
  node.rel !== null && STRUCTURAL.has(node.rel)

const W_DIRECT = 3.0
const W_SOURCE = 4.0
const W_ADAMIC = 1.5
const W_TYPE = 1.0

/** raw/·Clippings/ 대상은 위키 노드가 아니다 — 유령도 만들지 않는다 */
const NON_WIKI_RE = /^(raw|Clippings)\//

const sourcesOf = (frontmatter: Record<string, unknown> | null): string[] => {
  const raw = frontmatter?.sources
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : []
}

export function buildGraph(pages: GraphPageInput[], rng?: () => number): WikiGraph {
  const index: PageRef[] = pages.map((p) => ({ rel: p.rel, slug: p.slug }))
  const byRel = new Map(pages.map((p) => [p.rel, p]))
  const relOfSlug = new Map(index.map((r) => [r.slug, r.rel]))

  // 링크마다 index 전체를 다시 훑으면 페이지 수에 비례해 느려진다 — 조회표를 한 번 만든다
  const resolveRef = createLinkResolver(index)
  const resolve = (target: string): string | null => {
    const direct = relOfSlug.get(target)
    if (direct) return direct
    return resolveRef(target).rel
  }

  // 노드 — 페이지 + 끊긴 대상 유령
  const nodes = new Map<string, GraphNode>()
  for (const p of pages) {
    nodes.set(p.rel, { key: p.rel, rel: p.rel, label: p.slug, ghost: false, community: 0 })
  }
  const linksOf = new Map<string, string[]>()
  for (const p of pages) {
    const targets: string[] = []
    for (const link of p.links) {
      const t = link.target
      if (!t || NON_WIKI_RE.test(t)) continue
      if (t === p.slug || t === p.rel) continue // 자기 링크는 엣지 없음
      const rel = resolve(t)
      if (rel === p.rel) continue // 철자가 달라도 자기 자신이면 엣지 없음
      if (rel) {
        // 전체 인덱스에서 풀리면 밖 문서도 실제 엣지다 — vaultFile 표시는 미해결 때만 본다
        targets.push(rel)
      } else if (link.vaultFile) {
        // 볼트 파일(wiki 밖 문서)로 이어진 링크는 페이지 그래프의 노드가 아니다 — 유령으로도 그리지 않는다
        continue
      } else {
        const key = `ghost:${t}`
        targets.push(key)
        if (!nodes.has(key)) {
          nodes.set(key, { key, rel: null, label: t, ghost: true, community: 0 })
        }
      }
    }
    linksOf.set(p.rel, targets)
  }

  // 직접 링크 집합(무방향, 쌍 하나) + 인접도
  const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
  const directPairs = new Set<string>()
  for (const [rel, targets] of linksOf) {
    for (const t of targets) directPairs.add(pairKey(rel, t))
  }

  // 공통 이웃 — Adamic-Adar용(무방향 이웃 집합)
  const neighbors = new Map<string, Set<string>>()
  for (const [rel, targets] of linksOf) {
    const set = neighbors.get(rel) ?? new Set<string>()
    for (const t of targets) {
      set.add(t)
      const other = neighbors.get(t) ?? new Set<string>()
      other.add(rel)
      neighbors.set(t, other)
    }
    neighbors.set(rel, set)
  }
  const adamicOf = (a: string, b: string): number => {
    let sum = 0
    const setB = neighbors.get(b)
    if (!setB) return 0
    for (const c of neighbors.get(a) ?? []) {
      if (!setB.has(c)) continue
      const d = neighbors.get(c)?.size ?? 0
      if (d > 1) sum += 1 / Math.log(d)
    }
    return W_ADAMIC * sum
  }

  const typeOf = (rel: string): string | null => {
    const t = byRel.get(rel)?.frontmatter?.type
    return typeof t === 'string' && t ? t : null
  }

  // 엣지 = 직접 링크 쌍 ∪ 출처를 공유하는 페이지 쌍(페이지끼리만).
  // 출처 목록은 쌍마다 다시 읽지 않고 한 번만 꺼내 둔다
  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  const candidates: [string, string][] = []
  for (const [rel, targets] of linksOf) for (const t of targets) candidates.push([rel, t])
  const pageRels = pages.map((p) => p.rel)
  const sourcesByRel = new Map(pages.map((p) => [p.rel, sourcesOf(p.frontmatter)]))
  for (let i = 0; i < pageRels.length; i++) {
    for (let j = i + 1; j < pageRels.length; j++) {
      const a = pageRels[i]!
      const b = pageRels[j]!
      const shared = (sourcesByRel.get(a) ?? []).filter((s) =>
        (sourcesByRel.get(b) ?? []).includes(s)
      )
      if (shared.length > 0) candidates.push([a, b])
    }
  }
  for (const [rel, t] of candidates) {
    const k = pairKey(rel, t)
    if (seen.has(k)) continue
    seen.add(k)
    const a = byRel.get(rel)
    const b = t.startsWith('ghost:') ? null : byRel.get(t)
    const sourceOverlapCount =
      a && b
        ? (sourcesByRel.get(a.rel) ?? []).filter((s) => (sourcesByRel.get(b.rel) ?? []).includes(s))
            .length
        : 0
    const typeA = a ? typeOf(a.rel) : null
    const typeB = b ? typeOf(b.rel) : null
    const typeAffinity: 0 | 1 = typeA && typeB && typeA === typeB ? 1 : 0
    const sourceOverlap = sourceOverlapCount * W_SOURCE
    const direct: 0 | 1 = directPairs.has(k) ? 1 : 0
    const adamicAdar = b ? adamicOf(rel, t) : 0
    const weight = direct * W_DIRECT + sourceOverlap + adamicAdar + typeAffinity * W_TYPE
    edges.push({
      source: rel,
      target: t,
      weight,
      direct,
      sourceOverlap: sourceOverlapCount,
      adamicAdar,
      typeAffinity
    })
  }

  // 커뮤니티 — Louvain(rng 주입). 노드가 0~1개면 단일 커뮤니티
  const communities: CommunityInfo[] = []
  if (nodes.size > 1) {
    const g = new Graph({ type: 'undirected' })
    for (const node of nodes.keys()) g.addNode(node)
    for (const e of edges) {
      if (!g.hasEdge(e.source, e.target)) g.addEdge(e.source, e.target, { weight: e.weight })
    }
    let assignment: Record<string, number>
    try {
      assignment = louvain(g, rng ? { rng } : {})
    } catch {
      assignment = {}
    }
    for (const [key, node] of nodes) node.community = assignment[key] ?? 0
    const communityIds = [...new Set(Object.values(assignment))]
    for (const id of communityIds.sort((a, b) => a - b)) {
      const members = new Set(
        Object.entries(assignment)
          .filter(([, c]) => c === id)
          .map(([k]) => k)
      )
      let inside = 0
      let total = 0
      for (const e of edges) {
        if (members.has(e.source) && members.has(e.target)) inside += 1
        if (members.has(e.source) || members.has(e.target)) total += 1
      }
      const cohesion = total > 0 ? inside / total : 1
      communities.push({ id, cohesion, weak: cohesion < 0.15 })
    }
  } else if (nodes.size === 1) {
    communities.push({ id: 0, cohesion: 1, weak: false })
  }

  return { nodes: [...nodes.values()], edges, communities }
}
