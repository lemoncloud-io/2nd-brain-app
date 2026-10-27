// 오늘 노트가 어느 파일인가 — ⌘T, 실행 시 첫 화면, 오늘 띠가 이 판정 하나를 쓴다.
//
// 이름 규칙은 여기 한 곳에만 둔다. 직원들이 실제로 쓰는 이름은 아직 다 못 봤다(2026-09-18 확인에서
// `private/<날짜>.md` 하나만 실측) — 규칙이 바뀌면 이 파일만 고친다.
// 채팅이 쓰는 이름은 main 의 `chatSystemPrompt` 가 정한다(`private/<오늘>.md`) — 그 모양이 이 규칙 안에 든다.

/** 트리 한 줄에서 판정에 쓰는 것만 — 파일이면 무엇이든 온다 */
export type NoteFile = { rel: string; mtimeMs: number }

export type TodayNotes = {
  /** 오늘 날짜의 노트 — 없으면 null */
  today: string | null
  /** 오늘보다 앞선 날짜 중 가장 가까운 노트 — 주말·휴가 뒤에도 마지막 근무일을 가리킨다 */
  previous: string | null
}

const DATED = /^(\d{4}-\d{2}-\d{2})/

/** 이 컴퓨터의 달력 날짜 — 노트 이름은 UTC 가 아니라 사용자가 보는 날짜다 */
export const dateKey = (at: Date): string =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`

const dateOf = (rel: string): string | null => {
  // 대소문자를 가리지 않는다 — 맥·윈도의 파일시스템이 `Private/` 를 같은 폴더로 보는데
  // 여기서만 다른 폴더로 읽으면 노트가 통째로 사라진다
  const lower = rel.toLowerCase()
  if (!lower.startsWith('private/') || !lower.endsWith('.md')) return null
  const name = rel.split('/').pop() ?? ''
  return DATED.exec(name)?.[1] ?? null
}

/** 같은 날짜가 여럿이면 가장 최근에 고친 것 — 아침에 만들고 저녁에 고친 노트가 이긴다 */
const newest = (files: NoteFile[]): string | null =>
  files.reduce<NoteFile | null>(
    (best, file) => (best === null || file.mtimeMs > best.mtimeMs ? file : best),
    null
  )?.rel ?? null

export const todayNote = (files: NoteFile[], date: string): TodayNotes => {
  const dated = files.flatMap((file) => {
    const day = dateOf(file.rel)
    return day === null ? [] : [{ ...file, day }]
  })
  const previousDay = dated
    .filter((file) => file.day < date)
    .reduce<string | null>(
      (best, file) => (best === null || file.day > best ? file.day : best),
      null
    )
  return {
    today: newest(dated.filter((file) => file.day === date)),
    previous: previousDay === null ? null : newest(dated.filter((file) => file.day === previousDay))
  }
}
