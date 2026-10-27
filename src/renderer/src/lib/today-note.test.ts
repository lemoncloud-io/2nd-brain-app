import { describe, expect, it } from 'vitest'
import { dateKey, todayNote, type NoteFile } from './today-note'

const file = (rel: string, mtimeMs = 0): NoteFile => ({ rel, mtimeMs })

describe('todayNote', () => {
  it('private/ 의 오늘 날짜로 시작하는 md 가 오늘 노트다', () => {
    const found = todayNote(
      [file('private/2026-09-18.md'), file('wiki/INDEX.md'), file('private/메모.md')],
      '2026-09-18'
    )
    expect(found.today).toBe('private/2026-09-18.md')
  })

  // 직원마다 뒤에 붙이는 말이 다르다 — 날짜로 시작하기만 하면 오늘 노트다
  it('날짜 뒤에 제목이 붙어도 오늘 노트다', () => {
    expect(todayNote([file('private/2026-09-18 회고.md')], '2026-09-18').today).toBe(
      'private/2026-09-18 회고.md'
    )
  })

  it('여럿이면 가장 최근에 고친 것', () => {
    const found = todayNote(
      [
        file('private/2026-09-18-아침.md', 100),
        file('private/2026-09-18-저녁.md', 300),
        file('private/2026-09-18.md', 200)
      ],
      '2026-09-18'
    )
    expect(found.today).toBe('private/2026-09-18-저녁.md')
  })

  it('private/ 밖이나 md 가 아닌 파일은 세지 않는다', () => {
    const found = todayNote(
      [
        file('outputs/2026-09-18-계획.md'),
        file('private/2026-09-18.txt'),
        file('privateer/2026-09-18.md')
      ],
      '2026-09-18'
    )
    expect(found).toEqual({ today: null, previous: null })
  })

  // 폴더로 나눠 두는 사람도 있다 — private/ 아래면 몇 겹이든 노트다
  it('private/ 아래 폴더 안의 노트도 찾는다', () => {
    expect(todayNote([file('private/2026/2026-09-18.md')], '2026-09-18').today).toBe(
      'private/2026/2026-09-18.md'
    )
  })

  it('이름 가운데 날짜가 있는 파일은 아니다 — 이름이 날짜로 시작해야 한다', () => {
    expect(todayNote([file('private/회고 2026-09-18.md')], '2026-09-18').today).toBeNull()
  })
})

describe('어제 노트', () => {
  it('오늘보다 앞선 날짜 중 가장 가까운 것 — 주말을 건너뛴 월요일도 금요일을 찾는다', () => {
    const found = todayNote(
      [
        file('private/2026-09-18.md'),
        file('private/2026-09-11.md'),
        file('private/2026-09-14.md'),
        file('private/2026-09-20.md')
      ],
      '2026-09-18'
    )
    expect(found.previous).toBe('private/2026-09-14.md')
  })

  it('오늘 노트가 없어도 어제 노트는 찾는다', () => {
    const found = todayNote([file('private/2026-09-17.md')], '2026-09-18')
    expect(found).toEqual({ today: null, previous: 'private/2026-09-17.md' })
  })

  it('같은 날짜가 여럿이면 어제 노트도 가장 최근에 고친 것', () => {
    const found = todayNote(
      [file('private/2026-09-17-아침.md', 100), file('private/2026-09-17-저녁.md', 300)],
      '2026-09-18'
    )
    expect(found.previous).toBe('private/2026-09-17-저녁.md')
  })

  it('앞선 날짜가 없으면 없다', () => {
    expect(todayNote([file('private/2026-09-19.md')], '2026-09-18').previous).toBeNull()
  })
})

describe('dateKey', () => {
  // 볼트의 노트 이름은 이 컴퓨터의 달력 날짜다 — UTC 로 재면 밤에 하루가 어긋난다
  it('그 자리의 달력 날짜를 쓴다', () => {
    expect(dateKey(new Date(2026, 8, 18, 23, 30))).toBe('2026-09-18')
    expect(dateKey(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02')
  })
})
