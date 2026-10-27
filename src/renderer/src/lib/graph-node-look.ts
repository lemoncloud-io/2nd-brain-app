import type { GraphNode, WikiGraph } from '../../../shared/wiki/graph'
import { isStructural } from '../../../shared/wiki/graph'
import { getT } from './i18n'

/** 점의 기본 크기와 짚었을 때 뜨는 이름 */
type NodeLook = { size: number; label: string }

/** 점의 종류 — 범례와 필터가 같이 쓴다. 색만으로는 무엇인지 알 수 없다 */
export type NodeKind = 'page' | 'system' | 'ghost'

export const nodeKind = (node: GraphNode): NodeKind =>
  node.ghost ? 'ghost' : isStructural(node) ? 'system' : 'page'

export const KIND_LABEL: Record<NodeKind, string> = {
  get page() {
    return getT().library.nodePage
  },
  get system() {
    return getT().library.nodeSystem
  },
  get ghost() {
    return getT().library.nodeGhost
  }
}

export const nodeLook = (node: GraphNode): NodeLook => {
  if (node.ghost) return { size: 4, label: node.label }
  if (isStructural(node)) return { size: 5, label: getT().library.nodeSystemLabel(node.label) }
  return { size: 7, label: node.label }
}

/**
 * 눌렀을 때 열 페이지 — 없으면 null.
 * 유령은 아직 없는 페이지라 열 것이 없고, rel 이 없는 점도 마찬가지다.
 */
export const openableRel = (node: GraphNode): string | null =>
  node.ghost ? null : (node.rel ?? null)

/** 종류별 점 개수 — 범례가 색 옆에 수를 같이 보인다 */
export const countByKind = (graph: WikiGraph): Record<NodeKind, number> => {
  const counts: Record<NodeKind, number> = { page: 0, system: 0, ghost: 0 }
  for (const node of graph.nodes) counts[nodeKind(node)] += 1
  return counts
}

/**
 * 구면에서 경도 구간을 나눌 구획 — 원본(3d-brain)의 출처 자리. 종류가 먼저(없는 페이지·보관함 관리 문서),
 * 페이지는 위키 안 첫 폴더로 나눈다. 위키 밖 문서는 맨 위 폴더
 */
export const globeSector = (node: GraphNode): string => {
  const kind = nodeKind(node)
  if (kind !== 'page') return kind
  const parts = (node.rel ?? '').split('/').slice(0, -1)
  return `page:${parts[0] === 'wiki' ? (parts[1] ?? '') : (parts[0] ?? '')}`
}
