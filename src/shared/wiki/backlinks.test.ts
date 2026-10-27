import { describe, expect, it } from 'vitest'
import { buildBacklinks, connectionsOf, pageConnections, type BacklinkEntry } from './backlinks'
import { createLinkResolver } from './parse'

const entry = (
  rel: string,
  title: string,
  targets: string[],
  vaultFile = false
): BacklinkEntry => ({
  rel,
  slug: rel.replace(/^wiki\//, '').replace(/\.md$/, ''),
  title,
  links: targets.map((target) => ({ target, vaultFile }))
})

describe('buildBacklinks — test: backlinks.ts', () => {
  it('가리키는 페이지를 제목순으로, 한 페이지는 한 번만', () => {
    const map = buildBacklinks([
      entry('wiki/a.md', '가', ['b', 'b', 'c']),
      entry('wiki/z.md', '나', ['b']),
      entry('wiki/b.md', '다', []),
      entry('wiki/c.md', '라', ['b'])
    ])
    expect(map.get('wiki/b.md')).toEqual([
      { rel: 'wiki/a.md', title: '가' },
      { rel: 'wiki/z.md', title: '나' },
      { rel: 'wiki/c.md', title: '라' }
    ])
    expect(map.get('wiki/c.md')).toEqual([{ rel: 'wiki/a.md', title: '가' }])
  })

  it('자기 링크·끊긴 링크·볼트 파일 링크는 세지 않는다', () => {
    const map = buildBacklinks([
      entry('wiki/a.md', '가', ['a', 'missing']),
      entry('wiki/r.md', '나', ['projects/x/README'], true)
    ])
    expect(map.size).toBe(0)
  })

  it('제목이 같은 두 페이지는 둘 다 남고 rel 로 갈린다', () => {
    const map = buildBacklinks([
      entry('wiki/a/회의.md', '회의', ['b']),
      entry('wiki/c/회의.md', '회의', ['b']),
      entry('wiki/b.md', '다', [])
    ])
    expect(map.get('wiki/b.md')?.map((s) => s.rel)).toEqual(['wiki/a/회의.md', 'wiki/c/회의.md'])
  })

  it('목록에서 빠진 페이지의 링크는 새 맵에 남지 않는다(정본 하나)', () => {
    const before = withA()
    expect(before.get('wiki/b.md')).toHaveLength(1)
    const after = buildBacklinks([entry('wiki/b.md', '다', [])])
    expect(after.get('wiki/b.md')).toBeUndefined()
  })

  function withA(): Map<string, unknown[]> {
    return buildBacklinks([entry('wiki/a.md', '가', ['b']), entry('wiki/b.md', '다', [])])
  }
})

describe('pageConnections — test: backlinks.ts', () => {
  const entries = [
    entry('wiki/a.md', '가', ['b', 'c', 'missing']),
    entry('wiki/b.md', '나', ['a']),
    entry('wiki/c.md', '다', []),
    entry('wiki/d.md', '라', ['a', 'a']),
    entry('wiki/e.md', '마', ['a'], true)
  ]

  it('가리키는 곳과 가리켜 온 곳을 한 번씩, 양쪽이면 both, 제목순', () => {
    expect(pageConnections('wiki/a.md', entries)).toEqual([
      { rel: 'wiki/b.md', title: '나', way: 'both' },
      { rel: 'wiki/c.md', title: '다', way: 'out' },
      { rel: 'wiki/d.md', title: '라', way: 'in' }
    ])
  })

  it('목록에 없는 페이지는 빈 목록 — 없는 링크·볼트 파일 링크·자기 링크는 세지 않는다', () => {
    expect(pageConnections('wiki/zz.md', entries)).toEqual([])
    const self = [entry('wiki/a.md', '가', ['c']), entry('wiki/c.md', '다', ['c', 'nowhere'])]
    expect(pageConnections('wiki/c.md', self)).toEqual([
      { rel: 'wiki/a.md', title: '가', way: 'in' }
    ])
  })
})

describe('connectionsOf — 미리 지은 조회표 재사용', () => {
  const entries = [
    entry('wiki/a.md', '가', ['b', 'c', 'missing']),
    entry('wiki/b.md', '나', ['a']),
    entry('wiki/c.md', '다', [])
  ]
  const refs = entries.map((e) => ({ rel: e.rel, slug: e.slug }))
  const parts = {
    map: buildBacklinks(entries),
    resolve: createLinkResolver(refs),
    titles: new Map(entries.map((e) => [e.rel, e.title] as [string, string]))
  }

  it('pageConnections 와 같은 답을 낸다', () => {
    expect(connectionsOf('wiki/a.md', entries, parts)).toEqual(
      pageConnections('wiki/a.md', entries)
    )
  })

  it('목록에 없는 페이지는 빈 목록', () => {
    expect(connectionsOf('wiki/zz.md', entries, parts)).toEqual([])
  })
})
