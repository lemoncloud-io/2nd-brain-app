import { describe, expect, it } from 'vitest'
import { CHECKBOX, countCheckboxes, eachProseLine } from './checkbox'

const lines = (markdown: string): string[] => {
  const out: string[] = []
  eachProseLine(markdown, (text) => out.push(text))
  return out
}

describe('eachProseLine', () => {
  it('``` 안은 건너뛰고 줄 번호는 원문 그대로다', () => {
    const seen: number[] = []
    eachProseLine('a\n```\nb\n```\nc', (_text, line) => seen.push(line))
    expect(seen).toEqual([1, 5])
  })

  it('~~~ 로 연 것은 ~~~ 로 닫는다', () => {
    expect(lines('~~~\nx\n~~~\ny')).toEqual(['y'])
  })

  it('여는 문자와 다른 닫기는 닫히지 않는다', () => {
    expect(lines('```\nx\n~~~\ny\n```\nz')).toEqual(['z'])
  })
})

describe('countCheckboxes', () => {
  it('코드 안 체크박스는 세지 않는다', () => {
    expect(countCheckboxes('```\n- [ ] 코드\n```\n\n- [ ] 진짜\n')).toEqual({
      done: 0,
      total: 1
    })
  })

  it('대소문자 x·X 를 끝난 것으로 센다', () => {
    expect(countCheckboxes('- [x] a\n- [X] b\n- [ ] c\n')).toEqual({ done: 2, total: 3 })
  })

  it('] 뒤에 공백이 없으면 체크박스가 아니다', () => {
    expect(CHECKBOX.test('- [ ]x')).toBe(false)
    expect(countCheckboxes('- [ ]x\n')).toEqual({ done: 0, total: 0 })
  })

  it('번호 목록도 된다', () => {
    expect(countCheckboxes('1. [ ] 첫째\n')).toEqual({ done: 0, total: 1 })
  })

  it('없으면 둘 다 0 이다', () => {
    expect(countCheckboxes('# 제목\n\n그냥 글\n')).toEqual({ done: 0, total: 0 })
  })
})
