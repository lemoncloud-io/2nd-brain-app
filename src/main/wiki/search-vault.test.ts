import { describe, expect, it } from 'vitest'
import { searchVault } from './search-vault'
import type { SearchablePage } from '../../shared/wiki/search'
import { page } from '../../shared/wiki/test-pages'

const PAGES = [
  page('wiki/graph.md', '그래프 노트', '그래프는 점과 선이다.'),
  page('wiki/km.md', 'Knowledge Management', 'Capture and reuse notes.')
]

describe('searchVault', () => {
  it('문자열이 아닌 질의는 거절한다', async () => {
    expect(await searchVault(() => PAGES, 42, 20)).toEqual({
      error: '검색어를 읽지 못했어요'
    })
  })

  it('빈 질의는 페이지를 읽지도 않고 빈 배열이다', async () => {
    let scanned = false
    const result = await searchVault(
      () => {
        scanned = true
        return PAGES
      },
      '   ',
      20
    )
    expect(result).toEqual([])
    expect(scanned).toBe(false)
  })

  it('키워드 결과를 돌려준다', async () => {
    const result = await searchVault(() => PAGES, '그래프', 20)
    expect(result).toMatchObject([{ rel: 'wiki/graph.md' }])
  })

  it('limit 이 없거나 잘못되면 20', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      page(`wiki/p${i}.md`, `그래프 ${i}`, '그래프')
    )
    const result = await searchVault(() => many, '그래프', 'x')
    expect(Array.isArray(result) && result.length).toBe(20)
  })

  it('mtime이 있는 목록은 캐시 경로로도 같은 결과를 준다', async () => {
    const withMtime = (m: number): (SearchablePage & { mtimeMs: number })[] => [
      { ...page('wiki/graph.md', '그래프 노트', '그래프는 점과 선이다.'), mtimeMs: m },
      { ...page('wiki/km.md', 'Knowledge Management', 'Capture and reuse notes.'), mtimeMs: m }
    ]
    const first = await searchVault(() => withMtime(1), '그래프', 20)
    // 새 배열·같은 mtime — 캐시가 맞아도 결과는 같다
    const second = await searchVault(() => withMtime(1), '그래프', 20)
    expect(second).toEqual(first)
    expect(first).toMatchObject([{ rel: 'wiki/graph.md' }])
  })
})

describe('searchVault — #태그', () => {
  const pages = [
    { rel: 'wiki/a.md', slug: 'a', title: '가', body: '예산 회의 #회의', tags: ['회의'] },
    { rel: 'wiki/b.md', slug: 'b', title: '나', body: '예산 정리', tags: [] },
    { rel: 'wiki/c.md', slug: 'c', title: '다', body: '다른 글', tags: ['회의', 'ai'] }
  ]

  it('태그만 치면 그 태그를 가진 문서 전부를 제목순으로 준다', async () => {
    const hits = await searchVault(() => pages, '#회의', 20)
    expect(Array.isArray(hits) && hits.map((h) => h.rel)).toEqual(['wiki/a.md', 'wiki/c.md'])
    expect(Array.isArray(hits) && hits[0]!.snippet).toBe('예산 회의 #회의')
  })

  it('태그와 글을 같이 치면 태그로 거른 뒤 글로 찾는다', async () => {
    const hits = await searchVault(() => pages, '#회의 예산', 20)
    expect(Array.isArray(hits) && hits.map((h) => h.rel)).toEqual(['wiki/a.md'])
  })

  it('태그만 칠 때도 limit을 지킨다', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      rel: `wiki/t${i}.md`,
      slug: `t${i}`,
      title: `제목 ${i}`,
      body: `본문 #회의`,
      tags: ['회의']
    }))
    const hits = await searchVault(() => many, '#회의', 20)
    expect(Array.isArray(hits) && hits.length).toBe(20)
  })
})
