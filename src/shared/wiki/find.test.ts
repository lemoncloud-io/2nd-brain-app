import { describe, expect, it } from 'vitest'
import { findInText } from './find'

describe('findInText — test: find.ts', () => {
  it('대소문자 무시·겹치지 않게·전부', () => {
    expect(findInText('Aa aa AA', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 8 }
    ])
    expect(findInText('aaa', 'aa')).toEqual([{ start: 0, end: 2 }])
  })

  it('빈 질의·일치 없음은 0개', () => {
    expect(findInText('본문', '')).toEqual([])
    expect(findInText('본문', '없다')).toEqual([])
  })

  it('대문자 질의도 소문자 본문을 찾는다 — 이미 소문자인 문서는 낮춤 없이 둘 수 없다', () => {
    expect(findInText('abc def', 'ABC')).toEqual([{ start: 0, end: 3 }])
    expect(findInText('Aa aa AA', 'AA')).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 8 }
    ])
  })

  it('한글 NFD 원문도 NFC 질의로 찾고, 오프셋은 NFC 원문 기준', () => {
    const nfd = '앞 회의록'.normalize('NFD')
    expect(findInText(nfd, '회의')).toEqual([{ start: 2, end: 4 }])
    expect(nfd.normalize('NFC').slice(2, 4)).toBe('회의')
  })

  it('소문자화가 길이를 바꾸는 글자가 있으면 그 글은 대소문자를 구분한다 — 자리가 밀리지 않는다', () => {
    const text = 'İstanbul ab AB'
    const ranges = findInText(text, 'ab')
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual(['ab'])
  })

  it('일치가 폭증해도 앞에서부터 최대 2,000개까지만 — 호출자가 일치마다 mark를 만든다', () => {
    const ranges = findInText('가'.repeat(3000), '가')
    expect(ranges.length).toBe(2000)
    expect(ranges[0]).toEqual({ start: 0, end: 1 })
    expect(ranges[1999]).toEqual({ start: 1999, end: 2000 })
  })
})
