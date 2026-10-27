// 찾기의 총계·지금 자리 — 그려진 <mark data-hit> 를 화면 순서로 센다(접힌 블록은 그려지지 않으니 저절로 빠진다).
// `data-current` 는 React 가 모르는 속성이라 여기서 붙였다 떼도 다음 렌더가 지우지 않는다 — 노드 구조는 건드리지 않는다.

const hits = (root: ParentNode): NodeListOf<HTMLElement> =>
  root.querySelectorAll<HTMLElement>('mark[data-hit]')

/** 그려진 일치 수 */
export const countHits = (root: ParentNode): number => hits(root).length

/** 자리를 총계 안으로 접는다 — clamp 는 여기 한 곳 */
export const clampHit = (at: number, total: number): number =>
  total === 0 ? 0 : Math.min(Math.max(at, 0), total - 1)

/**
 * `at` 번째(0부터) 일치에 data-current 를 두고, `scroll` 이면 그 자리로 간다.
 * 접힘·바뀐 곳 토글로 본문이 다시 그려질 때는 표시만 되살리고 스크롤하지 않는다 — 읽던 자리가 튀지 않게
 */
export function markCurrentHit(root: ParentNode, at: number, scroll = true): void {
  const all = hits(root)
  const shown = clampHit(at, all.length)
  all.forEach((el, i) => {
    if (i !== shown) {
      el.removeAttribute('data-current')
      return
    }
    el.setAttribute('data-current', '')
    // jsdom 에는 없다
    if (scroll) el.scrollIntoView?.({ block: 'center' })
  })
}
