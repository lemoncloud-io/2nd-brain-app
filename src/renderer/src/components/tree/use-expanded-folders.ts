// 파일 트리의 펼친 폴더 — 보관함별 localStorage. Obsidian 처럼 기본은 전부 접힘이라 편 것만 적는다.
// 열린 파일이 접힌 폴더 뒤에 숨으면 "없는 것" 으로 보이므로, 그 파일을 감싼 폴더는 자동으로 편다.
import { useCallback, useEffect, useState } from 'react'
import { ancestorsOf } from '../../lib/tree-model'

/** 열린 파일을 감싼 폴더를 편다. 바뀐 게 없으면 같은 Set 을 돌려준다 */
export const withAncestors = (expanded: Set<string>, rel: string | null): Set<string> => {
  if (rel === null) return expanded
  const missing = ancestorsOf(rel).filter((dir) => !expanded.has(dir))
  if (missing.length === 0) return expanded
  return new Set([...expanded, ...missing])
}

const storageKey = (vaultDir: string): string => `second-brain.file-tree.expanded:${vaultDir}`

// 저장소가 막혔거나(비공개 창 등) 값이 깨졌으면 전부 접힌 채로 시작한다
const load = (vaultDir: string | null): Set<string> => {
  if (!vaultDir) return new Set()
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(vaultDir)) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

type Tracked = { vaultDir: string | null; opened: string | null; expanded: Set<string> }

export type ExpandedFolders = {
  expanded: Set<string>
  toggle: (dir: string) => void
  expand: (dir: string) => void
  collapseAll: () => void
}

export const useExpandedFolders = (
  vaultDir: string | null,
  opened: string | null
): ExpandedFolders => {
  const [tracked, setTracked] = useState<Tracked>(() => ({
    vaultDir,
    opened,
    expanded: withAncestors(load(vaultDir), opened)
  }))

  // 보관함·열린 파일이 바뀐 렌더에서 바로 맞춘다 — 이펙트로 한 박자 늦게 펴면 깜빡인다
  let current = tracked
  if (tracked.vaultDir !== vaultDir || tracked.opened !== opened) {
    const base = tracked.vaultDir === vaultDir ? tracked.expanded : load(vaultDir)
    current = { vaultDir, opened, expanded: withAncestors(base, opened) }
    setTracked(current)
  }

  useEffect(() => {
    if (!vaultDir) return
    try {
      localStorage.setItem(storageKey(vaultDir), JSON.stringify([...current.expanded]))
    } catch {
      // 저장 못 해도 이번 실행 동안은 유지된다
    }
  }, [vaultDir, current.expanded])

  const change = useCallback((next: (expanded: Set<string>) => Set<string>) => {
    setTracked((s) => ({ ...s, expanded: next(s.expanded) }))
  }, [])

  const toggle = useCallback(
    (dir: string) =>
      change((expanded) => {
        const next = new Set(expanded)
        if (next.has(dir)) next.delete(dir)
        else next.add(dir)
        return next
      }),
    [change]
  )
  const expand = useCallback(
    (dir: string) => change((expanded) => withAncestors(expanded, `${dir}/_`)),
    [change]
  )
  const collapseAll = useCallback(() => change(() => new Set()), [change])

  return { expanded: current.expanded, toggle, expand, collapseAll }
}
