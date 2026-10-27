// 지식 관리에 쌓인 것 — 사이드바 배지의 수와 그 풀이, 지식 관리 구역 탭의 수.
import { useEffect } from 'react'
import { create } from 'zustand'
import { useSetup } from '../hooks/use-setup'
import { getT } from './i18n'

/**
 * 승인 대기(승인 구역) · 검토 항목(점검 구역) · 위키 초안을 기다리는 자료(자료 구역).
 * 셋 다 눌러서 간 자리에 그 수가 있어야 한다 — 점검(lint)은 돌려야 나오는 수라 여기 없다.
 */
export type KnowledgeCounts = { approvals: number; items: number; clippings: number }

export const knowledgeBadge = (counts: KnowledgeCounts): number =>
  counts.approvals + counts.items + counts.clippings

/**
 * 배지 수의 풀이 — 보이는 글자로 둔다. 대면 뜨는 설명(title)은 키보드·터치로는 못 읽는다.
 * 없는 것은 빼고, 승인 대기가 맨 앞이다(사람 손을 기다리는 일)
 */
export const knowledgeBadgeLabel = (counts: KnowledgeCounts): string =>
  [
    [getT().library.badgeApprovals, counts.approvals],
    [getT().library.badgeItems, counts.items],
    [getT().library.badgeClippings, counts.clippings]
  ]
    .filter(([, n]) => (n as number) > 0)
    .map(([label, n]) => `${label} ${n}`)
    .join(' · ')

/** 세어 둔 수 — 사이드바와 지식 관리 탭이 같은 값을 읽는다(한쪽만 늦게 세어 어긋나지 않게) */
const usePending = create<{ approvals: number; items: number }>(() => ({ approvals: 0, items: 0 }))

/**
 * 세는 일 — 승인 대기와 검토 항목은 저장된 목록이라 싸다(검토 항목은 '빠진 페이지' 항목이 남아 있을 때만
 * 페이지 목록을 한 번 더 훑어 정리한다). 위키가 바뀔 때마다 다시 센다
 */
const count = (): void => {
  window.api
    .listReview()
    .then((result) =>
      usePending.setState({ approvals: 'error' in result ? 0 : result.pages.length })
    )
    .catch(console.error)
  window.api
    .listReviewItems()
    .then((items) => usePending.setState({ items: items.filter((item) => !item.dismissed).length }))
    .catch(console.error)
}

// 보는 쪽이 몇이든 세기와 구독은 하나 — 첫 구독자가 걸고 마지막이 푼다
let watchers = 0
let unwatch: (() => void) | null = null
const watch = (): (() => void) => {
  watchers += 1
  if (watchers === 1) {
    count()
    unwatch = window.api.onWikiChanged(() => count())
  }
  return () => {
    watchers -= 1
    if (watchers === 0) {
      unwatch?.()
      unwatch = null
    }
  }
}

/** 지식 관리에 쌓인 수 — 자료 수는 준비 상태가 이미 센다 */
export const useKnowledgeCounts = (): KnowledgeCounts => {
  const setup = useSetup()
  const approvals = usePending((s) => s.approvals)
  const items = usePending((s) => s.items)
  useEffect(watch, [])
  return { approvals, items, clippings: setup.journey?.clippings ?? 0 }
}
