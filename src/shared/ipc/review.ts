import type { TeamReview } from './github'

export const APP_CHANNELS_REVIEW = {
  listReview: 'review:list',
  finalizeReview: 'review:finalize',
  undoMerge: 'review:undo-merge',
  listReviewItems: 'review-items:list',
  dismissReviewItem: 'review-items:dismiss',
  listDismissedReviewItems: 'review-items:list-dismissed',
  restoreReviewItem: 'review-items:restore'
} as const

export type ReviewItemSource = 'ai-lint' | 'verify'

/** 승인 탭 검토 항목(슬라이스 12) — AI 점검 발견·확정 검증 결함 */
export type ReviewItem = {
  /** source·kind·rel·title 해시 — 같은 발견은 같은 id 라 무시 상태가 유지된다 */
  id: string
  source: ReviewItemSource
  kind: string
  title: string
  detail: string
  rel: string | null
  createdAt: number
  dismissed: boolean
}

export type ReviewPage = { path: string; slug: string; status: 'added' | 'modified' }

/** 페이지가 아닌 변경(INDEX·topics·raw·run-log 등). status 는 git name-status 머리글자, from 은 R/C 의 원래 경로. */
export type ReviewChange = { path: string; status: string; from?: string }

export type ReviewListing = {
  branch: string
  defaultBranch: string
  pages: ReviewPage[]
  others: ReviewChange[]
}

export type FinalizeOutcome =
  | {
      status: 'merged'
      branch: string
      rejected: string[]
      /** 팀 저장소에 열린 확인 — 팀 저장소가 없으면 null */
      teamReview: TeamReview | null
      /** 내 위키에는 들어갔지만 팀에 보내지 못한 사유 — 보냈으면 null */
      shareError: string | null
      /** 혼자 쓰는 내 저장소에 기본 줄기를 올렸으면 그 웹 주소 — 아니면 null */
      published: string | null
      /** 혼자 쓰는 내 저장소에 올리지 못한 사유 — 승인은 그대로 끝났다 */
      publishError: string | null
    }
  | { status: 'verify-failed'; defects: string[] }
  | { status: 'failed'; reason: string }

export type UndoMergeOutcome =
  { status: 'undone'; branch: string } | { status: 'failed'; reason: string }

export interface AppApiReview {
  /** idle: 위키화 결과가 없다 — 오류가 아니라 빈 상태로 그린다 */
  listReview(): Promise<ReviewListing | { error: string; idle?: true }>
  /** 거절할 페이지 경로를 넘긴다. 나머지는 승인이다. */
  finalizeReview(rejectedPaths: string[]): Promise<FinalizeOutcome>
  /** 방금 병합한 작업 브랜치를 승인 대기로 되돌린다 — 병합 뒤 기본 브랜치에 커밋이 쌓였으면 거절 */
  undoMerge(branch: string): Promise<UndoMergeOutcome>
  /** 검토 항목 — 무시하지 않은 것, 들어온 순 (슬라이스 12) */
  listReviewItems(): Promise<ReviewItem[]>
  /** 무시 — 볼트별로 저장돼 다시 켜도, 같은 발견이 다시 들어와도 유지된다 */
  dismissReviewItem(id: string): Promise<boolean>
  /** 무시한 검토 항목 — 되돌리기 목록에 쓴다 */
  listDismissedReviewItems(): Promise<ReviewItem[]>
  /** 무시를 취소한다 */
  restoreReviewItem(id: string): Promise<boolean>
}
