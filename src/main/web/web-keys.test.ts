import { describe, expect, it } from 'vitest'
import { webKeyOf } from './web-keys'

const key = (
  code: string,
  mods: Partial<{ meta: boolean; control: boolean; alt: boolean; shift: boolean }> = {}
): Parameters<typeof webKeyOf>[0] => ({
  type: 'keyDown',
  code,
  meta: false,
  control: false,
  alt: false,
  shift: false,
  isAutoRepeat: false,
  ...mods
})

describe('webKeyOf — 웹 view 초점에서 앱으로 넘길 키', () => {
  it('⌘W·⌘K·⌥⌘T 는 앱으로 넘기고 초점도 앱으로 옮긴다', () => {
    expect(webKeyOf(key('KeyW', { meta: true }), 'darwin')).toEqual({
      code: 'KeyW',
      alt: false,
      focusApp: true
    })
    expect(webKeyOf(key('KeyK', { meta: true }), 'darwin')?.focusApp).toBe(true)
    expect(webKeyOf(key('KeyT', { meta: true, alt: true }), 'darwin')).toEqual({
      code: 'KeyT',
      alt: true,
      focusApp: true
    })
  })

  it('뒤로·앞으로·다시 불러오기는 넘기되 초점은 페이지에 둔다', () => {
    expect(webKeyOf(key('BracketLeft', { meta: true }), 'darwin')?.focusApp).toBe(false)
    expect(webKeyOf(key('KeyR', { meta: true }), 'darwin')?.focusApp).toBe(false)
    // ⌥⌘[ 는 왼쪽 탭 — 탭을 옮기면 앱이 받는다
    expect(webKeyOf(key('BracketLeft', { meta: true, alt: true }), 'darwin')?.focusApp).toBe(true)
  })

  it('복사·붙여넣기·전체 선택·Shift 조합·자동 반복은 페이지 몫이다', () => {
    for (const code of ['KeyC', 'KeyV', 'KeyX', 'KeyA', 'KeyZ', 'KeyF']) {
      expect(webKeyOf(key(code, { meta: true }), 'darwin')).toBeNull()
    }
    expect(webKeyOf(key('KeyT', { meta: true, shift: true }), 'darwin')).toBeNull()
    expect(webKeyOf({ ...key('KeyW', { meta: true }), isAutoRepeat: true }, 'darwin')).toBeNull()
    expect(webKeyOf({ ...key('KeyW', { meta: true }), type: 'keyUp' }, 'darwin')).toBeNull()
    expect(webKeyOf(key('KeyK', { meta: true, alt: true }), 'darwin')).toBeNull()
  })

  it('Mod 는 macOS ⌘, 그 밖은 Ctrl', () => {
    expect(webKeyOf(key('KeyW', { control: true }), 'darwin')).toBeNull()
    expect(webKeyOf(key('KeyW', { control: true }), 'win32')?.code).toBe('KeyW')
    expect(webKeyOf(key('KeyW', { meta: true }), 'win32')).toBeNull()
  })
})
