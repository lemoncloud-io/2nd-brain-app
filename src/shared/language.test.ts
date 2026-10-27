import { describe, expect, it } from 'vitest'
import { languageArg, languageFromArgv, localeOf, normalizeLanguage } from './language'

describe('language', () => {
  it('부팅 인자에서 고른 언어를 읽고, 없거나 모르는 값이면 한국어다', () => {
    expect(languageFromArgv(['electron', languageArg('en')])).toBe('en')
    expect(languageFromArgv(['electron', languageArg('ko')])).toBe('ko')
    expect(languageFromArgv(['electron'])).toBe('ko')
    expect(languageFromArgv(['electron', '--second-brain-lang=fr'])).toBe('ko')
  })

  it('settings.json·renderer 입력을 믿지 않는다 — 모르는 값은 한국어', () => {
    expect(normalizeLanguage('en')).toBe('en')
    expect(normalizeLanguage('EN')).toBe('ko')
    expect(normalizeLanguage(undefined)).toBe('ko')
  })

  it('날짜·숫자 로캘을 언어에서 고른다', () => {
    expect(localeOf('ko')).toBe('ko-KR')
    expect(localeOf('en')).toBe('en-US')
  })
})
