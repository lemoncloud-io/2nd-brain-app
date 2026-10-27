// 검색 — BM25(k1=1.2, b=0.75) 결정론 구현. 필드 둘: 제목(+파일명 slug, ×3 가중)·본문.
// 한중일은 띄어쓰기 대신 2글자 쌍으로 걸리게 tokenizeQuery 토큰을 리터럴 부분문자열로 센다. 매 질의 전체 스캔.
export type SearchablePage = {
  rel: string
  slug: string
  title: string
  body: string
  /** 속성 `tags` 와 본문 `#태그` — `#태그` 검색이 거른다 */
  tags?: string[]
}

export type SearchHit = { rel: string; title: string; score: number; snippet: string }

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'of',
  'to',
  'and',
  'or',
  'in',
  'on',
  'for',
  'it',
  '그리고',
  '하지만',
  '그러나',
  '저는',
  '저의',
  '입니다',
  '합니다',
  '이것',
  '그것'
])

const isCJK = (ch: string): boolean =>
  /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF\u3040-\u30FF]/.test(ch)

/** 한중일 한 글자 — `로`·`이`·`문` 처럼 거의 모든 본문에 있어 그것만으로는 근거를 가르지 못한다 */
const isCJKChar = (token: string): boolean => [...token].length === 1 && isCJK(token)

/** 질의 토크나이저 — 소문자, 공백·구두점(한중일 포함) 분리, 소량 불용어,
 *  한중일 토큰 길이 > 2면 2글자 쌍 + 원 토큰. 한중일 한 글자 토큰은 질의에 다른 말이 있으면 뺀다 */
export const tokenizeQuery = (query: string): string[] => {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
  const raw = words.every(isCJKChar) ? words : words.filter((t) => !isCJKChar(t))
  const out: string[] = []
  for (const token of raw) {
    const hasCJK = [...token].some(isCJK)
    if (hasCJK && token.length > 2) {
      const chars = [...token]
      for (let i = 0; i < chars.length - 1; i++) out.push(chars[i]! + chars[i + 1]!)
      out.push(token)
    } else {
      out.push(token)
    }
  }
  return out
}

const K1 = 1.2
const B = 0.75
const TITLE_BOOST = 3

// 리터럴(정규식 아님) 겹치지 않는 출현 횟수
const countLiteral = (haystack: string, needle: string): number => {
  let n = 0
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length))
    n++
  return n
}

// BM25 tf 항 — 길이는 글자 수로 정규화한다(한중일 본문은 단어 경계가 없어 토큰 수를 셀 수 없다)
const termWeight = (tf: number, length: number, avgLength: number): number =>
  tf === 0 ? 0 : (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * length) / (avgLength || 1)))

/**
 * 스니펫용 평문 — 사용자는 마크다운을 모른다. 제목·강조·코드·인용·목록·표 기호와 코드 울타리 줄을 걷고,
 * 링크는 보이는 글자만 남긴다
 */
const plainText = (body: string): string =>
  body
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/!?\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>+|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\*\*|__|[*`|]/g, '')
    .replace(/[ \t]+/g, ' ')

/** 첫 일치 주변 ±60자 스니펫 — 구절이 없으면 본문에 걸린 가장 긴 토큰 */
const snippet = (body: string, phrase: string, terms: string[]): string => {
  const lower = body.toLowerCase()
  const needle = [phrase, ...[...terms].sort((a, b) => b.length - a.length)].find((t) =>
    lower.includes(t)
  )
  if (!needle) return body.slice(0, 80)
  const idx = lower.indexOf(needle)
  const start = Math.max(0, idx - 60)
  const end = Math.min(body.length, idx + needle.length + 60)
  return body.slice(start, end)
}

export const searchPages = (pages: SearchablePage[], query: string, limit: number): SearchHit[] =>
  searchLowered(pages, lowerCorpus(pages), query, limit)

/** 한 번 낮춘 제목·본문 — 키스트로크마다 다시 낮추지 않게 캐시가 들고 있는다 */
export type LoweredCorpus = { titles: string[]; bodies: string[] }

/** 말뭉치 낮추기 — searchLowered 가 먹는 준비 단계. 순수해서 테스트에서 직접 센다 */
export const lowerCorpus = (pages: SearchablePage[]): LoweredCorpus => ({
  titles: pages.map((p) => `${p.title} ${p.slug}`.toLowerCase()),
  bodies: pages.map((p) => p.body.toLowerCase())
})

/**
 * 말뭉치 캐시 — 같은 보관함 상태에서는 낮춘 것을 다시 쓴다.
 * 서명은 `rel@mtimeMs:body.length` 다 — listDocs 가 주는 mtime 과 본문 길이다.
 * 서명을 못 지으면 (mtime 없음) 매번 새로 낮춘다: 느리지만 정확하다
 */
export const createCorpusCache = (): {
  loweredFor: (pages: SearchablePage[]) => LoweredCorpus
} => {
  let cached: { sig: string; corpus: LoweredCorpus } | null = null
  return {
    loweredFor: (pages: SearchablePage[]): LoweredCorpus => {
      const sig = signatureOf(pages)
      if (sig !== null && cached !== null && cached.sig === sig) return cached.corpus
      const corpus = lowerCorpus(pages)
      if (sig !== null) cached = { sig, corpus }
      return corpus
    }
  }
}

const signatureOf = (pages: SearchablePage[]): string | null => {
  const parts: string[] = [String(pages.length)]
  for (const p of pages) {
    const mtime = (p as { mtimeMs?: unknown }).mtimeMs
    if (typeof mtime !== 'number') return null
    parts.push(`${p.rel}@${mtime}:${p.body.length}`)
  }
  return parts.join('\n')
}

/** 낮춘 말뭉치로 찾는 검색 — searchPages 와 결과가 같다 */
export const searchLowered = (
  pages: SearchablePage[],
  corpus: LoweredCorpus,
  query: string,
  limit: number
): SearchHit[] => {
  const phrase = query.trim().toLowerCase()
  if (!phrase) return [] // 빈 질의 → 스캔 없이 0
  const n = Math.floor(limit)
  if (!(n > 0)) return []
  const tokens = tokenizeQuery(phrase)
  // 글자·숫자가 있는데 토큰이 없으면 불용어만 쓴 질의다 → 0
  if (tokens.length === 0 && /[\p{L}\p{N}]/u.test(phrase)) return []
  // 구절 자체도 한 항이다 — `c++`·`research(*)`처럼 토큰화가 기호를 떨군 질의에서 리터럴 일치를 위로 올리고,
  // 토큰이 없는 기호 질의(`[[`)는 이 항만으로 찾는다
  const terms = [...new Set([...tokens, phrase])]

  const docs = corpus.titles.map((title, i) => ({ title, body: corpus.bodies[i] ?? '' }))
  const avgTitle = docs.reduce((sum, d) => sum + d.title.length, 0) / (docs.length || 1)
  const avgBody = docs.reduce((sum, d) => sum + d.body.length, 0) / (docs.length || 1)
  const tf = docs.map((d) => terms.map((t) => [countLiteral(d.title, t), countLiteral(d.body, t)]))
  const idf = terms.map((_, ti) => {
    const df = tf.filter((row) => row[ti]![0]! + row[ti]![1]! > 0).length
    return Math.log((docs.length - df + 0.5) / (df + 0.5) + 1)
  })

  const scored: { rel: string; title: string; score: number; body: string }[] = []
  pages.forEach((p, di) => {
    const doc = docs[di]!
    let score = 0
    terms.forEach((_, ti) => {
      const [titleTf, bodyTf] = tf[di]![ti]!
      score +=
        idf[ti]! *
        (TITLE_BOOST * termWeight(titleTf!, doc.title.length, avgTitle) +
          termWeight(bodyTf!, doc.body.length, avgBody))
    })
    if (score > 0) {
      scored.push({ rel: p.rel, title: p.title, score, body: p.body })
    }
  })
  return scored
    .sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel))
    .slice(0, n)
    .map(({ rel, title, score, body }) => ({
      rel,
      title,
      score,
      snippet: snippet(plainText(body), phrase, terms)
    }))
}
