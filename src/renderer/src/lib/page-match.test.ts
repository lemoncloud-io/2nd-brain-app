import { describe, expect, it } from 'vitest'
import type { VaultTreeEntry, WikiListEntry } from '../../../shared/ipc-contract'
import { PALETTE_LIMIT, matchPages, paletteEntries } from './page-match'

const page = (rel: string, title: string): WikiListEntry => ({
  rel,
  slug: rel.replace(/^.*\//, '').replace(/\.md$/, ''),
  title,
  frontmatter: null,
  links: [],
  mtimeMs: 0,
  size: 0
})

const pages = [
  page('wiki/topics/graph-theory.md', '그래프 이론'),
  page('wiki/people/euler.md', '오일러와 그래프'),
  page('wiki/topics/network.md', '네트워크'),
  page('wiki/INDEX.md', 'Index')
]

describe('matchPages', () => {
  it('빈 입력은 결과가 없다', () => {
    expect(matchPages(pages, '  ')).toEqual([])
  })

  it('제목 앞 일치 → 제목 안 일치 → 경로 일치 순', () => {
    expect(matchPages(pages, '그래프').map((p) => p.rel)).toEqual([
      'wiki/topics/graph-theory.md',
      'wiki/people/euler.md'
    ])
    expect(matchPages(pages, 'topics').map((p) => p.rel)).toEqual([
      'wiki/topics/network.md',
      'wiki/topics/graph-theory.md'
    ])
  })

  it('대소문자를 가리지 않는다', () => {
    expect(matchPages(pages, 'index').map((p) => p.rel)).toEqual(['wiki/INDEX.md'])
  })

  it('띄어 쓴 낱말은 저마다 제목이나 경로에 있으면 된다 — 통째 일치보다 아래', () => {
    expect(matchPages(pages, '그래프 people').map((p) => p.rel)).toEqual(['wiki/people/euler.md'])
    expect(matchPages(pages, '그래프 없는말')).toEqual([])
  })

  it(`${PALETTE_LIMIT}개까지만`, () => {
    const many = Array.from({ length: 80 }, (_, i) => page(`wiki/p${i}.md`, `페이지 ${i}`))
    expect(matchPages(many, '페이지')).toHaveLength(PALETTE_LIMIT)
  })
})

describe('paletteEntries', () => {
  const file = (rel: string): VaultTreeEntry => ({
    rel,
    kind: 'file',
    ext: rel.slice(rel.lastIndexOf('.')),
    mtimeMs: 0,
    size: 0
  })

  it('위키·보관함 문서·트리의 모든 md 를 한 목록으로 — 같은 경로는 한 번, 제목이 있으면 제목', () => {
    const entries = paletteEntries(
      [page('wiki/INDEX.md', '위키 입구')],
      [{ rel: 'outputs/2026-09-17-plan.md', title: '오늘 계획' }],
      [
        file('wiki/INDEX.md'),
        file('outputs/2026-09-17-plan.md'),
        file('private/2026-09-17.md'),
        file('templates/daily-note.md'),
        file('raw/shot.png'),
        { rel: 'private', kind: 'dir', ext: '', mtimeMs: 0, size: 0 }
      ]
    )
    expect(entries).toEqual([
      { rel: 'wiki/INDEX.md', title: '위키 입구' },
      { rel: 'outputs/2026-09-17-plan.md', title: '오늘 계획' },
      { rel: 'private/2026-09-17.md', title: '2026-09-17' },
      { rel: 'templates/daily-note.md', title: 'daily-note' }
    ])
  })

  it('`2026-09` 로 outputs/ 와 private/ 의 날짜 파일이 나온다', () => {
    const entries = paletteEntries(
      [],
      [{ rel: 'outputs/2026-09-17-plan.md', title: '오늘 계획' }],
      [file('outputs/2026-09-17-plan.md'), file('private/2026-09-16.md'), file('wiki/a.md')]
    )
    expect(matchPages(entries, '2026-09').map((e) => e.rel)).toEqual([
      'private/2026-09-16.md',
      'outputs/2026-09-17-plan.md'
    ])
  })
})
