// 페이지 한 장 읽기 — 리더와 근거 시트가 같이 쓴다. 디스크에서 바뀌면 다시 읽는다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WikiReadResult } from '../../../../shared/ipc-contract'
import {
  buildBacklinks,
  connectionsOf,
  type BacklinkEntry,
  type BacklinkSource,
  type Connection,
  type ConnectionIndex
} from '../../../../shared/wiki/backlinks'
import { createLinkResolver, type PageRef } from '../../../../shared/wiki/parse'
import { useWorkbench } from '../../store/workbench'
import { toUserError, type UserError } from '../../lib/user-error'
import { getT } from '../../lib/i18n'

interface SharedIndex {
  refs: PageRef[]
  map: ReturnType<typeof buildBacklinks>
  rels: Set<string>
  parts: ConnectionIndex
}

// 같은 목록 배열을 보는 훅이 여럿(리더·엿보기·오른쪽칸) — 통째 스캔은 배열마다 한 번.
// 키가 배열이라 목록이 바뀌면 옛 것은 가비지가 거둔다
const indexCache = new WeakMap<object, SharedIndex>()

const sharedIndex = (pages: BacklinkEntry[] | null): SharedIndex | null => {
  if (pages === null) return null
  const hit = indexCache.get(pages)
  if (hit) return hit
  const refs = pages.map((p) => ({ rel: p.rel, slug: p.slug }))
  const map = buildBacklinks(pages)
  const built: SharedIndex = {
    refs,
    map,
    rels: new Set(pages.map((p) => p.rel)),
    parts: {
      map,
      resolve: createLinkResolver(refs),
      titles: new Map(pages.map((p) => [p.rel, p.title]))
    }
  }
  indexCache.set(pages, built)
  return built
}

/** wikilink 해석용 페이지 목록 */
export const usePageIndex = (): PageRef[] => {
  const pages = useWorkbench((s) => s.pages)
  return useMemo(() => sharedIndex(pages)?.refs ?? [], [pages])
}

/**
 * 이 페이지를 가리키는 페이지 — main 이 push 한 위키 목록에서 매번 다시 파생한다(정본 하나).
 * 목록(`wiki/`)에 없는 문서(projects·raw 등)는 null — 그런 문서는 목록이 세지 않으니 "아직 없음" 이 거짓이 된다.
 */
export const useBacklinks = (rel: string | null): BacklinkSource[] | null => {
  const pages = useWorkbench((s) => s.pages)
  // 같은 배열을 보는 훅끼리 통째 스캔을 나눈다 — 배열마다 한 번(모듈 캐시)
  const index = useMemo(() => sharedIndex(pages), [pages])
  if (rel === null || index === null || !index.rels.has(rel)) return null
  return index.map.get(rel) ?? []
}

/** 이 페이지와 이어진 페이지(가리킨 곳·가리켜 온 곳) — 목록에 없는 문서는 빈 목록 */
export const useConnections = (rel: string | null): Connection[] => {
  const pages = useWorkbench((s) => s.pages)
  // 통째 스캔은 모듈 캐시가 배열마다 한 번 — 페이지 이동마다 다시 짓지 않는다
  const index = useMemo(() => sharedIndex(pages), [pages])
  return useMemo(
    () => (rel && pages && index ? connectionsOf(rel, pages, index.parts) : []),
    [rel, pages, index]
  )
}

export type WikiRead = {
  read: WikiReadResult | null
  error: UserError | null
  reload: () => void
}

export const useWikiRead = (rel: string | null): WikiRead => {
  const [state, setState] = useState<{
    rel: string | null
    read: WikiReadResult | null
    error: UserError | null
  }>({ rel: null, read: null, error: null })
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!rel) return
    let stale = false
    window.api
      .readWikiPage(rel)
      .then((result) => {
        if (stale) return
        setState(
          'error' in result
            ? { rel, read: null, error: toUserError(result.error, getT().wikiDoc.openFailed) }
            : { rel, read: result, error: null }
        )
      })
      .catch((e: unknown) => {
        if (!stale) setState({ rel, read: null, error: toUserError(e, getT().wikiDoc.openFailed) })
      })
    return () => {
      stale = true
    }
  }, [rel, version])

  // 빈 rels 는 상태 재확인 신호(볼트 폴더 삭제 등) — 열린 페이지도 다시 확인한다
  useEffect(() => {
    if (!rel) return
    return window.api.onWikiChanged((rels) => {
      if (rels.length === 0 || rels.includes(rel)) reload()
    })
  }, [rel, reload])

  // 다른 페이지로 넘어가는 동안 이전 페이지를 보이지 않는다
  return state.rel === rel
    ? { read: state.read, error: state.error, reload }
    : { read: null, error: null, reload }
}

// 리더는 제목을 따로 크게 그린다 — 본문 첫 줄이 같은 `# 제목` 이면 두 번 보이지 않게 뺀다
export const withoutTitleHeading = (body: string, title: string): string => {
  const match = /^\s*#\s+(.+?)\s*(?:\n|$)/.exec(body)
  return match && match[1] === title ? body.slice(match[0].length) : body
}

/**
 * 원문 줄 번호 위치로 스크롤 — 미리보기는 줄→DOM 대응이 없어 비율로 근사한다.
 * Lint 줄 번호는 원문 기준, 리더는 frontmatter 를 뺀 본문을 그린다 — 앞부분 줄 수만큼 당긴다.
 */
export const scrollToSourceLine = (el: HTMLElement, read: WikiReadResult, line: number): void => {
  const total = read.page.body.split('\n').length
  const offset = read.text.split('\n').length - total
  const target = Math.max(1, line - offset)
  el.scrollTop = Math.max(
    0,
    ((target - 1) / Math.max(total - 1, 1)) * (el.scrollHeight - el.clientHeight)
  )
}
