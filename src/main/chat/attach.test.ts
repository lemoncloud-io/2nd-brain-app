import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_MENTIONS, readAttached } from './attach'

describe('readAttached — test: attach.ts', () => {
  let vault: string
  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'attach-'))
    mkdirSync(join(vault, 'wiki'))
    writeFileSync(join(vault, 'wiki', 'a.md'), '# A\n\n본문 A')
    writeFileSync(join(vault, 'wiki', 'b.md'), '# B\n\n본문 B')
    writeFileSync(join(vault, 'wiki', 'pic.png'), 'png')
  })
  afterEach(() => rmSync(vault, { recursive: true, force: true }))

  it('고른 순서대로 — 겹치면 한 번', async () => {
    const got = await readAttached(vault, ['wiki/a.md', 'wiki/b.md', 'wiki/a.md'])
    expect(got.map((d) => d.rel)).toEqual(['wiki/a.md', 'wiki/b.md'])
    expect(got[0]?.text).toContain('본문 A')
    expect(got[0]?.truncated).toBe(false)
  })

  it('보관함 밖·없는 파일·글이 아닌 파일은 붙이지 않는다', async () => {
    const got = await readAttached(vault, [
      '../etc/passwd',
      'wiki/none.md',
      'wiki/pic.png',
      42,
      '.git/config'
    ])
    expect(got).toEqual([])
  })

  it('문서마다·전체 예산을 넘으면 앞부분만 싣고 잘렸다고 적는다', async () => {
    writeFileSync(join(vault, 'wiki', 'long.md'), 'x'.repeat(50))
    const got = await readAttached(vault, ['wiki/long.md', 'wiki/a.md', 'wiki/b.md'], {
      perDoc: 20,
      total: 29
    })
    expect(got.map((d) => [d.rel, d.text.length, d.truncated])).toEqual([
      ['wiki/long.md', 20, true],
      ['wiki/a.md', 9, false]
    ])
  })

  it(`@ 문서는 ${MAX_MENTIONS}개까지`, async () => {
    for (let i = 0; i < MAX_MENTIONS + 3; i += 1)
      writeFileSync(join(vault, 'wiki', `n${i}.md`), 'n')
    const rels = Array.from({ length: MAX_MENTIONS + 3 }, (_, i) => `wiki/n${i}.md`)
    expect(await readAttached(vault, rels)).toHaveLength(MAX_MENTIONS)
  })
})
