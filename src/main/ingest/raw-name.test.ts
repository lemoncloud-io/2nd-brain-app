import { describe, expect, it } from 'vitest'
import { normalizeRawName } from './raw-name'

const fresh = (): Set<string> => new Set()

describe('normalizeRawName', () => {
  it('smart punctuation 을 ASCII 로 — 곧은 큰따옴표는 만들지 않는다', () => {
    expect(normalizeRawName('it’s “quoted” — a…b.md', fresh())).toBe("it's 'quoted' - a...b.md")
  })

  it('금지 문자·제어문자를 지운다', () => {
    expect(normalizeRawName('a<b>:c"d/e\\f|g?h*i\x01j.md', fresh())).toBe(
      'abcdefg hij'.replace(' ', '') + '.md'
    )
  })

  it('emoji 를 지우고 공백을 접는다', () => {
    expect(normalizeRawName('🚀  릴리스  노트  .md', fresh())).toBe('릴리스 노트.md')
  })

  it('끝의 점·공백을 떼고, 빈 이름은 note 가 된다', () => {
    expect(normalizeRawName('name...   .md', fresh())).toBe('name.md')
    expect(normalizeRawName('🚀.md', fresh())).toBe('note.md')
  })

  it('Windows 예약어는 -note 를 붙인다(대소문자 무시)', () => {
    expect(normalizeRawName('con.md', fresh())).toBe('con-note.md')
    expect(normalizeRawName('COM1.md', fresh())).toBe('COM1-note.md')
  })

  it('120바이트 초과는 단어 경계에서 자른다', () => {
    const long = `${'가'.repeat(50)} ${'나'.repeat(50)}.md`
    const got = normalizeRawName(long, fresh())
    expect(Buffer.byteLength(got, 'utf8')).toBeLessThanOrEqual(120)
    expect(got.endsWith('.md')).toBe(true)
  })

  it('동명 충돌은 -1·-2 를 붙인다', () => {
    const taken = new Set(['note.md'])
    expect(normalizeRawName('note.md', taken)).toBe('note-1.md')
    taken.add('note-1.md')
    expect(normalizeRawName('note.md', taken)).toBe('note-2.md')
  })

  it('한글은 NFC 로 저장한다', () => {
    expect(normalizeRawName(`${'가'.normalize('NFD')}.md`, fresh())).toBe('가.md')
  })
})
