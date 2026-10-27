import { describe, it, expect } from 'vitest'
import { prettyJson } from './pretty-json'

describe('prettyJson', () => {
  it('들여쓰기를 다시 매긴다', () => {
    expect(prettyJson('{"a":1,"b":[2,3]}')).toEqual({
      text: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
      broken: false
    })
  })

  it('깨진 json 은 원문 그대로 두고 그 사실을 알린다', () => {
    expect(prettyJson('{이건 json 이 아니다')).toEqual({
      text: '{이건 json 이 아니다',
      broken: true
    })
  })

  it('빈 파일도 죽지 않는다', () => {
    expect(prettyJson('')).toEqual({ text: '', broken: true })
  })

  it('큰 파일은 다시 들여쓰지 않는다 — 원문 그대로', () => {
    const big = `{"a":"${'x'.repeat(2 * 1024 * 1024)}"}`
    expect(prettyJson(big)).toEqual({ text: big, broken: false, tooBig: true })
  })
})
