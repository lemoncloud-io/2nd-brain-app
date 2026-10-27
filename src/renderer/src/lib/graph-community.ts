// 묶음(커뮤니티)을 사람이 고를 수 있게 이름 붙이기.
import type { WikiGraph } from '../../../shared/wiki/graph'

/**
 * 묶음 고르기 목록은 번호만으로는 고를 근거가 없다 — 그 묶음에서 가장 많이 이어진 페이지 이름을 붙인다.
 * 이음 수가 같으면 먼저 나온 것을 쓴다(목록 순서가 매번 같아야 한다).
 */
export const communityTitles = (graph: WikiGraph): Map<number, string> => {
  const degree = new Map<string, number>()
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }
  const best = new Map<number, { label: string; degree: number }>()
  for (const node of graph.nodes) {
    if (node.ghost) continue
    const mine = degree.get(node.key) ?? 0
    const held = best.get(node.community)
    if (!held || mine > held.degree) best.set(node.community, { label: node.label, degree: mine })
  }
  return new Map([...best].map(([id, { label }]) => [id, label]))
}

/** 무리마다 읽을 점 수 — 유령은 뺀다. 고르개 상위 노출이 쓴다 */
export const communitySizes = (graph: WikiGraph): Map<number, number> => {
  const sizes = new Map<number, number>()
  for (const node of graph.nodes) {
    if (node.ghost) continue
    sizes.set(node.community, (sizes.get(node.community) ?? 0) + 1)
  }
  return sizes
}

/** 고르개에 한 번에 보이는 무리 수 — 수백 개 펼침은 골라 쓸 수 없다 */
export const VISIBLE_COMMUNITIES = 30

/**
 * 고르개에 보이는 무리 — 점 많은 순 상위 N개 + 골라 둔 무리(순위 밖이어도 남긴다).
 * 전부 보기는 `전체` 로 — 고르개는 골라 들어가는 길이지 목록이 아니다.
 */
export const visibleCommunities = (
  graph: WikiGraph,
  selected: number | null,
  limit: number = VISIBLE_COMMUNITIES
): number[] => {
  const sizes = communitySizes(graph)
  const ids = graph.communities.map((c) => c.id)
  const ranked = ids.sort((a, b) => (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0) || a - b)
  const shown = ranked.slice(0, limit)
  if (selected !== null && !shown.includes(selected) && ranked.includes(selected)) {
    shown.push(selected)
  }
  return shown
}
