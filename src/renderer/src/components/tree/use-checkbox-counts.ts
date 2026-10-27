// 보이는 md 행의 체크박스 수 — 펼친 폴더 단위로 한 번 묻고 캐시한다(행마다 IPC 를 부르지 않는다).
// 판정 규칙과 캐시는 lib/checkbox-counts.ts, 세는 일은 main 의 WikiService.checkboxCounts 가 한다.
import { useEffect, useRef, useState } from 'react'
import { CHECKBOX_BATCH, type CheckboxCount } from '../../../../shared/wiki/checkbox'
import { countOf, rememberCounts, unreadRels, type CountCache } from '../../lib/checkbox-counts'
import type { TreeRow } from '../../lib/tree-model'

export type CountLookup = (rel: string, mtimeMs: number) => CheckboxCount | null

export const useCheckboxCounts = (rows: TreeRow[]): CountLookup => {
  const cache = useRef<CountCache>(new Map())
  // 캐시는 ref 에 있다 — 새 수가 들어왔다고 알리려면 다시 그릴 이유가 따로 있어야 한다
  const [, setVersion] = useState(0)

  useEffect(() => {
    const unread = unreadRels(rows, cache.current)
    if (unread.length === 0) return
    let live = true
    // main 이 한 번에 세는 수에는 상한이 있다 — 그만큼씩 나눠 묻는다. 통째로 보내면 잘린 나머지가
    // "체크박스 없음" 으로 캐시에 굳어 그 파일이 바뀔 때까지 고리가 안 뜬다
    const ask = async (): Promise<void> => {
      for (let at = 0; at < unread.length; at += CHECKBOX_BATCH) {
        const batch = unread.slice(at, at + CHECKBOX_BATCH)
        const counts = await window.api.checkboxCounts(batch)
        if (!live) return
        rememberCounts(cache.current, rows, batch, counts)
        setVersion((was) => was + 1)
      }
    }
    // 수를 못 세면 고리만 없다 — 트리는 그대로 쓴다
    ask().catch(console.error)
    return () => {
      live = false
    }
  }, [rows])

  return (rel, mtimeMs) => countOf(cache.current, rel, mtimeMs)
}
