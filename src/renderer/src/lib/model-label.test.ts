import { describe, expect, it } from 'vitest'
import { shortModel } from './model-label'

describe('shortModel', () => {
  it('머리와 꼬리표를 덜어 낸다', () => {
    expect(shortModel('claude-opus-5')).toBe('opus-5')
    expect(shortModel('claude-opus-5[1m]')).toBe('opus-5')
    expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku-4-5')
  })

  it('모르는 모양은 그대로 둔다 — 없는 규칙으로 잘라 내면 딴 모델처럼 보인다', () => {
    expect(shortModel('gpt-5.1-codex')).toBe('gpt-5.1-codex')
    expect(shortModel('sonnet')).toBe('sonnet')
  })
})
