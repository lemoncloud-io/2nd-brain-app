import { describe, expect, it } from 'vitest'
import {
  isDirEntry,
  isIgnoreFile,
  parseStatus,
  pushOnce,
  sameSig,
  sha256,
  slugOf,
  untrackedCode
} from './note-run-pure'

describe('parseStatus', () => {
  it('parses -z porcelain entries into path->code', () => {
    const map = parseStatus('?? new.md\0M  edited.md\0!! ignored/log.md\0')
    expect(map.get('new.md')).toBe('??')
    expect(map.get('edited.md')).toBe('M ')
    expect(map.get('ignored/log.md')).toBe('!!')
    expect(map.size).toBe(3)
  })

  it('ignores empty and short fragments', () => {
    expect(parseStatus('').size).toBe(0)
    expect(parseStatus('\0\0').size).toBe(0)
  })
})

describe('slugOf', () => {
  it('uses the file name without .md', () => {
    expect(slugOf(['private/2026-10-08.md'])).toBe('2026-10-08')
  })

  it('counts the rest for multiple files', () => {
    expect(slugOf(['a.md', 'b.md', 'c.md'])).toBe('a 외 2')
  })

  it('falls back to note for an empty list and keeps non-md names', () => {
    expect(slugOf([])).toBe('note')
    expect(slugOf(['img.png'])).toBe('img.png')
  })
})

describe('pushOnce', () => {
  it('appends only once', () => {
    const lines: string[] = ['a']
    pushOnce(lines, 'a')
    pushOnce(lines, 'b')
    expect(lines).toEqual(['a', 'b'])
  })
})

describe('sameSig', () => {
  it('treats two missing files as the same', () => {
    expect(sameSig(null, null)).toBe(true)
    expect(sameSig({ size: 1, mtimeMs: 2 }, null)).toBe(false)
    expect(sameSig({ size: 1, mtimeMs: 2 }, { size: 1, mtimeMs: 2 })).toBe(true)
    expect(sameSig({ size: 1, mtimeMs: 2 }, { size: 9, mtimeMs: 2 })).toBe(false)
  })
})

describe('status predicates', () => {
  it('classifies untracked codes, dir entries and ignore files', () => {
    expect(untrackedCode('??')).toBe(true)
    expect(untrackedCode('!!')).toBe(true)
    expect(untrackedCode('M ')).toBe(false)
    expect(isDirEntry('nested-repo/')).toBe(true)
    expect(isDirEntry('note.md')).toBe(false)
    expect(isIgnoreFile('.gitignore')).toBe(true)
    expect(isIgnoreFile('sub/.gitignore')).toBe(true)
    expect(isIgnoreFile('note.md')).toBe(false)
  })
})

describe('sha256', () => {
  it('hashes a known vector', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
