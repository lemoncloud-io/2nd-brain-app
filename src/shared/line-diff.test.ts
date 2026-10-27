import { describe, expect, it } from 'vitest'
import { lineHunks, revertHunk } from './line-diff'

describe('lineHunks — test: line-diff.ts', () => {
  it('같으면 고친 곳이 없다', () => {
    expect(lineHunks('a\nb\n', 'a\nb\n')).toEqual([])
  })

  it('떨어진 두 곳은 두 덩어리 — 바꾼 줄은 지운 줄과 더한 줄을 함께 든다', () => {
    const before = 'a\nb\nc\nd\ne\n'
    const after = 'a\nB\nc\nd\ne\nf\n'
    expect(lineHunks(before, after)).toEqual([
      { start: 1, oldStart: 1, removed: ['b'], added: ['B'] },
      { start: 5, oldStart: 5, removed: [], added: ['f'] }
    ])
  })

  it('지우기만 한 곳은 더한 줄이 없다', () => {
    expect(lineHunks('a\nb\nc', 'a\nc')).toEqual([
      { start: 1, oldStart: 1, removed: ['b'], added: [] }
    ])
  })

  it('새 파일은 한 덩어리', () => {
    expect(lineHunks('', '# 제목\n본문\n')).toEqual([
      { start: 0, oldStart: 0, removed: [], added: ['# 제목', '본문'] }
    ])
    expect(revertHunk('# 제목\n본문\n', lineHunks('', '# 제목\n본문\n')[0]!)).toBe('')
  })

  it('한 곳을 되돌리면 나머지는 그대로다', () => {
    const before = '1\n2\n3\n4\n5\n6\n'
    const after = '1\n둘\n3\n4\n다섯\n6\n'
    const [first, second] = lineHunks(before, after)
    const kept = revertHunk(after, second!)
    expect(kept).toBe('1\n둘\n3\n4\n5\n6\n')
    expect(revertHunk(kept, lineHunks(before, kept)[0]!)).toBe(before)
    expect(revertHunk(after, first!)).toBe('1\n2\n3\n4\n다섯\n6\n')
  })

  it('모든 고친 곳을 되돌리면 옛 글이다', () => {
    const before = 'x\ny\nz'
    let text = 'x\nY\nz\nw'
    for (let hunks = lineHunks(before, text); hunks.length > 0; hunks = lineHunks(before, text)) {
      text = revertHunk(text, hunks[hunks.length - 1]!)
    }
    expect(text).toBe(before)
  })
})

describe('lineHunks memory guard', () => {
  it('가운데 표가 상한을 넘기면 한 덩어리로 보고 되돌리면 옛 글이다', () => {
    const block = (prefix: string, n: number): string[] =>
      Array.from({ length: n }, (_, i) => `${prefix}-${i}`)
    // 앞뒤가 통째로 다르고 가운데 100줄만 같다 — 가운데 표 3100x3100 이 상한을 넘는다
    const common = block('same', 100)
    const before = [...block('a', 1500), ...common, ...block('c', 1500)].join('\n')
    const after = [...block('b', 1500), ...common, ...block('d', 1500)].join('\n')
    const hunks = lineHunks(before, after)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]!.removed).toHaveLength(3100)
    expect(hunks[0]!.added).toHaveLength(3100)
    expect(revertHunk(after, hunks[0]!)).toBe(before)
  })
})
