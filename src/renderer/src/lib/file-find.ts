// 종류로 찾기 — ⌘K 와 검색 화면이 같은 종류 단추·같은 이름 일치를 쓴다.
// md 아닌 파일(PDF·그림…)은 본문을 읽지 않고 이름·경로로만 찾는다.
import type { VaultTreeEntry } from '../../../shared/ipc-contract'
import { fileKind } from '../../../shared/vault-file-types'
import { PALETTE_LIMIT, matchPages, type PaletteEntry } from './page-match'
import { treeLabel } from './tree-model'
import { getT } from './i18n'

export type FindKind = 'doc' | 'pdf' | 'image' | 'html' | 'other'

/** 종류 단추 — `null` 은 가리지 않는다 */
export const FIND_KIND_OPTIONS: { id: FindKind | null; label: string }[] = (
  [null, 'doc', 'pdf', 'image', 'html', 'other'] as const
).map((id) => ({
  id,
  get label() {
    return getT().library.kind[id ?? 'all']
  }
}))

export const findKindOf = (rel: string): FindKind => {
  const kind = fileKind(rel)
  if (kind === 'markdown') return 'doc'
  return kind === 'pdf' || kind === 'image' || kind === 'html' ? kind : 'other'
}

/** 이름으로 찾는 파일 한 줄 — `tag` 는 트리와 같은 형식 꼬리표(`PDF`) */
export type FileEntry = PaletteEntry & { tag: string | null }

/** 트리의 md 아닌 파일 — 제목은 트리가 보이는 이름(확장자 뺀 것)이다 */
export const fileEntries = (tree: VaultTreeEntry[]): FileEntry[] =>
  tree
    .filter((e) => e.kind === 'file' && findKindOf(e.rel) !== 'doc')
    .map((e) => {
      const { name, tag } = treeLabel(e)
      return { rel: e.rel, title: name, tag }
    })

/** 종류로 거른 이름 일치. 낱말 없이 종류만 고르면 그 종류 전부(이름순) — 종류도 없으면 빈 목록 */
export const findByKind = <T extends PaletteEntry>(
  entries: T[],
  kind: FindKind | null,
  text: string
): T[] => {
  const pool = kind === null ? entries : entries.filter((e) => findKindOf(e.rel) === kind)
  if (text.trim() !== '') return matchPages(pool, text)
  if (kind === null) return []
  return pool
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
    .slice(0, PALETTE_LIMIT)
}
