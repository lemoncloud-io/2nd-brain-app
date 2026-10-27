import { describe, expect, it } from 'vitest'
import type { DocVersion } from '../../../shared/ipc-contract'
import { versionWho, versionWhen } from './doc-version'

const at = (kind: DocVersion['kind'], author = '2nd-brain'): DocVersion => ({
  rev: 'r',
  kind,
  author,
  date: '2026-10-02T15:04:00+09:00'
})

describe('versionWho', () => {
  it('누가 고쳤는지를 화면 말로 — 다른 사람은 이름을 붙이고, 누군지 모르면 이름 없이', () => {
    expect(versionWho(at('ai'))).toBe('AI가 씀')
    expect(versionWho(at('me', 'alice'))).toBe('내가 고침')
    expect(versionWho(at('person', 'bob'))).toBe('bob 고침')
    expect(versionWho(at('app'))).toBe('고침')
  })
})

describe('versionWhen', () => {
  it('날짜와 시각을 같이 보인다', () => {
    const text = versionWhen(at('me'))
    expect(text).toContain('10월')
    expect(text).toMatch(/\d{1,2}:\d{2}/)
  })
})
