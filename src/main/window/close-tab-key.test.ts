import { describe, expect, it } from 'vitest'
import { isCloseTabKey, type CloseTabKeyInput } from './close-tab-key'

const key = (over: Partial<CloseTabKeyInput> = {}): CloseTabKeyInput => ({
  type: 'keyDown',
  code: 'KeyW',
  meta: false,
  control: false,
  alt: false,
  shift: false,
  isAutoRepeat: false,
  ...over
})

describe('isCloseTabKey', () => {
  it('macOS ⌘W를 탭 닫기로 돌린다', () => {
    expect(isCloseTabKey(key({ meta: true }), 'darwin')).toBe(true)
  })

  it('Windows·Linux Ctrl+W를 탭 닫기로 돌린다', () => {
    expect(isCloseTabKey(key({ control: true }), 'win32')).toBe(true)
    expect(isCloseTabKey(key({ control: true }), 'linux')).toBe(true)
  })

  it('떼어 놓은 키는 창 닫기로 둔다 — Alt·Shift·반복·keyup·다른 키', () => {
    expect(isCloseTabKey(key({ meta: true, alt: true }), 'darwin')).toBe(false)
    expect(isCloseTabKey(key({ meta: true, shift: true }), 'darwin')).toBe(false)
    expect(isCloseTabKey(key({ meta: true, isAutoRepeat: true }), 'darwin')).toBe(false)
    expect(isCloseTabKey(key({ meta: true, type: 'keyUp' }), 'darwin')).toBe(false)
    expect(isCloseTabKey(key({ meta: true, code: 'KeyT' }), 'darwin')).toBe(false)
    expect(isCloseTabKey(key({ control: true }), 'darwin')).toBe(false)
    expect(isCloseTabKey(key({ meta: true }), 'win32')).toBe(false)
  })
})
