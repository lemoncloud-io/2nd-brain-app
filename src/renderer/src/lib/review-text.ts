// 승인 화면 문구 — 확인 바·목록 위 줄·결과 카드가 같은 문장을 쓴다. 고정 문장은 사전(`t.review`), 여기는 인자로 짓는 것만.
// 되돌릴 수 있는 기한(`t.review.undoWindow`)은 `main/review/review-service.ts` `undoMerge` 가 정한다 — 기본 줄기의 마지막 기록이
// 이 넣기여야 되돌린다. 날짜 기한은 없다. 올리기(`approveUpload`·`teamReview`)는 `review/team-share.ts` `publishApproved`
import { getT } from './i18n'

/** 사유가 이미 "GitHub에 올리지 못했어요 — …" 로 시작하면 그 머리는 한 번만 말한다 */
export const publishFailedText = (reason: string): string => {
  const t = getT().review
  const rest = reason.startsWith(t.publishFailedHead)
    ? reason.slice(t.publishFailedHead.length).replace(/^ — /, '')
    : reason
  return t.publishFailed(rest)
}

/** 이번 승인에서 `읽기` 로 열어 본 페이지 수 — 읽지 않고 한 번에 넣는 것을 눈에 보이게 한다 */
export const readCountText = (read: number, total: number): string =>
  getT().review.readCount(read, total)
