import { describe, expect, it } from 'vitest'
import { done, keptAsideName, lines, zeroSplit } from './sync-text'

describe('lines', () => {
  it('trims and drops empty lines', () => {
    expect(lines('a\n\n  b  \n')).toEqual(['a', 'b'])
    expect(lines('')).toEqual([])
  })
})

describe('zeroSplit', () => {
  it('splits NUL-separated output', () => {
    expect(zeroSplit('a\0b\0')).toEqual(['a', 'b'])
    expect(zeroSplit('')).toEqual([])
  })
})

describe('done', () => {
  it('builds an ok outcome with skipped defaulting to null', () => {
    expect(done(2, ['a.md'], null, null, 'merge')).toEqual({
      ok: true,
      received: 2,
      conflicts: ['a.md'],
      skipped: null,
      held: null,
      via: 'merge'
    })
    expect(done(0, [], 'app/x', 'busy', null).skipped).toBe('busy')
  })
})

describe('keptAsideName', () => {
  it('names the unpicked side with a date suffix', () => {
    const name = keptAsideName('wiki/INDEX.md', 'team')
    expect(name).toMatch(/^wiki\/INDEX-충돌-내것-\d{4}-\d{2}-\d{2}\.md$/)
    expect(keptAsideName('wiki/INDEX.md', 'mine')).toContain('-충돌-팀것-')
  })

  it('keeps extension-less paths extension-less and skips taken names', () => {
    expect(keptAsideName('note', 'team')).toMatch(/^note-충돌-내것-\d{4}-\d{2}-\d{2}$/)
    const taken = new Set<string>()
    const first = keptAsideName('a.md', 'team', (n) => taken.has(n))
    taken.add(first)
    const second = keptAsideName('a.md', 'team', (n) => taken.has(n))
    expect(second).toMatch(/-2\.md$/)
    expect(second).not.toBe(first)
  })
})
