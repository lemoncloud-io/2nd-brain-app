import { describe, expect, it } from 'vitest'
import { themeArg, themeFromArgv } from './theme'

describe('themeFromArgv', () => {
  it('부팅 인자 --theme=dark 를 읽는다', () => {
    expect(themeFromArgv(['/app', '--theme=dark'])).toBe('dark')
  })

  it('인자가 없으면 light 기본', () => {
    expect(themeFromArgv(['/app'])).toBe('light')
  })

  it('모르는 값은 light 로 떨어진다', () => {
    expect(themeFromArgv(['/app', '--theme=magenta'])).toBe('light')
  })

  it('themeArg 로 만든 인자를 되돌려 읽는다', () => {
    expect(themeFromArgv([themeArg('dark')])).toBe('dark')
    expect(themeFromArgv([themeArg('light')])).toBe('light')
  })
})
