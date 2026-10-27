import { describe, expect, it } from 'vitest'
import { foldsIn, isChanged, marksFor, nothingMarked } from './doc-marks'

const body = ['# 오늘', '', '- 하나', '- 둘', '', '## 마감', '', '- 정리'].join('\n')

describe('marksFor', () => {
  it('원문 줄 번호를 리더 본문 줄로 당긴다', () => {
    const marks = marksFor(body, { added: [{ from: 8, to: 9 }], removed: [] }, 5)
    expect(marks.added).toEqual([{ from: 3, to: 4 }])
    expect(isChanged(marks, 3, 3)).toBe(true)
    expect(isChanged(marks, 6, 6)).toBe(false)
  })

  it('떼어 낸 앞부분에서만 바뀐 곳은 그리지 않고 세어 둔다 — "바뀐 곳이 없다" 로 뭉치지 않게', () => {
    const marks = marksFor(
      body,
      { added: [{ from: 2, to: 3 }], removed: [{ after: 1, text: 'type: note' }] },
      5
    )
    expect(marks.added).toEqual([])
    expect(marks.folds).toEqual([])
    expect(marks.outside).toBe(2)
    expect(nothingMarked(marks)).toBe(true)
  })

  it('지운 글을 빈 줄 건너 다음 문단 앞에 붙인다', () => {
    const marks = marksFor(body, { added: [], removed: [{ after: 4, text: '- 지운 줄' }] }, 0)
    expect(marks.folds).toEqual([{ anchor: 6, where: 'before', text: '- 지운 줄' }])
    expect(foldsIn(marks, 6, 6, 'before')).toHaveLength(1)
    expect(foldsIn(marks, 6, 6, 'after')).toHaveLength(0)
  })

  it('문서 끝에서 지운 글은 마지막 문단 뒤에 붙인다', () => {
    const marks = marksFor(body, { added: [], removed: [{ after: 9, text: '- 지운 줄' }] }, 0)
    expect(marks.folds).toEqual([{ anchor: 8, where: 'after', text: '- 지운 줄' }])
  })
})
