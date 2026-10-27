// 웹 view 자리 계산 — 렌더러가 보낸 CSS px 사각형을 검사하고 창 좌표로 옮긴다(순수 함수).
import type { WebRect } from '../../shared/ipc-contract'

/** 사각형이 화면에 쓸 수 있는 값인가 — 렌더러에서 온 값이다 */
export const validRect = (rect: unknown): rect is WebRect => {
  if (typeof rect !== 'object' || rect === null) return false
  const { x, y, width, height } = rect as Record<string, unknown>
  return [x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
}

/** CSS px 사각형을 창 좌표로 — 메뉴 확대(⌘+)로 렌더러 배율이 바뀌면 그만큼 곱한다 */
export const scaleRect = (rect: WebRect, zoom: number): WebRect => ({
  x: Math.round(rect.x * zoom),
  y: Math.round(rect.y * zoom),
  width: Math.round(rect.width * zoom),
  height: Math.round(rect.height * zoom)
})
