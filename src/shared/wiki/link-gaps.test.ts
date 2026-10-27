import { describe, expect, it } from 'vitest'
import { linkMention, mentionTerms, unlinkedMentions, unresolvedLinks } from './link-gaps'

describe('unresolvedLinks', () => {
  it('없는 대상만 대상별로 묶고 많이 가리킨 순 — 볼트 파일 링크는 뺀다', () => {
    const entries = [
      { rel: 'wiki/a.md', slug: 'a', title: '가', links: [{ target: 'ghost' }, { target: 'b' }] },
      {
        rel: 'wiki/b.md',
        slug: 'b',
        title: '나',
        links: [{ target: 'Ghost' }, { target: '유령2' }]
      },
      {
        rel: 'wiki/c.md',
        slug: 'c',
        title: '다',
        links: [{ target: 'projects/x/README', vaultFile: true }]
      }
    ]
    expect(unresolvedLinks(entries)).toEqual([
      {
        target: 'ghost',
        sources: [
          { rel: 'wiki/a.md', title: '가' },
          { rel: 'wiki/b.md', title: '나' }
        ]
      },
      { target: '유령2', sources: [{ rel: 'wiki/b.md', title: '나' }] }
    ])
  })
})

describe('unlinkedMentions', () => {
  const target = { rel: 'wiki/topics/llm.md', title: '거대 언어 모델', slug: 'topics/LLM' }
  it('제목·파일 이름을 링크 없이 적은 줄 — 링크·코드·제목 줄·자기 문서는 뺀다', () => {
    const docs = [
      {
        rel: 'wiki/a.md',
        title: 'A',
        body: '요즘 거대 언어 모델 이야기\n[[LLM]] 은 링크\n`LLM` 코드\n# LLM 제목'
      },
      {
        rel: 'wiki/b.md',
        title: 'B',
        body: 'LLMs 는 복수형이라 아니다\nllm 은 대소문자 무시\n```\nLLM\n```'
      },
      { rel: 'wiki/topics/llm.md', title: '자기', body: 'LLM' }
    ]
    expect(unlinkedMentions(target, docs).map((m) => [m.rel, m.line, m.term])).toEqual([
      ['wiki/a.md', 0, '거대 언어 모델'],
      ['wiki/b.md', 1, 'LLM']
    ])
  })

  it('한 글자 이름은 찾지 않는다', () => {
    expect(mentionTerms({ title: '가', slug: 'a' })).toEqual([])
  })

  it('연속 공백 이름은 가린 칸의 공백과 만나도 놓치지 않는다 — 프리필터 우회 경로', () => {
    const t = { rel: 'wiki/t.md', title: 'a  b', slug: 't' }
    const docs = [{ rel: 'wiki/a.md', title: 'A', body: 'see a``b here' }]
    expect(unlinkedMentions(t, docs).map((m) => [m.rel, m.line, m.term])).toEqual([
      ['wiki/a.md', 0, 'a  b']
    ])
  })

  it('반복 호출이 같은 결과를 낸다 — 공유 정규식에 상태가 없다', () => {
    const t = { rel: 'wiki/topics/llm.md', title: '거대 언어 모델', slug: 'topics/LLM' }
    const docs = [
      { rel: 'wiki/a.md', title: 'A', body: '요즘 거대 언어 모델 이야기\n[[LLM]] 은 링크' },
      { rel: 'wiki/b.md', title: 'B', body: 'llm 은 대소문자 무시' }
    ]
    expect(unlinkedMentions(t, docs)).toEqual(unlinkedMentions(t, docs))
  })

  it('깨끗한 줄이 많아도 끝의 언급을 찾는다 — 줄 번호 그대로', () => {
    const t = { rel: 'wiki/topics/llm.md', title: '거대 언어 모델', slug: 'topics/LLM' }
    const body = `${'평범한 줄\n'.repeat(500)}거대 언어 모델 끝 언급`
    const docs = [{ rel: 'wiki/a.md', title: 'A', body }]
    expect(unlinkedMentions(t, docs).map((m) => [m.rel, m.line, m.term])).toEqual([
      ['wiki/a.md', 500, '거대 언어 모델']
    ])
  })

  it('언급이 상한을 넘으면 limit 개에서 끊는다 — 기본 50', () => {
    const t = { rel: 'wiki/topics/llm.md', title: '거대 언어 모델', slug: 'topics/LLM' }
    const body = `${'거대 언어 모델 이야기\n'.repeat(60)}`
    const docs = [{ rel: 'wiki/a.md', title: 'A', body }]
    expect(unlinkedMentions(t, docs)).toHaveLength(50)
    expect(unlinkedMentions(t, docs, 3)).toHaveLength(3)
  })
})

describe('linkMention', () => {
  it('그 줄의 첫 가려지지 않은 이름을 링크로 — 보이는 글자는 그대로', () => {
    const text = '---\na: 1\n---\n첫 줄\n[[LLM]] 뒤의 llm 이야기'
    const offset = '---\na: 1\n---\n'.length
    expect(linkMention(text, offset, 1, 'LLM', 'LLM')).toBe(
      '---\na: 1\n---\n첫 줄\n[[LLM]] 뒤의 [[llm]] 이야기'
    )
    expect(linkMention('거대 언어 모델 소개', 0, 0, '거대 언어 모델', 'topics/LLM')).toBe(
      '[[topics/LLM|거대 언어 모델]] 소개'
    )
    expect(linkMention('없음', 0, 0, 'LLM', 'LLM')).toBeNull()
  })
})
