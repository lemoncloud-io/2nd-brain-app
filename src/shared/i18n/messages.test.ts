import { describe, expect, it } from 'vitest'
import { messages } from './index'

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/

/** 사전의 잎(문자열·함수)을 경로와 함께 펼친다 */
const leaves = (node: unknown, path: string[] = []): [string, unknown][] =>
  typeof node === 'object' && node !== null
    ? Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]))
    : [[path.join('.'), node]]

/** 함수 문구는 대표 인자로 불러 결과를 본다 — 숫자를 받는 것과 문자열을 받는 것이 있다 */
const render = (value: unknown): string => {
  if (typeof value !== 'function') return String(value)
  const fn = value as (...args: unknown[]) => unknown
  const args = (sample: unknown): unknown[] => Array.from({ length: fn.length }, () => sample)
  try {
    return String(fn(...args(2)))
  } catch {
    return String(fn(...args('x')))
  }
}

describe('messages', () => {
  it('영어 사전에는 한글이 없다', () => {
    const korean = leaves(messages('en')).filter(([, value]) => HANGUL.test(render(value)))
    expect(korean.map(([path]) => path)).toEqual([])
  })

  it('두 사전의 키가 같다', () => {
    const keys = (lang: 'ko' | 'en'): string[] => leaves(messages(lang)).map(([path]) => path)
    expect(keys('en')).toEqual(keys('ko'))
  })

  it('기본 한국어 사전은 지금 화면 문구 그대로다', () => {
    expect(messages('ko').appearance.title).toBe('화면')
    expect(messages('en').appearance.title).toBe('Appearance')
  })
})
