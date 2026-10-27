// 그래프에서 무엇만 볼지 — 종류와 묶음.
import type { GraphNode } from '../../../shared/wiki/graph'
import { nodeKind, type NodeKind } from './graph-node-look'

export type GraphFilter = { kinds: Set<NodeKind>; community: number | null }

/** 이 점이 지금 필터를 통과하나 */
export const matchesFilter = (node: GraphNode, filter: GraphFilter): boolean => {
  if (!filter.kinds.has(nodeKind(node))) return false
  return filter.community === null || node.community === filter.community
}
