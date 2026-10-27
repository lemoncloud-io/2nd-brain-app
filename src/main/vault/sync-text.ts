// 팀 동기화의 순수 함수 — git 출력 자르기·결과 짓기·충돌 보관 이름.
import { splitLines } from '../../shared/line-diff'
import type { SyncOutcome } from './sync-service'

/** 원격에 그 브랜치가 없다는 git 의 말 */
export const NO_REMOTE_REF = /couldn't find remote ref/i

export const lines = (text: string): string[] =>
  splitLines(text)
    .map((line) => line.trim())
    .filter((line) => line !== '')

export const zeroSplit = (text: string): string[] => text.split('\0').filter((line) => line !== '')

export type Done = Extract<SyncOutcome, { ok: true }>

export const done = (
  received: number,
  conflicts: string[],
  held: string | null,
  skipped: Done['skipped'] = null,
  via: Done['via']
): Done => ({ ok: true, received, conflicts, skipped, held, via })

/** 동기 git 이 던진 오류의 stderr */
export const stderrOf = (error: unknown): string =>
  String((error as { stderr?: unknown }).stderr ?? '')

export type ConflictPick = 'team' | 'mine'

/**
 * 고르지 않은 쪽을 남겨 둘 이름 — `wiki/INDEX.md` + 내것 → `wiki/INDEX-충돌-내것-2026-09-16.md`.
 * 날짜는 이 컴퓨터의 날짜다(UTC 로 자르면 오전에는 어제 날짜가 붙는다).
 * 같은 날 두 번 고르면 뒤엣것이 앞엣것을 덮으므로 `-2`·`-3` 을 붙여 비켜 간다.
 */
export const keptAsideName = (
  path: string,
  pick: ConflictPick,
  taken: (name: string) => boolean = () => false
): string => {
  const date = new Date().toLocaleDateString('sv-SE')
  // ui-hangul-ignore: 충돌 파일 이름 — 디스크에 남는 이름(D8)
  const side = pick === 'team' ? '내것' : '팀것'
  const dot = path.lastIndexOf('.')
  const stem = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path
  const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : ''
  // ui-hangul-ignore: 충돌 파일 이름(D8)
  const base = `${stem}-충돌-${side}-${date}`
  if (!taken(`${base}${ext}`)) return `${base}${ext}`
  for (let n = 2; ; n += 1) {
    if (!taken(`${base}-${n}${ext}`)) return `${base}-${n}${ext}`
  }
}
