import { describe, expect, it } from 'vitest'
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  RECENT_LIMIT,
  pushEntry,
  stepHistory,
  touchRecent,
  type HistoryEntry
} from './history'

const at = (view: HistoryEntry['view'], page: string | null, scrollTop = 0): HistoryEntry => ({
  view,
  page,
  source: null,
  docMode: 'page',
  scrollTop
})
const always = (): boolean => true

describe('pushEntry', () => {
  it('첫 이동은 출발점과 도착점 두 칸을 만든다', () => {
    const h = pushEntry(EMPTY_HISTORY, at('knowledge', null), at('doc', 'wiki/a.md'))
    expect(h.entries).toEqual([at('knowledge', null), at('doc', 'wiki/a.md')])
    expect(h.cursor).toBe(1)
  })

  it('지금 칸을 실제 뷰로 덮고, 커서 뒤 기록은 버린다', () => {
    let h = pushEntry(EMPTY_HISTORY, at('doc', 'wiki/a.md'), at('doc', 'wiki/b.md'))
    h = pushEntry(h, at('doc', 'wiki/b.md'), at('doc', 'wiki/c.md'))
    const back = stepHistory(h, -1, at('doc', 'wiki/c.md'), always)!
    h = pushEntry(back.history, at('knowledge', 'wiki/b.md', 40), at('doc', 'wiki/d.md'))
    expect(h.entries.map((e) => e.page)).toEqual(['wiki/a.md', 'wiki/b.md', 'wiki/d.md'])
    expect(h.entries[1]).toEqual(at('knowledge', 'wiki/b.md', 40))
    expect(h.cursor).toBe(2)
  })

  it(`${HISTORY_LIMIT}칸을 넘으면 오래된 것부터 버린다`, () => {
    let h = EMPTY_HISTORY
    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) {
      h = pushEntry(h, at('doc', `wiki/${i}.md`), at('doc', `wiki/${i + 1}.md`))
    }
    expect(h.entries).toHaveLength(HISTORY_LIMIT)
    expect(h.cursor).toBe(HISTORY_LIMIT - 1)
    expect(h.entries.at(-1)?.page).toBe(`wiki/${HISTORY_LIMIT + 10}.md`)
  })
})

describe('stepHistory', () => {
  const base = pushEntry(
    pushEntry(EMPTY_HISTORY, at('knowledge', null), at('doc', 'wiki/a.md')),
    at('doc', 'wiki/a.md'),
    at('doc', 'wiki/b.md')
  )

  it('뒤로 가며 지금 칸에 스크롤을 남기고, 앞으로 오면 그 스크롤이다', () => {
    const back = stepHistory(base, -1, at('doc', 'wiki/b.md', 120), always)!
    expect(back.entry.page).toBe('wiki/a.md')
    const forward = stepHistory(back.history, 1, at('doc', 'wiki/a.md'), always)!
    expect(forward.entry).toEqual(at('doc', 'wiki/b.md', 120))
  })

  it('끝에서는 null', () => {
    expect(stepHistory(base, 1, base.entries[2], always)).toBeNull()
    expect(stepHistory(EMPTY_HISTORY, -1, at('doc', null), always)).toBeNull()
  })

  it('지워진 페이지 칸은 빼고 건너뛴다', () => {
    const exists = (e: HistoryEntry): boolean => e.page !== 'wiki/a.md'
    const back = stepHistory(base, -1, base.entries[2], exists)!
    expect(back.entry).toEqual(at('knowledge', null))
    expect(back.history.entries.map((e) => e.page)).toEqual([null, 'wiki/b.md'])
    expect(back.history.cursor).toBe(0)
  })
})

describe('touchRecent', () => {
  it('새로 연 페이지를 맨 앞으로, 중복 없이', () => {
    expect(touchRecent(['wiki/a.md', 'wiki/b.md'], 'wiki/b.md')).toEqual(['wiki/b.md', 'wiki/a.md'])
  })

  it(`${RECENT_LIMIT}개까지만`, () => {
    const many = Array.from({ length: RECENT_LIMIT }, (_, i) => `wiki/${i}.md`)
    const next = touchRecent(many, 'wiki/new.md')
    expect(next).toHaveLength(RECENT_LIMIT)
    expect(next[0]).toBe('wiki/new.md')
  })
})
