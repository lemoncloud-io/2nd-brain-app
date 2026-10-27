import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listBookmarks, toggleBookmark } from './bookmarks'

const vault = (json?: unknown): string => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-'))
  if (json !== undefined) {
    mkdirSync(join(dir, '.obsidian'))
    writeFileSync(join(dir, '.obsidian', 'bookmarks.json'), JSON.stringify(json))
  }
  return dir
}

describe('bookmarks', () => {
  it('파일이 없으면 빈 목록이고, 달면 Obsidian 모양으로 만든다', () => {
    const dir = vault()
    expect(listBookmarks(dir)).toEqual([])
    expect(toggleBookmark(dir, 'wiki/a.md', 1)).toEqual({ ok: true, bookmarks: ['wiki/a.md'] })
    expect(JSON.parse(readFileSync(join(dir, '.obsidian', 'bookmarks.json'), 'utf8'))).toEqual({
      items: [{ type: 'file', ctime: 1, path: 'wiki/a.md' }]
    })
  })

  it('다른 항목(검색·그룹)은 남기고, 그룹 안 파일도 읽고 뗀다', () => {
    const dir = vault({
      items: [
        { type: 'search', query: 'x' },
        { type: 'group', title: 'g', items: [{ type: 'file', path: 'wiki/in.md' }] },
        { type: 'file', path: 'wiki/top.md' }
      ]
    })
    expect(listBookmarks(dir)).toEqual(['wiki/in.md', 'wiki/top.md'])
    expect(toggleBookmark(dir, 'wiki/in.md')).toEqual({ ok: true, bookmarks: ['wiki/top.md'] })
    const saved = JSON.parse(readFileSync(join(dir, '.obsidian', 'bookmarks.json'), 'utf8'))
    expect(saved.items[0]).toEqual({ type: 'search', query: 'x' })
    expect(saved.items[1]).toEqual({ type: 'group', title: 'g', items: [] })
  })

  it('깨진 파일은 덮지 않는다', () => {
    const dir = vault()
    mkdirSync(join(dir, '.obsidian'))
    writeFileSync(join(dir, '.obsidian', 'bookmarks.json'), '{ 깨짐')
    expect(toggleBookmark(dir, 'wiki/a.md').ok).toBe(false)
    expect(readFileSync(join(dir, '.obsidian', 'bookmarks.json'), 'utf8')).toBe('{ 깨짐')
  })
})
