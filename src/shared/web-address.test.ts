import { describe, expect, it } from 'vitest'
import { normalizeWebAddress, isWebUrl } from './web-address'

describe('normalizeWebAddress — 주소칸 판정', () => {
  it('http(s) 주소는 그대로 받는다', () => {
    expect(normalizeWebAddress('https://example.com/a?b=1')).toEqual({
      ok: true,
      url: 'https://example.com/a?b=1'
    })
    expect(normalizeWebAddress('  http://example.com  ')).toEqual({
      ok: true,
      url: 'http://example.com/'
    })
  })

  it('스킴 없는 도메인은 https 를 붙인다', () => {
    expect(normalizeWebAddress('example.com/path')).toEqual({
      ok: true,
      url: 'https://example.com/path'
    })
  })

  it('localhost·IP 는 http 를 붙인다 — 사내·내 PC 서버는 보통 인증서가 없다', () => {
    expect(normalizeWebAddress('localhost:3000')).toEqual({
      ok: true,
      url: 'http://localhost:3000/'
    })
    expect(normalizeWebAddress('127.0.0.1:8080/x')).toEqual({
      ok: true,
      url: 'http://127.0.0.1:8080/x'
    })
  })

  it('빈 입력', () => {
    expect(normalizeWebAddress('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('검색어처럼 보이는 말은 주소가 아니다', () => {
    expect(normalizeWebAddress('오늘 날씨')).toEqual({ ok: false, reason: 'not-address' })
    expect(normalizeWebAddress('hello')).toEqual({ ok: false, reason: 'not-address' })
  })

  it('http(s) 밖 스킴은 막는다', () => {
    for (const input of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'vault://local/a.md',
      'data:text/html,hi',
      'mailto:a@b.c',
      'about:blank'
    ]) {
      expect(normalizeWebAddress(input)).toEqual({ ok: false, reason: 'scheme' })
    }
  })
})

describe('isWebUrl', () => {
  it('http(s) 만 참', () => {
    expect(isWebUrl('https://a.b')).toBe(true)
    expect(isWebUrl('http://a.b')).toBe(true)
    expect(isWebUrl('file:///x')).toBe(false)
    expect(isWebUrl('not a url')).toBe(false)
  })
})
