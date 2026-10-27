import { describe, expect, it } from 'vitest'
import { countOf, rememberCounts, unreadRels, type CountCache } from './checkbox-counts'
import type { TreeRow } from './tree-model'

const row = (rel: string, mtimeMs: number, kind: 'file' | 'dir' = 'file'): TreeRow => ({
  node: {
    rel,
    kind,
    ext: rel.slice(rel.lastIndexOf('.')),
    mtimeMs,
    size: 0,
    name: rel,
    children: []
  },
  depth: 0
})

const ROWS = [
  row('private', 0, 'dir'),
  row('private/plan.md', 10),
  row('private/memo.md', 20),
  row('raw/dump.pdf', 30)
]

describe('unreadRels', () => {
  it('보이는 md 행만 묻는다 — 폴더와 다른 형식은 빼놓는다', () => {
    expect(unreadRels(ROWS, new Map())).toEqual(['private/plan.md', 'private/memo.md'])
  })

  it('이미 센 행은 다시 묻지 않는다 — 체크박스가 없던 행도 마찬가지다', () => {
    const cache: CountCache = new Map([
      ['private/plan.md|10', { done: 1, total: 2 }],
      ['private/memo.md|20', null]
    ])
    expect(unreadRels(ROWS, cache)).toEqual([])
  })

  // 트리는 파일이 바뀌면 새 mtime 을 들고 온다 — 캐시 키가 달라져 다시 센다
  it('파일이 바뀌면 다시 묻는다', () => {
    const cache: CountCache = new Map([['private/plan.md|10', { done: 1, total: 2 }]])
    const changed = [row('private/plan.md', 11)]
    expect(unreadRels(changed, cache)).toEqual(['private/plan.md'])
  })
})

describe('rememberCounts', () => {
  it('돌아오지 않은 파일은 체크박스가 없다고 적는다 — 다음에 다시 묻지 않는다', () => {
    const cache: CountCache = new Map()
    rememberCounts(cache, ROWS, ['private/plan.md', 'private/memo.md'], {
      'private/plan.md': { done: 1, total: 2 }
    })

    expect(countOf(cache, 'private/plan.md', 10)).toEqual({ done: 1, total: 2 })
    expect(countOf(cache, 'private/memo.md', 20)).toBeNull()
    expect(unreadRels(ROWS, cache)).toEqual([])
  })

  it('묻는 사이에 사라진 행은 적지 않는다', () => {
    const cache: CountCache = new Map()
    rememberCounts(cache, ROWS, ['private/지워진.md'], {})
    expect(cache.size).toBe(0)
  })

  it('세지 않은 행의 수는 null 이다', () => {
    expect(countOf(new Map(), 'private/plan.md', 10)).toBeNull()
  })
})
