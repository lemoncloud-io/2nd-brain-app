// 파일 트리의 진행 고리 — 어느 행을 세어 물어야 하는지 고르고, 센 결과를 캐시에서 꺼낸다.
//
// 보이는 행만 센다: 접힌 폴더의 수백 개 파일까지 세면 실행할 때마다 보관함을 통째로 읽는다.
// 캐시 키는 `rel|mtime` 이라 파일이 바뀌면 자동으로 다시 센다(트리가 mtime 을 들고 온다).
import type { CheckboxCount } from '../../../shared/wiki/checkbox'
import type { TreeRow } from './tree-model'

/** 센 적 없음 = 키 없음, 세 봤지만 체크박스가 없음 = null */
export type CountCache = Map<string, CheckboxCount | null>

export const countKey = (rel: string, mtimeMs: number): string => `${rel}|${mtimeMs}`

const isMarkdown = (rel: string): boolean => rel.toLowerCase().endsWith('.md')

/** 아직 세지 않은 md 행 — 이만큼만 한 번에 묻는다 */
export const unreadRels = (rows: TreeRow[], cache: CountCache): string[] =>
  rows
    .filter(
      (row) =>
        row.node.kind === 'file' &&
        isMarkdown(row.node.rel) &&
        !cache.has(countKey(row.node.rel, row.node.mtimeMs))
    )
    .map((row) => row.node.rel)

/**
 * 센 결과를 캐시에 넣는다 — 돌아오지 않은 파일은 체크박스가 없다는 뜻이라 `null` 로 적는다.
 * 물어본 판(`mtime`)에 적어 둬야 다음에 파일이 바뀌었는지 가린다.
 */
export const rememberCounts = (
  cache: CountCache,
  rows: TreeRow[],
  asked: string[],
  counts: Record<string, CheckboxCount>
): void => {
  const mtimes = new Map(rows.map((row) => [row.node.rel, row.node.mtimeMs]))
  for (const rel of asked) {
    const mtimeMs = mtimes.get(rel)
    if (mtimeMs === undefined) continue
    cache.set(countKey(rel, mtimeMs), counts[rel] ?? null)
  }
}

/** 그 행에 그릴 수 — 아직 세지 않았거나 체크박스가 없으면 null */
export const countOf = (cache: CountCache, rel: string, mtimeMs: number): CheckboxCount | null =>
  cache.get(countKey(rel, mtimeMs)) ?? null
