// 오늘 노트 — 파일 트리에서 오늘·어제 노트를 고르고, 그 안의 체크박스를 센다.
// ⌘T·첫 화면은 파일만, 오늘 띠는 수까지 쓴다.
import { useEffect, useMemo, useState } from 'react'
import type { VaultTreeEntry } from '../../../shared/ipc-contract'
import { outlineOf, type Outline } from '../lib/plan-outline'
import { dateKey, todayNote, type NoteFile } from '../lib/today-note'
import { useWorkbench } from '../store/workbench'

export type TodayNotes = { today: NoteFile | null; previous: NoteFile | null }

const NONE: TodayNotes = { today: null, previous: null }

/**
 * 트리에서 오늘·어제 노트를 고른다 — 실행 시 첫 화면, 오늘 띠, ⌘T 가 같은 판정을 쓴다.
 * 트리가 정본이다: 채팅이 노트를 쓰면 watcher 가 트리를 새로 읽고 여기까지 흘러온다.
 * 아직 못 읽었으면 둘 다 null 이다.
 */
export const todayNotesOf = (tree: VaultTreeEntry[] | null): TodayNotes => {
  if (tree === null) return NONE
  const files = tree.filter((entry) => entry.kind === 'file')
  const { today, previous } = todayNote(files, dateKey(new Date()))
  const find = (rel: string | null): NoteFile | null =>
    rel === null ? null : (files.find((file) => file.rel === rel) ?? null)
  return { today: find(today), previous: find(previous) }
}

/**
 * 날짜는 트리가 바뀔 때 다시 잰다. 밤새 띄워 둔 창은 다음 트리 변경까지 어제 노트를 오늘로 부른다 —
 * 자정 타이머는 두지 않았다: 그 창은 어차피 다음 손길(파일 저장·받기)에 트리가 새로 온다.
 * 트리는 보관함의 모든 파일이라 렌더마다 다시 훑지 않는다 — 트리가 바뀔 때만 센다(소비자마다 한 번).
 */
export const useTodayNotes = (): TodayNotes => {
  const tree = useWorkbench((s) => s.tree)
  return useMemo(() => todayNotesOf(tree), [tree])
}

/**
 * 그 노트의 절과 체크박스 수. 파일이 바뀌면(mtime) 다시 읽는다 — 채팅이 고친 직후에도 같은 수를 말한다.
 * 못 읽으면 null 이다: 띠는 수를 못 말할 뿐 사라지지 않는다.
 */
export const useNoteOutline = (file: NoteFile | null): Outline | null => {
  // 어느 파일의 어느 판인지까지 들고 있는다 — 다른 노트의 수를 잠깐이라도 그 자리에 그리지 않는다
  const key = file === null ? null : `${file.rel}|${file.mtimeMs}`
  const rel = file?.rel ?? null
  const [read, setRead] = useState<{ key: string; outline: Outline } | null>(null)
  useEffect(() => {
    if (rel === null || key === null) return
    let live = true
    window.api
      .readWikiPage(rel)
      .then((result) => {
        // 못 읽으면 수를 말하지 않는다 — 띠는 남고 버튼만 빈다
        if (!live || 'error' in result) return
        setRead({ key, outline: outlineOf(result.text) })
      })
      .catch(console.error)
    return () => {
      live = false
    }
  }, [rel, key])
  return read !== null && read.key === key ? read.outline : null
}
