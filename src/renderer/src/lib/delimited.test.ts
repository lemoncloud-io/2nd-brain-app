// csv·tsv 표 — 따옴표 안의 구분자·줄바꿈·이중 따옴표를 칸 하나로 읽는다(RFC 4180).
import { describe, expect, it } from 'vitest'
import { parseDelimited } from './delimited'

describe('parseDelimited', () => {
  it('쉼표로 칸을, 줄바꿈으로 줄을 나눈다', () => {
    expect(parseDelimited('a,b\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('CRLF 도 줄바꿈이고, 끝 줄바꿈이 없어도 마지막 줄을 읽는다', () => {
    expect(parseDelimited('a,b\r\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('따옴표 안의 쉼표·줄바꿈·"" 는 칸의 글자다', () => {
    expect(parseDelimited('name,note\n"Kim, J","line1\nline2 ""q"""\n', ',')).toEqual([
      ['name', 'note'],
      ['Kim, J', 'line1\nline2 "q"']
    ])
  })

  it('빈 칸을 지키고, tsv 는 탭으로 나눈다', () => {
    expect(parseDelimited('a,,c', ',')).toEqual([['a', '', 'c']])
    expect(parseDelimited('a\tb,c\n', '\t')).toEqual([['a', 'b,c']])
  })

  it('빈 글은 줄이 없다', () => {
    expect(parseDelimited('', ',')).toEqual([])
  })
})
