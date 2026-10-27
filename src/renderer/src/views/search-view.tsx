// 검색 탭(슬라이스 07) — 호출 규칙(150ms 디바운스·늦은 응답 폐기·인덱스 준비 뒤 재검색)은 `lib/use-wiki-search.ts`,
// 결과 클릭은 근거 시트(openPeek) — 검색 결과를 두고 옆에서 읽는다.
// md 아닌 파일(PDF·그림…)은 이름으로 찾고 문서 자리에서 연다 — 종류 단추·일치 규칙은 `lib/file-find.ts`.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { ViewHeader } from '../components/layout/view'
import { Button } from '../components/ui/button'
import { SearchClearButton } from '../components/ui/search-clear-button'
import { useWorkbench } from '../store/workbench'
import { ErrorNote } from '../components/error-note'
import { useChat } from './chat/chat-context'
import { useWikiSearch } from '../lib/use-wiki-search'
import { pickHighlight } from '../lib/highlight'
import { fileEntries, findByKind, type FindKind } from '../lib/file-find'
import { FindKindChips } from '../components/find-kind-chips'
import { useT } from '../lib/i18n'

/** 종류를 가리지 않을 때 문서 결과 위에 보이는 파일 수 — 종류를 고르면 전부 보인다 */
const FILES_AMONG_ALL = 5

const Highlight = ({ text, query }: { text: string; query: string }): React.JSX.Element => {
  const lower = text.toLowerCase()
  const needle = pickHighlight(lower, query)
  if (needle === null) return <>{text}</>
  const idx = lower.indexOf(needle)
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="highlighter bg-transparent text-foreground underline underline-offset-2">
        {text.slice(idx, idx + needle.length)}
      </mark>
      {text.slice(idx + needle.length)}
    </>
  )
}

export const SearchView = (): React.JSX.Element => {
  const t = useT()
  const [query, setQuery] = useState('')
  const { hits, hitsFor, searched, error, pending, run: runSearch, schedule } = useWikiSearch()
  const openPeek = useWorkbench((s) => s.openPeek)
  const openFile = useWorkbench((s) => s.openFile)
  const tree = useWorkbench((s) => s.tree)
  const [kind, setKind] = useState<FindKind | null>(null)
  const askChat = useWorkbench((s) => s.askChat)
  const { setDraft } = useChat()
  // 구역은 숨긴 채 마운트된다 — autoFocus 는 첫 마운트에만 걸리니 들어올 때마다 입력칸으로
  const active = useWorkbench((s) => s.view === 'knowledge' && s.knowledgeSection === 'search')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (active) inputRef.current?.focus()
  }, [active])

  // ⌘K 의 "본문에서 찾기" 가 넘긴 질의
  const searchRequest = useWorkbench((s) => s.searchRequest)
  const [seenRequest, setSeenRequest] = useState(searchRequest)
  if (searchRequest !== seenRequest) {
    setSeenRequest(searchRequest)
    if (searchRequest) setQuery(searchRequest.query)
  }
  useEffect(() => {
    if (!searchRequest) return
    // 입력칸 입력과 같은 길(타이머)로 돌린다 — 이펙트 안에서 곧바로 상태를 바꾸지 않는다
    const id = window.setTimeout(() => void runSearch(searchRequest.query), 0)
    return () => window.clearTimeout(id)
  }, [searchRequest, runSearch])

  const onInput = (value: string): void => {
    setQuery(value)
    schedule(value)
  }

  const open = (rel: string): void => {
    openPeek(rel)
  }

  // 답이 오기 전 옛 목록을 내보이면 잘못된 문서를 연다 — 팔레트와 같은 hitsFor 대조
  const current = hitsFor === query

  // 본문 검색은 문서만 본다 — 다른 종류를 고르면 이름 일치만 남는다
  const docsShown = kind === null || kind === 'doc'
  const entries = useMemo(() => fileEntries(tree ?? []), [tree])
  const files = useMemo(() => {
    if (kind === 'doc') return []
    const found = findByKind(entries, kind, query)
    return kind === null ? found.slice(0, FILES_AMONG_ALL) : found
  }, [entries, kind, query])
  const docHits = docsShown && current ? (hits ?? []) : []

  return (
    <>
      <ViewHeader title={t.knowledge.search.title} description={t.knowledge.search.description} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[46rem] flex-col px-6 py-8" data-testid="search-view">
          <label className="flex h-12 items-center gap-3 rounded-lg border border-input-border bg-background px-4 shadow-raised transition-colors focus-within:border-focus-border">
            <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              aria-label={t.knowledge.search.input}
              data-testid="search-input"
              value={query}
              onChange={(e) => onInput(e.target.value)}
              placeholder={t.knowledge.search.placeholder}
              className="w-full bg-transparent text-body outline-none placeholder:text-muted-foreground"
            />
            <SearchClearButton
              visible={query !== ''}
              aria-label={t.knowledge.search.clear}
              data-testid="search-clear"
              onClear={() => {
                onInput('')
                inputRef.current?.focus()
              }}
            />
          </label>
          <FindKindChips value={kind} onChange={setKind} testId="search-kind" className="mt-3" />
          {docsShown && error && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ErrorNote error={error} testId="search-error" />
              <Button
                variant="outline"
                size="sm"
                data-testid="search-retry"
                onClick={() => void runSearch(query)}
              >
                {t.knowledge.search.retry}
              </Button>
            </div>
          )}
          {docsShown && pending && (
            <p className="mt-4 text-caption text-muted-foreground" data-testid="search-pending">
              {t.knowledge.search.pending}
            </p>
          )}
          <div className="mt-6 flex flex-col" data-testid="search-results">
            {/* 처음에는 빈칸이 아니라 무엇을 적을지 말한다 */}
            {query === '' && !searched && (
              <div
                className="flex flex-col items-center gap-2 py-12 text-center"
                data-testid="search-hint"
              >
                <p className="text-callout text-muted-foreground">{t.knowledge.search.hint}</p>
              </div>
            )}
            {!docsShown && files.length === 0 && (
              <p
                className="py-12 text-center text-callout text-muted-foreground"
                data-testid="search-kind-empty"
              >
                {t.library.noKindMatch}
              </p>
            )}
            {docsShown && searched && current && hits?.length === 0 && files.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12" data-testid="search-empty">
                <p className="text-callout text-muted-foreground">{t.knowledge.search.empty}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {/* 단어가 안 맞으면 AI 에게 묻는다 */}
                  <Button
                    size="sm"
                    data-testid="ask-from-search"
                    onClick={() => {
                      setDraft(query)
                      askChat()
                    }}
                  >
                    {t.knowledge.search.askChat}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="search-empty-clear"
                    onClick={() => {
                      onInput('')
                      inputRef.current?.focus()
                    }}
                  >
                    {t.knowledge.search.clear}
                  </Button>
                </div>
              </div>
            )}
            {files.map((file) => (
              <button
                key={file.rel}
                type="button"
                data-testid={`search-file:${file.rel}`}
                onClick={() => openFile(file.rel)}
                className="focus-ring tactile -mx-3 flex flex-col gap-1 rounded-lg px-3 py-3 text-left hover:bg-accent/60"
              >
                <span className="flex items-center gap-2 text-heading">
                  <span className="min-w-0">
                    <Highlight text={file.title} query={query} />
                  </span>
                  {file.tag !== null && (
                    <span className="shrink-0 text-micro text-muted-foreground">{file.tag}</span>
                  )}
                </span>
                <span className="text-micro text-muted-foreground">{file.rel}</span>
              </button>
            ))}
            {docHits.map((hit) => (
              <button
                key={hit.rel}
                type="button"
                data-testid={`search-hit:${hit.rel}`}
                onClick={() => open(hit.rel)}
                className="focus-ring tactile -mx-3 flex flex-col gap-1 rounded-lg px-3 py-3 text-left hover:bg-accent/60"
              >
                <span className="flex items-center gap-2 text-heading">
                  {/* 강조 조각이 flex 항목으로 흩어져 gap 이 끼지 않게 한 줄로 묶는다 */}
                  <span className="min-w-0">
                    <Highlight text={hit.title} query={query} />
                  </span>
                </span>
                <span className="line-clamp-2 text-callout text-muted-foreground">
                  <Highlight text={hit.snippet.replace(/\n+/g, ' ')} query={query} />
                </span>
                <span className="text-micro text-muted-foreground">{hit.rel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
