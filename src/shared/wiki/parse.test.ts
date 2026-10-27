import { describe, it, expect } from 'vitest'
import { createLinkResolver, parseWikiPage, resolveLink, type WikiPage } from './parse'

const page = (rel: string, text: string): WikiPage => parseWikiPage(rel, text)

describe('parseWikiPage — frontmatter', () => {
  it('frontmatter가 있으면 파싱한다', () => {
    const p = page('wiki/a.md', '---\ntitle: 제목\ntype: topic\nup:\n  - b\n---\n\n본문\n')
    expect(p.frontmatter).toEqual({ title: '제목', type: 'topic', up: ['b'] })
    expect(p.frontmatterError).toBeUndefined()
    expect(p.body).toBe('\n본문\n')
  })

  it('yaml 파싱 실패 시 frontmatter null + frontmatterError, 본문은 보여 준다', () => {
    const p = page('wiki/a.md', '---\ntitle: [unbalanced\n---\n\n본문\n')
    expect(p.frontmatter).toBeNull()
    expect(p.frontmatterError).toBeTruthy()
    expect(p.body).toContain('본문')
  })
})

describe('parseWikiPage — 제목', () => {
  it('frontmatter title 우선', () => {
    expect(page('wiki/a.md', '---\ntitle: FM제목\n---\n\n# 헤더\n').title).toBe('FM제목')
  })
  it('frontmatter 없으면 첫 `# `', () => {
    expect(page('wiki/a.md', '\n# 헤더제목\n').title).toBe('헤더제목')
  })
  it('둘 다 없으면 파일명', () => {
    expect(page('wiki/topics/ai.md', '본문만').title).toBe('ai')
  })
})

describe('parseWikiPage — 링크 추출', () => {
  it('기본 wikilink·별칭·heading·경로형', () => {
    const p = page('wiki/a.md', '- [[b]]\n- [[c|C별칭]]\n- [[d#sec]]\n- [[wiki/e]]\n')
    expect(p.links.map((l) => l.target)).toEqual(['b', 'c', 'd', 'wiki/e'])
  })

  it('코드 펜스·인라인 코드 안은 건너뛴다', () => {
    const p = page('wiki/a.md', '```\n[[fenced]]\n```\n\n`[[inline]]` [[real]]')
    expect(p.links.map((l) => l.target)).toEqual(['real'])
  })

  it('표 안 `\\|` 포함 링크', () => {
    const p = page('wiki/a.md', '| a | b |\n|---|---|\n| [[x\\|X표]] | y |\n')
    expect(p.links.map((l) => l.target)).toEqual(['x'])
  })

  it('속성 블록 안의 [[링크]]는 세지 않고, 줄 번호는 어긋나지 않는다', () => {
    const p = page('wiki/a.md', '---\ntitle: 갑\nup: "[[ghost]]"\n---\n\n본문 [[real]]\n')
    expect(p.links.map((l) => l.target)).toEqual(['real'])
    expect(p.links[0]?.line).toBe(6)
  })

  it('여러 줄 링크의 줄 번호가 앞에서부터 맞는다', () => {
    const p = page('wiki/a.md', '[[one]] 앞\n두째 줄 [[two]] 중간 [[three]]\n\n\n다섯째 [[four]]\n')
    expect(p.links.map((l) => [l.target, l.line])).toEqual([
      ['one', 1],
      ['two', 2],
      ['three', 2],
      ['four', 5]
    ])
  })

  it('속성이 깨진 블록 안은 보이는 글자와 같이 센다', () => {
    const p = page('wiki/a.md', '---\ntitle: [unclosed\n---\n\n[[real]]\n')
    expect(p.frontmatter).toBeNull()
    expect(p.links.map((l) => l.target)).toEqual(['real'])
  })

  it('Foo.MD 처럼 대문자 꼬리도 풀린다', () => {
    const index = [{ rel: 'wiki/foo.md', slug: 'foo' }]
    expect(resolveLink('foo.MD', index)).toEqual({ rel: 'wiki/foo.md' })
    expect(createLinkResolver(index)('Foo.MD')).toEqual({ rel: 'wiki/foo.md' })
  })
})

describe('resolveLink — review-service 링크 사례와 같은 기대값', () => {
  const pages: WikiPage[] = [
    page('wiki/alpha.md', ''),
    page('wiki/beta.md', ''),
    page('wiki/topics/ai.md', ''),
    page('wiki/alphabet.md', '')
  ]
  const index = pages.map((p) => ({ rel: p.rel, slug: p.slug }))

  it('[[slug]] → basename 일치', () => {
    expect(resolveLink('alpha', index)).toEqual({ rel: 'wiki/alpha.md' })
  })
  it('[[wiki/slug]] → 경로 일치', () => {
    expect(resolveLink('wiki/alpha', index)).toEqual({ rel: 'wiki/alpha.md' })
  })
  it('[[wiki/topics/ai]] → 경로 일치', () => {
    expect(resolveLink('wiki/topics/ai', index)).toEqual({ rel: 'wiki/topics/ai.md' })
  })
  it('basename 중복이면 가장 짧은 경로', () => {
    const dup: WikiPage[] = [
      page('wiki/a/deep/name.md', ''),
      page('wiki/name.md', ''),
      page('wiki/b/x/name.md', '')
    ]
    const dupIndex = dup.map((p) => ({ rel: p.rel, slug: p.slug }))
    expect(resolveLink('name', dupIndex)).toEqual({ rel: 'wiki/name.md' })
  })
  it('없는 링크는 unresolved', () => {
    expect(resolveLink('ghost', index)).toEqual({ rel: null })
  })
})

describe('resolveLink — NFC/NFD 정규화', () => {
  it('NFD 파일명 + NFC 링크 해석 성공', () => {
    const nfdRel = 'wiki/한글-페이지.md'
    const pages = [page(nfdRel, '')]
    const nfcTarget = '한글-페이지'
    expect(
      resolveLink(
        nfcTarget,
        pages.map((p) => ({ rel: p.rel, slug: p.slug }))
      )
    ).toEqual({
      rel: nfdRel
    })
  })
})

describe('parseWikiPage — slug', () => {
  it('slug는 확장자 제거한 경로', () => {
    expect(page('wiki/topics/ai.md', '').slug).toBe('topics/ai')
  })
})

describe('createLinkResolver — resolveLink 와 같은 답, 조회표는 한 번', () => {
  const index = [
    { rel: 'wiki/alpha.md', slug: 'alpha' },
    { rel: 'wiki/deep/alpha.md', slug: 'deep/alpha' },
    { rel: 'wiki/한글.md', slug: '한글' }
  ]
  it.each(['alpha', 'ALPHA.md', 'deep/alpha', '한글'.normalize('NFD'), 'missing', 'x/alpha'])(
    '%s',
    (target) => {
      expect(createLinkResolver(index)(target)).toEqual(resolveLink(target, index))
    }
  )
})
