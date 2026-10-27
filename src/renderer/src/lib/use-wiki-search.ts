// 위키 키워드 검색 호출 규칙 한 곳 — 검색 뷰와 ⌘K 팔레트가 같은 훅을 쓴다.
// 타자는 150ms 디바운스, 요청마다 번호를 매겨 늦게 온 이전 질의 응답은 버린다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchHit } from '../../../shared/wiki/search'
import { toUserError, type UserError } from './user-error'
import { getT } from './i18n'

const DEBOUNCE_MS = 150
const LIMIT = 20

export type WikiSearch = {
  /** 마지막 응답 — 빈 질의·오류면 null */
  hits: SearchHit[] | null
  /** `hits` 가 어느 질의의 답인가 — 입력이 바뀐 뒤 아직 안 온 동안 옛 결과를 가려낼 때 */
  hitsFor: string
  /** 응답을 한 번이라도 받았나 — "없다" 안내는 이게 참일 때만 */
  searched: boolean
  error: UserError | null
  pending: boolean
  /** 지금 바로 돌린다 — 다시 찾기·밖에서 넘어온 질의 */
  run: (query: string) => Promise<void>
  /** 타자 — 150ms 뒤 돌린다. 빈 질의는 결과를 비운다 */
  schedule: (query: string) => void
}

export const useWikiSearch = (): WikiSearch => {
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [hitsFor, setHitsFor] = useState('')
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<UserError | null>(null)
  const [pending, setPending] = useState(false)
  const seq = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  const run = useCallback(async (query: string): Promise<void> => {
    const id = ++seq.current
    if (!query.trim()) {
      setHits(null)
      setSearched(false)
      setError(null)
      setPending(false)
      return
    }
    setPending(true)
    try {
      const result = await window.api.searchWiki(query, LIMIT)
      if (id !== seq.current) return
      if ('error' in result) {
        setError(toUserError(result.error, getT().errors.searchFailed))
        setHits(null)
      } else {
        setError(null)
        setHits(result)
        setHitsFor(query)
        setSearched(true)
      }
    } catch (e) {
      if (id === seq.current) {
        setError(toUserError(e, getT().errors.searchFailed))
        setHits(null)
      }
    } finally {
      if (id === seq.current) setPending(false)
    }
  }, [])

  const schedule = useCallback(
    (query: string): void => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void run(query), DEBOUNCE_MS)
    },
    [run]
  )

  // 언마운트 뒤 도착하는 응답·타이머는 버린다
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      seq.current++
    },
    []
  )

  return { hits, hitsFor, searched, error, pending, run, schedule }
}
