import { describe, expect, it } from 'vitest'
import { hasTag, inlineTags, pageTags, splitTagQuery, tagIndex } from './tags'

describe('inlineTags', () => {
  it('본문의 #태그 — 제목 줄·코드·숫자만인 것은 아니다', () => {
    const body =
      '# 제목\n회의 #결정 과 #ai/모델, (#todo)\n`#코드` 와\n```\n#펜스\n```\n#123 은 아니다 #v2 는 맞다'
    expect(inlineTags(body)).toEqual(['결정', 'ai/모델', 'todo', 'v2'])
  })

  it('URL 조각(#anchor)은 앞이 공백이 아니라 태그가 아니다', () => {
    expect(inlineTags('https://x.com/a#section')).toEqual([])
  })
})

describe('pageTags', () => {
  it('속성 tags 와 본문 태그를 합치고 대소문자 다른 같은 태그는 한 번만', () => {
    expect(pageTags({ frontmatter: { tags: ['AI', '#회의'] }, body: '#ai 와 #새것' })).toEqual([
      'AI',
      '회의',
      '새것'
    ])
    expect(pageTags({ frontmatter: { tags: 'a, b' }, body: '' })).toEqual(['a', 'b'])
  })
})

describe('tagIndex', () => {
  it('많이 쓴 순, 같으면 이름순', () => {
    expect(
      tagIndex([
        { rel: 'a.md', tags: ['x', 'y'] },
        { rel: 'b.md', tags: ['Y'] }
      ])
    ).toEqual([
      { tag: 'y', count: 2, rels: ['a.md', 'b.md'] },
      { tag: 'x', count: 1, rels: ['a.md'] }
    ])
  })
})

describe('splitTagQuery · hasTag', () => {
  it('검색어에서 #태그를 떼어 내고 나머지를 남긴다', () => {
    expect(splitTagQuery('#회의 예산 #AI')).toEqual({ tags: ['회의', 'ai'], rest: '예산' })
    expect(splitTagQuery('그냥 글')).toEqual({ tags: [], rest: '그냥 글' })
  })

  it('끝의 문장부호는 태그가 아니다 — 본문 규칙과 같다', () => {
    expect(splitTagQuery('#회의! 예산')).toEqual({ tags: ['회의'], rest: '예산' })
  })

  it('#a 는 #a/b 도 품는다', () => {
    expect(hasTag(['ai/모델'], 'ai')).toBe(true)
    expect(hasTag(['aix'], 'ai')).toBe(false)
  })

  it('대소문자는 양쪽 다 가리지 않는다', () => {
    expect(hasTag(['AI/모델'], 'ai')).toBe(true)
    expect(hasTag(['ai'], 'AI')).toBe(true)
  })
})
