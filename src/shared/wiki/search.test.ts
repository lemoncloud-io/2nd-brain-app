import { describe, expect, it } from 'vitest'
import {
  createCorpusCache,
  lowerCorpus,
  searchLowered,
  searchPages,
  tokenizeQuery,
  type SearchablePage
} from './search'
import { page } from './test-pages'

describe('tokenizeQuery', () => {
  it('— test: 소문자화·구두점 분리(한중일 구두점 포함) — test: tokenize', () => {
    expect(tokenizeQuery('Hello, World! 위키·문서')).toEqual(['hello', 'world', '위키', '문서'])
  })

  it('— test: 불용어 제거 — test: tokenize', () => {
    expect(tokenizeQuery('the 위키 is')).toEqual(['위키'])
    expect(tokenizeQuery('그리고 하지만')).toEqual([])
  })

  it('— test: 한중일 토큰 길이 > 2 → 2글자 쌍 + 원 토큰 — test: tokenize', () => {
    expect(tokenizeQuery('리서치노트')).toEqual(['리서', '서치', '치노', '노트', '리서치노트'])
    // 2글자 토큰은 원 토큰만
    expect(tokenizeQuery('위키')).toEqual(['위키'])
  })

  // 한 글자(`로`·`이`·`문`)는 한국어 본문 거의 전부에 있다 — 질의의 다른 말이 있으면 항으로 쓰지 않는다
  it('— test: 한중일 한 글자 토큰은 다른 토큰이 있으면 뺀다 — test: tokenize', () => {
    expect(tokenizeQuery('매 질문')).toEqual(['질문'])
    expect(tokenizeQuery('책')).toEqual(['책'])
    expect(tokenizeQuery('x 질문')).toEqual(['x', '질문'])
  })

  it('— test: 빈 질의·불용어만 → 빈 배열 — test: tokenize', () => {
    expect(tokenizeQuery('')).toEqual([])
    expect(tokenizeQuery('  the is  ')).toEqual([])
  })
})

describe('searchPages', () => {
  const pages = [
    page('wiki/research-note.md', '리서치 노트', '본문에는 별 내용이 없다.'),
    page('wiki/vault-guide.md', '볼트 안내서', '리서치 노트를 잘 관리하자. 리서치는 매일.'),
    page('wiki/code-sample.md', '코드 예제', '리서치(`research`) 키워드는 코드 안에도 있다.'),
    page('wiki/unrelated.md', '무관한 문서', '전혀 다른 이야기다.')
  ]

  it('— test: 한글 2글자 질의로 제목·본문을 찾는다 — test: searchPages', () => {
    const hits = searchPages(pages, '리서', 10)
    expect(hits.length).toBe(3)
    expect(hits.map((h) => h.rel)).not.toContain('wiki/unrelated.md')
  })

  it('— test: 한 글자만 겹치는 한국어 문서는 걸리지 않는다 — test: searchPages', () => {
    const other = [
      page(
        'skills/google-workspace.md',
        '구글 워크스페이스',
        '문서를 만들고 시트로 정리해 공유한다.'
      ),
      page('docs/folders.md', '폴더 구조', '계획은 plan 폴더로 옮기고 결과는 outputs 로 남긴다.')
    ]
    expect(searchPages(other, '클립보드 복사로해줘', 10)).toEqual([])
    expect(searchPages(other, '매 질문 앞에 붙는 지시문이 어디있어?', 10)).toEqual([])
  })

  it('— test: 영문 대소문자 무시 — test: searchPages', () => {
    expect(searchPages(pages, 'RESEARCH', 10).map((h) => h.rel)).toContain('wiki/code-sample.md')
  })

  it('— test: 제목 일치가 본문 일치보다 위에 온다(제목 필드 ×3) — test: searchPages', () => {
    const hits = searchPages(pages, '리서치', 10)
    expect(hits[0]?.rel).toBe('wiki/research-note.md')
  })

  it('— test: 스니펫은 첫 일치 주변 ±60자 — test: searchPages', () => {
    const body = `${'가'.repeat(80)}리서치${'나'.repeat(80)}`
    const [hit] = searchPages([page('wiki/x.md', '제목', body)], '리서치', 10)
    expect(hit?.snippet).toContain('리서치')
    expect(hit?.snippet.length).toBeLessThanOrEqual(124)
  })

  it('— test: 코드 블록 안 일치도 포함된다 — test: searchPages', () => {
    const [hit] = searchPages([page('wiki/x.md', '제목', '```\n리서치\n```')], '리서치', 10)
    expect(hit?.snippet).toContain('리서치')
  })

  it('— test: 빈 질의·불용어만 → 결과 0 — test: searchPages', () => {
    expect(searchPages(pages, '', 10)).toEqual([])
    expect(searchPages(pages, 'the is', 10)).toEqual([])
  })

  it('— test: `[[`·`(`·`*` 특수문자 질의가 예외 없이 리터럴 매칭 — test: searchPages', () => {
    const p = [page('wiki/x.md', '링크 문서', '[[어딘가]] 와 research(*) 참조')]
    expect(() => searchPages(p, '[[', 10)).not.toThrow()
    expect(searchPages(p, '[[', 10).length).toBe(1)
    expect(searchPages(p, 'research(*)', 10).length).toBe(1)
    expect(searchPages(p, '***', 10).length).toBe(0)
  })

  it('— test: 기호가 섞인 질의는 구절 그대로 걸린 페이지가 토큰만 걸린 페이지보다 위다 — test: searchPages', () => {
    const cpp = searchPages(
      [
        page('wiki/css.md', 'CSS', 'c 스타일 c 문법 c 선택자'),
        page('wiki/cpp.md', 'C++ 언어', 'c++ 템플릿')
      ],
      'c++',
      10
    )
    expect(cpp[0]?.rel).toBe('wiki/cpp.md')
    const research = searchPages(
      [
        page('wiki/a-plain.md', '리서치', 'research research research'),
        page('wiki/b-literal.md', '참조', 'research(*) 참조')
      ],
      'research(*)',
      10
    )
    expect(research.map((h) => h.rel)).toEqual(['wiki/b-literal.md', 'wiki/a-plain.md'])
  })

  it('— test: 불용어 한 단어 질의 → 결과 0 — test: searchPages', () => {
    expect(searchPages([page('wiki/x.md', 'the book', 'the end')], 'the', 10)).toEqual([])
  })

  it('— test: 제목에 걸린 페이지가 본문에서 여러 번 언급한 페이지보다 위다(BM25 포화 + 제목 ×3) — test: searchPages', () => {
    const hits = searchPages(
      [
        page('wiki/a-body.md', '다른 문서', '벡터 이야기. 벡터 저장. 벡터 비교.'),
        page('wiki/b-title.md', '벡터 검색', '짧은 본문이다.'),
        page('wiki/c-once.md', '또 다른 문서', '벡터 한 번.')
      ],
      '벡터',
      10
    )
    expect(hits.map((h) => h.rel)).toEqual(['wiki/b-title.md', 'wiki/a-body.md', 'wiki/c-once.md'])
  })

  it('— test: 드문 토큰이 흔한 토큰보다 무겁다(IDF) — test: searchPages', () => {
    const hits = searchPages(
      [
        page('wiki/a-common.md', '문서 A', '위키 위키 설명'),
        page('wiki/b-rare.md', '문서 B', '벡터 설명'),
        page('wiki/c.md', '문서 C', '위키 기타'),
        page('wiki/d.md', '문서 D', '위키 기타'),
        page('wiki/e.md', '문서 E', '위키 기타')
      ],
      '위키 벡터',
      10
    )
    expect(hits[0]?.rel).toBe('wiki/b-rare.md')
    expect(hits).toHaveLength(5)
  })

  it('— test: 파일명(slug)만 걸려도 찾는다 — test: searchPages', () => {
    const hits = searchPages([page('wiki/topics/embedding.md', '임베딩', '본문')], 'embedding', 10)
    expect(hits.map((h) => h.rel)).toEqual(['wiki/topics/embedding.md'])
  })

  it('— test: 구절이 본문에 없으면 스니펫은 처음 걸린 토큰 주변이다 — test: searchPages', () => {
    const body = `${'가'.repeat(100)} 벡터 ${'나'.repeat(100)}`
    const [hit] = searchPages([page('wiki/x.md', '제목', body)], '벡터 없는말', 10)
    expect(hit?.snippet).toContain('벡터')
    expect(hit?.snippet.length).toBeLessThanOrEqual(60 * 2 + '벡터'.length)
  })

  it('— test: 스니펫은 마크다운 기호를 뺀 평문이다 — test: searchPages', () => {
    const body = [
      '# Decision Graph',
      '## Summary',
      '**결정을** 남긴다. `코드`와 [[wiki/x|위키 링크]], [바깥](https://a.b) 링크.',
      '> 인용 - 목록',
      '```bash',
      'git -C <볼트 클론> log',
      '```',
      '| 칸 | 값 |'
    ].join('\n')
    const [hit] = searchPages([page('wiki/x.md', '제목', body)], 'decision', 10)
    expect(hit?.snippet).not.toMatch(/[#*`>|]|\[\[|\]\(|```/)
    expect(hit?.snippet).toContain('Decision Graph')
    expect(hit?.snippet).toContain('결정을 남긴다')
    expect(hit?.snippet).toContain('위키 링크')
    expect(hit?.snippet).toContain('바깥 링크')
  })

  it('— test: 500페이지 스캔 300ms 이하 — test: searchPages (perf)', () => {
    const big = Array.from({ length: 500 }, (_, i) =>
      page(`wiki/p${i}.md`, `문서 ${i}`, `본문 ${i} — ${'내용 '.repeat(200)} 리서치 자료다.`)
    )
    const start = performance.now()
    searchPages(big, '리서치 자료', 20)
    expect(performance.now() - start).toBeLessThanOrEqual(300)
  })
})

describe('createCorpusCache', () => {
  const withMtime = (
    rel: string,
    title: string,
    body: string,
    mtimeMs: number
  ): SearchablePage & { mtimeMs: number } => ({
    ...page(rel, title, body),
    mtimeMs
  })
  const pages = (): (SearchablePage & { mtimeMs: number })[] => [
    withMtime('wiki/a.md', '리서치 노트', '리서치는 매일.', 1),
    withMtime('wiki/b.md', '무관한 문서', '전혀 다른 이야기다.', 2)
  ]

  it('— test: 같은 mtime 서명에서는 낮춘 것을 다시 쓴다(참조 동일) — test: corpus cache', () => {
    const cache = createCorpusCache()
    const first = cache.loweredFor(pages())
    // 새 배열·같은 내용 — 다시 낮추지 않고 같은 참조를 준다
    expect(cache.loweredFor(pages())).toBe(first)
  })

  it('— test: 바뀐 페이지는 다시 낮춘다 — test: corpus cache', () => {
    const cache = createCorpusCache()
    const first = cache.loweredFor(pages())
    const changed = pages()
    changed[0] = withMtime('wiki/a.md', '리서치 노트', '리서치는 매일. 벡터도.', 3)
    const second = cache.loweredFor(changed)
    expect(second).not.toBe(first)
    expect(second.bodies[0]).toContain('벡터')
  })

  it('— test: mtime이 없으면 매번 새로 낮춘다 — test: corpus cache', () => {
    const cache = createCorpusCache()
    const plain = [page('wiki/a.md', '제목', '본문')]
    expect(cache.loweredFor(plain)).not.toBe(cache.loweredFor(plain))
  })

  it('— test: searchLowered는 searchPages와 결과가 같다 — test: corpus cache', () => {
    const cache = createCorpusCache()
    const list = pages()
    expect(searchLowered(list, cache.loweredFor(list), '리서치', 10)).toEqual(
      searchPages(list, '리서치', 10)
    )
    expect(searchLowered(list, lowerCorpus(list), '리서치', 10)).toEqual(
      searchPages(list, '리서치', 10)
    )
  })
})

describe('searchPages limit guard', () => {
  const pages = [
    page('wiki/research-note.md', '리서치 노트', '본문에는 별 내용이 없다.'),
    page('wiki/vault-guide.md', '볼트 안내서', '리서치 노트를 잘 관리하자. 리서치는 매일.'),
    page('wiki/code-sample.md', '코드 예제', '리서치(`research`) 키워드는 코드 안에도 있다.')
  ]

  it('0·음수·NaN 제한은 빈 결과다', () => {
    expect(searchPages(pages, '리서치', 0)).toEqual([])
    expect(searchPages(pages, '리서치', -1)).toEqual([])
    expect(searchPages(pages, '리서치', Number.NaN)).toEqual([])
  })

  it('소수 제한은 버림으로 자른다', () => {
    expect(searchPages(pages, '리서치', 2.9)).toHaveLength(2)
  })
})
