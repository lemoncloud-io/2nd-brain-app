// 보관함 파일 미리보기(`views/sources-*`) — 문구는 사전(`t.preview`), 여기는 상태로 고르는 것만. 링크 호버 미리보기는 `preview-text.ts`.
import { getT } from './i18n'

/** 그림 배율 표시 — 맞춤이면 "맞춤", 아니면 "125%" */
export const zoomLabel = (zoom: 'fit' | number): string =>
  zoom === 'fit' ? getT().preview.zoomFit : `${Math.round(zoom)}%`

/** 워드·파워포인트 미리보기(`vault://…?preview`) 응답 상태 → 무엇이 안 됐는지 + 다음 할 일 */
export const officeFailure = (status: number): string => {
  const t = getT().preview
  if (status === 413) return t.officeTooLarge
  if (status === 404) return t.officeNotFound
  return t.officeUnreadable
}
