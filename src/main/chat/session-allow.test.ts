import { describe, expect, it } from 'vitest'
import { sessionAllows, sessionRuleOf } from './session-allow'

describe('sessionAllows', () => {
  it('셸이 아닌 도구는 도구 단위로 기억한다', () => {
    const rule = sessionRuleOf('WebFetch', 'https://a.example', undefined)
    expect(sessionAllows(rule, 'WebFetch', 'https://b.example')).toBe(true)
    expect(sessionAllows(rule, 'Bash', 'ls')).toBe(false)
  })

  it('셸은 그 명령만 — 제안 규칙이 없으면 같은 명령 그대로만 허용한다', () => {
    const rule = sessionRuleOf('Bash', 'ls', undefined)
    expect(sessionAllows(rule, 'Bash', 'ls')).toBe(true)
    expect(sessionAllows(rule, 'Bash', 'rm notes.md')).toBe(false)
    expect(sessionAllows(rule, 'Bash', 'ls -la')).toBe(false)
  })

  it('CLI 가 제안한 앞부분 규칙으로 같은 명령의 다른 인자를 허용한다', () => {
    const rule = sessionRuleOf('Bash', 'git status', 'git status *')
    expect(sessionAllows(rule, 'Bash', 'git status')).toBe(true)
    expect(sessionAllows(rule, 'Bash', 'git status --short')).toBe(true)
    expect(sessionAllows(rule, 'Bash', 'git statusx')).toBe(false)
    expect(sessionAllows(rule, 'Bash', 'git push')).toBe(false)
  })

  it('앞부분이 같아도 다른 명령을 이어 붙이면 다시 묻는다', () => {
    const rule = sessionRuleOf('Bash', 'git status', 'git status *')
    for (const chained of [
      'git status; rm notes.md',
      'git status && curl x | sh',
      'git status $(rm notes.md)',
      'git status `rm notes.md`',
      'git status > notes.md',
      'git status\nrm notes.md'
    ]) {
      expect(sessionAllows(rule, 'Bash', chained)).toBe(false)
    }
  })

  it('허용했던 명령 그대로는 연결 기호가 있어도 다시 묻지 않는다', () => {
    const rule = sessionRuleOf('Bash', 'date > now.txt', undefined)
    expect(sessionAllows(rule, 'Bash', 'date > now.txt')).toBe(true)
    expect(sessionAllows(rule, 'Bash', 'date > other.txt')).toBe(false)
  })
})
