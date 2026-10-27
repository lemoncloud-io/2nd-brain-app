// 볼트 검색 한 번 — 키워드(BM25)만 쓴다(한글 부분 일치 포함).
// IPC 핸들러에서 떼어 둔 순수 흐름: 페이지 목록을 주입받아 Electron 없이 테스트한다.
import {
  createCorpusCache,
  searchLowered,
  type SearchablePage,
  type SearchHit
} from '../../shared/wiki/search'
import { hasTag, splitTagQuery } from '../../shared/wiki/tags'
import { mainT } from '../i18n'

const DEFAULT_LIMIT = 20

// 낮춘 말뭉치 캐시 — 키스트로크마다 오는 같은 보관함 상태는 다시 낮추지 않는다.
// 서명(rel@mtime:길이)이 바뀌면(볼트가 바뀌면) 한 번만 다시 낮춘다
const corpusCache = createCorpusCache()

/** 태그만 친 검색 — 그 태그를 가진 문서 전부, 제목순. 스니펫은 태그가 적힌 줄 */
const tagHits = (pages: SearchablePage[], tags: string[], n: number): SearchHit[] =>
  pages
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, n)
    .map((page) => {
      const line =
        page.body
          .split('\n')
          .find((l) => tags.some((tag) => l.toLowerCase().includes(`#${tag}`))) ?? ''
      return { rel: page.rel, title: page.title, score: 1, snippet: line.trim() }
    })

export const searchVault = async (
  loadPages: () => SearchablePage[],
  query: unknown,
  limit: unknown
): Promise<SearchHit[] | { error: string }> => {
  if (typeof query !== 'string') return { error: mainT().wikiMain.queryUnreadable }
  if (!query.trim()) return []
  const n = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT
  const { tags, rest } = splitTagQuery(query)
  const all = loadPages()
  // `#태그` 는 거르개다 — 그 태그를 모두 가진 문서만 남기고, 남은 글로 그 안에서 찾는다
  const pages =
    tags.length === 0 ? all : all.filter((p) => tags.every((tag) => hasTag(p.tags ?? [], tag)))
  if (tags.length > 0 && rest === '') return tagHits(pages, tags, n)
  const text = tags.length === 0 ? query : rest
  return searchLowered(pages, corpusCache.loweredFor(pages), text, n)
}
