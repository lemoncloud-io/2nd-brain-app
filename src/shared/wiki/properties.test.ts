import { describe, expect, it } from 'vitest'
import { editableValue, inputFromValue, setProperty, valueFromInput } from './properties'

const edit = (text: string, key: string, value: string | string[] | null): string => {
  const result = setProperty(text, key, value)
  if (!result.ok) throw new Error(result.reason)
  return result.text
}

describe('setProperty', () => {
  it('있는 키를 바꾸고 순서·주석·본문은 그대로 둔다', () => {
    const text = '---\ntype: topic # 종류\nstatus: draft\n---\n\n# 본문\n'
    expect(edit(text, 'status', 'done')).toBe(
      '---\ntype: topic # 종류\nstatus: done\n---\n\n# 본문\n'
    )
  })

  it('없는 키는 끝에 더하고 목록 키는 목록으로 쓴다', () => {
    expect(edit('---\ntype: topic\n---\n본문\n', 'tags', ['ai', '회의'])).toBe(
      '---\ntype: topic\ntags:\n  - ai\n  - 회의\n---\n본문\n'
    )
  })

  it('속성 블록이 없으면 만든다', () => {
    expect(edit('# 제목\n', 'status', 'draft')).toBe('---\nstatus: draft\n---\n# 제목\n')
  })

  it('빈 값은 키를 지우고, 마지막 키를 지우면 블록도 없앤다', () => {
    expect(edit('---\na: 1\nb: 2\n---\n본문', 'a', '')).toBe('---\nb: 2\n---\n본문')
    expect(edit('---\na: 1\n---\n\n본문', 'a', null)).toBe('본문')
  })

  it('CRLF 파일은 CRLF 로 쓴다', () => {
    expect(edit('---\r\na: 1\r\n---\r\n본문', 'b', 'x')).toBe('---\r\na: 1\r\nb: x\r\n---\r\n본문')
  })

  it('못 읽는 속성 블록·잘못된 이름은 거절한다', () => {
    expect(setProperty('---\na: [\n---\n', 'b', 'x').ok).toBe(false)
    expect(setProperty('# x', 'a:b', 'x').ok).toBe(false)
  })

  it('맵이 아닌 속성 블록(목록·스칼라)은 덮어쓰지 않고 거절한다', () => {
    expect(setProperty('---\n- a\n---\n본문', 'b', 'x').ok).toBe(false)
    expect(setProperty('---\n123\n---\n본문', 'b', 'x').ok).toBe(false)
  })
})

describe('칸 ↔ 값', () => {
  it('목록 키는 쉼표로 가르고 # 을 뗀다', () => {
    expect(valueFromInput('tags', '#ai, 회의 ,,')).toEqual(['ai', '회의'])
    expect(valueFromInput('status', ' done ')).toBe('done')
    expect(inputFromValue(['ai', '회의'])).toBe('ai, 회의')
  })

  it('중첩 객체는 칸에서 고치지 않는다', () => {
    expect(editableValue('related', { a: 1 })).toBe(false)
    expect(editableValue('tags', ['a', 1])).toBe(true)
    expect(editableValue('title', 'x')).toBe(true)
  })

  it('쉼표로 나누지 않는 키의 목록은 칸에서 고치지 않는다 — 고치면 한 글로 합쳐진다', () => {
    expect(editableValue('next_action', ['하나', '둘'])).toBe(false)
    expect(editableValue('next_action', '하나')).toBe(true)
  })
})
