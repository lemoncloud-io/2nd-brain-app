import { describe, expect, it } from 'vitest'
import { josa } from './josa'

describe('josa', () => {
  it('받침 있으면 을, 없으면 를', () => {
    expect(josa('회의록', '을/를')).toBe('회의록을')
    expect(josa('노트', '을/를')).toBe('노트를')
  })

  it('따옴표 안의 끝 글자를 본다', () => {
    expect(josa('"회의록"', '을/를')).toBe('"회의록"을')
    expect(josa('"메모"', '이/가')).toBe('"메모"가')
  })

  it('ㄹ 받침 뒤에는 로', () => {
    expect(josa('파일', '으로/로')).toBe('파일로')
    expect(josa('문서함', '으로/로')).toBe('문서함으로')
    expect(josa('노트', '으로/로')).toBe('노트로')
  })

  it('숫자는 읽는 소리로 본다', () => {
    expect(josa('3', '은/는')).toBe('3은')
    expect(josa('2', '은/는')).toBe('2는')
  })

  it('영문은 끝소리를 어림한다', () => {
    expect(josa('README.md', '을/를')).toBe('README.md를')
    expect(josa('plan', '과/와')).toBe('plan과')
    expect(josa('mail', '으로/로')).toBe('mail로')
  })

  it('빈 말에는 받침 없는 조사', () => {
    expect(josa('', '을/를')).toBe('를')
  })
})
