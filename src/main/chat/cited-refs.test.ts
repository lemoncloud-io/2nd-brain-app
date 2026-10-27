import { describe, expect, it } from 'vitest'
import { citedRels } from './cited-refs'

describe('citedRels — test: cited-refs.ts', () => {
  const candidates = ['wiki/apple.md', 'projects/@lemoncloud-io/hello/README.md', 'wiki/b.md']

  it('답이 경로로 적은 후보만 후보 순서대로 고른다', () => {
    const text = '근거: `projects/@lemoncloud-io/hello/README.md` 와 `wiki/apple.md`.'
    expect(citedRels(text, candidates)).toEqual([
      'wiki/apple.md',
      'projects/@lemoncloud-io/hello/README.md'
    ])
  })

  it('인용이 없으면 비어 있다', () => {
    expect(citedRels('Hello. 무엇을 도와줄까?', candidates)).toEqual([])
  })

  it('더 긴 다른 경로의 일부는 인용이 아니다', () => {
    expect(citedRels('`wiki/apple.md.bak` · `old/wiki/b.md`', candidates)).toEqual([])
  })

  it('.md 를 뗀 꼴도 인용이다', () => {
    expect(citedRels('wiki/apple 을 보라', candidates)).toEqual(['wiki/apple.md'])
  })

  it('한글 파일명은 풀어 쓴 꼴(NFD)과 합친 꼴(NFC)을 같게 본다', () => {
    const nfd = 'wiki/사과.md'.normalize('NFD')
    expect(citedRels('`wiki/사과.md`', [nfd])).toEqual([nfd])
  })
})
