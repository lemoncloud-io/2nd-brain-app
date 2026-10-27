import { describe, expect, it } from 'vitest'
import { isDevToolsKey, shouldToggleDevTools } from './devtools-key'

const key = (
  over: Partial<Parameters<typeof isDevToolsKey>[0]>
): Parameters<typeof isDevToolsKey>[0] => ({
  type: 'keyDown',
  code: 'KeyI',
  meta: false,
  control: false,
  alt: false,
  shift: false,
  isAutoRepeat: false,
  ...over
})

describe('isDevToolsKey', () => {
  it('macOS 는 ⌥⌘I, 그 밖은 Ctrl+Shift+I', () => {
    expect(isDevToolsKey(key({ meta: true, alt: true }), 'darwin')).toBe(true)
    expect(isDevToolsKey(key({ control: true, shift: true }), 'win32')).toBe(true)
    expect(isDevToolsKey(key({ control: true, shift: true }), 'darwin')).toBe(false)
    expect(isDevToolsKey(key({ meta: true, alt: true }), 'win32')).toBe(false)
  })

  it('다른 글쇠·떼기·누르고 있기는 아니다', () => {
    expect(isDevToolsKey(key({ meta: true, alt: true, code: 'KeyJ' }), 'darwin')).toBe(false)
    expect(isDevToolsKey(key({ meta: true, alt: true, type: 'keyUp' }), 'darwin')).toBe(false)
    expect(isDevToolsKey(key({ meta: true, alt: true, isAutoRepeat: true }), 'darwin')).toBe(false)
    expect(isDevToolsKey(key({ meta: true }), 'darwin')).toBe(false)
  })
})

describe('shouldToggleDevTools', () => {
  it('개발자 모드가 꺼져 있으면 단축키를 받지 않는다 — 배포본은 그대로 막힌다', () => {
    expect(shouldToggleDevTools(false, key({ meta: true, alt: true }), 'darwin')).toBe(false)
    expect(shouldToggleDevTools(false, key({ control: true, shift: true }), 'win32')).toBe(false)
    expect(shouldToggleDevTools(true, key({ meta: true, alt: true }), 'darwin')).toBe(true)
  })
})
