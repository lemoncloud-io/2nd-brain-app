import type { LintReport } from '../wiki/lint'
import type { SearchHit } from '../wiki/search'
import type { EngineEvent } from './engine'

export const APP_CHANNELS_LINT = {
  searchWiki: 'wiki:search',
  lintWiki: 'wiki:lint',
  lintAiPages: 'lint:ai-pages',
  lintAiRun: 'lint:ai-run',
  lintAiCancel: 'lint:ai-cancel',
  lintAiEvent: 'lint:ai-event',
  mergePropose: 'merge:propose',
  mergeCancel: 'merge:cancel',
  mergeApply: 'merge:apply',
  mergeUndo: 'merge:undo'
} as const

// AI 점검(슬라이스 13) — 모델 블록 답변의 파싱 결과
export type SemanticKind =
  'contradiction' | 'outdated' | 'missing-page' | 'suggestion' | 'duplicate'

export type SemanticFinding = {
  kind: SemanticKind
  severity: string
  title: string
  rel: string
  /** duplicate 만 — 같은 개념을 다루는 두 번째 페이지 */
  rel2?: string
  detail: string
}

/** 합치기 한쪽 — 받을 때 해시로 그사이 바뀌지 않았는지 본다 */
export type MergeSide = { rel: string; title: string; text: string; hash: string }

/** 중복 합치기 제안 전 — 남길·지울 페이지와 링크를 고칠 문서(고칠 곳 수) */
export type MergeDraft = {
  keep: MergeSide
  drop: MergeSide
  edits: { rel: string; count: number }[]
}

/** 합치기 제안 — 위 + 엔진이 합친 본문 */
export type MergeProposal = MergeDraft & { body: string }

export type MergeApplyResult = { ok: true; commit: string; edited: number } | { error: string }

export type SemanticLintResult =
  | { status: 'found'; findings: SemanticFinding[] }
  | { status: 'clean' }
  | { status: 'unparsed'; reason: string }

export interface AppApiLint {
  /** 키워드(BM25) 검색 — 제목 가중·한글 부분 일치 */
  searchWiki(query: string, limit?: number): Promise<SearchHit[] | { error: string }>
  /** 구조 lint + vault_verify --lane none (슬라이스 09) */
  lintWiki(): Promise<LintReport | { error: string }>
  lintAiPages(): Promise<number>
  lintAiRun(): Promise<SemanticLintResult>
  lintAiCancel(): Promise<void>
  /** 중복 합치기 제안 — 두 페이지를 읽어 남길 쪽을 고르고 엔진이 합친 본문을 받는다. 파일은 쓰지 않는다 */
  mergePropose(relA: string, relB: string): Promise<MergeProposal | { error: string }>
  mergeCancel(): Promise<void>
  /** 제안을 받는다 — `edit: merge …` 커밋 하나. 해시는 제안을 받은 때의 두 페이지 */
  mergeApply(input: {
    keep: string
    drop: string
    body: string
    keepHash: string
    dropHash: string
  }): Promise<MergeApplyResult>
  /** 방금 합친 것을 되돌린다 — 그 커밋이 아직 맨 위일 때만 */
  mergeUndo(commit: string): Promise<{ ok: true } | { error: string }>
  /** AI 점검 진행 이벤트 구독 — 위키화와 같은 EngineEvent. 반환 함수로 해제한다. */
  onLintAiEvent(listener: (event: EngineEvent) => void): () => void
}
