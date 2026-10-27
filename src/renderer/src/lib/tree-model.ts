// 파일 트리 모델 — main 이 준 평면 목록을 Obsidian 파일 탐색기 모양으로 세운다.
// 폴더 먼저, 그다음 파일. 펼친 폴더의 자식만 행이 된다(수백 개 파일이 든 폴더를 접으면 행은 하나).
import type { VaultTreeEntry } from '../../../shared/ipc-contract'
import type { VaultChangeMap, VaultFileChange } from '../../../shared/vault-changes'
import { getT } from './i18n'

export type TreeNode = VaultTreeEntry & { name: string; children: TreeNode[] }
export type TreeRow = { node: TreeNode; depth: number }
export type TreeSort = 'name' | 'recent'

const nameOf = (rel: string): string => rel.slice(rel.lastIndexOf('/') + 1)

const byName = (a: TreeNode, b: TreeNode): number =>
  a.name.localeCompare(b.name, 'ko', { sensitivity: 'base', numeric: true })

const sortNodes = (nodes: TreeNode[], sort: TreeSort): void => {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    if (sort === 'recent' && a.kind === 'file') return b.mtimeMs - a.mtimeMs || byName(a, b)
    return byName(a, b)
  })
  for (const node of nodes) sortNodes(node.children, sort)
}

/** 평면 목록 → 뿌리 노드들. 부모 폴더 항목이 빠져 있어도 경로로 만든다 */
export const buildTree = (entries: VaultTreeEntry[], sort: TreeSort = 'name'): TreeNode[] => {
  const roots: TreeNode[] = []
  const dirs = new Map<string, TreeNode>()
  const dirFor = (rel: string): TreeNode[] => {
    if (rel === '') return roots
    const known = dirs.get(rel)
    if (known) return known.children
    const node: TreeNode = {
      rel,
      kind: 'dir',
      ext: '',
      mtimeMs: 0,
      size: 0,
      name: nameOf(rel),
      children: []
    }
    dirs.set(rel, node)
    dirFor(rel.slice(0, Math.max(rel.lastIndexOf('/'), 0))).push(node)
    return node.children
  }
  for (const entry of entries) {
    const parent = entry.rel.slice(0, Math.max(entry.rel.lastIndexOf('/'), 0))
    if (entry.kind === 'dir') dirFor(entry.rel)
    else dirFor(parent).push({ ...entry, name: nameOf(entry.rel), children: [] })
  }
  sortNodes(roots, sort)
  return roots
}

/** 화면에 그릴 행 — `expanded` 에 든 폴더만 연다 */
export const visibleRows = (roots: TreeNode[], expanded: Set<string>): TreeRow[] => {
  const rows: TreeRow[] = []
  const walk = (nodes: TreeNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ node, depth })
      if (node.kind === 'dir' && expanded.has(node.rel)) walk(node.children, depth + 1)
    }
  }
  walk(roots, 0)
  return rows
}

/**
 * 행 이름 — 기본은 md 의 확장자를 숨기고(Obsidian 과 같다) 다른 형식은 꼬리표로 만든다.
 * `showExtension` 이면 디스크에 적힌 이름 그대로다 — 꼬리표는 달지 않는다(같은 말을 두 번 하게 된다).
 */
export const treeLabel = (
  entry: VaultTreeEntry,
  showExtension = false
): { name: string; tag: string | null } => {
  const name = nameOf(entry.rel)
  if (entry.kind === 'dir' || entry.ext === '' || showExtension) return { name, tag: null }
  const stem = name.slice(0, name.length - entry.ext.length)
  if (entry.ext === '.md') return { name: stem, tag: null }
  return { name: stem, tag: entry.ext.slice(1).toUpperCase() }
}

/** 그 파일을 감싼 폴더들 — 열린 파일이 접힌 폴더 뒤에 숨지 않게 편다 */
export const ancestorsOf = (rel: string): string[] => {
  const parts = rel.split('/').slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}

/**
 * 배지 문구 — 트리가 쓰는 말은 여기서만 나온다. `M`·`U` 같은 git 글자는 화면에 쓰지 않는다
 * (PRODUCT.md 원칙 4). 색을 못 보는 사람에게도 `aria-label`·`title` 로 같은 뜻이 간다.
 */
export const changeLabel = (change: VaultFileChange): string =>
  change === 'new' ? getT().library.fileNew : getT().library.fileChanged

/**
 * 폴더 행의 점 — 그 안 어딘가에 달라진 것이 있나. 글자는 붙이지 않는다(무엇이 바뀌었는지는
 * 펴서 본다). 맵을 한 번 훑는다 — 행마다 다시 세면 수백 행에서 느려진다
 */
export const changedFolders = (changes: VaultChangeMap): Set<string> => {
  const folders = new Set<string>()
  for (const rel of Object.keys(changes)) {
    for (const folder of ancestorsOf(rel)) folders.add(folder)
  }
  return folders
}
