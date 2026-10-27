import type { EngineEvent } from './engine'

export const APP_CHANNELS_CLIP_INGEST = {
  clipFile: 'clip:file',
  clipUrl: 'clip:url',
  startIngest: 'ingest:start',
  cancelIngest: 'ingest:cancel',
  ingestEvent: 'ingest:event',
  ingestQueue: 'ingest:queue',
  activityChanged: 'activity:changed'
} as const

export type AddResult = { ok: true; path: string } | { ok: false; reason: string }

/** 클리핑으로 받는 파일 — 거절 문구·드롭 안내·파일 고르기 필터가 전부 이 목록에서 나온다 */
export const CLIP_TEXT_TYPES = ['.md', '.markdown', '.txt']
/** 글자를 뽑아 .md 로 바꿔 넣는 문서 */
export const CLIP_DOCUMENT_TYPES = ['.pdf', '.hwpx', '.hwp', '.xlsx', '.docx', '.pptx']
export const CLIP_FILE_TYPES = [...CLIP_TEXT_TYPES, ...CLIP_DOCUMENT_TYPES]

export type IngestOutcome =
  | { status: 'succeeded'; branch: string }
  | { status: 'canceled' | 'failed'; reason: string }
  /** 위키화 직전 팀 받기가 실패했다 — 동기화 없이 시작할지 다시 받을지 사람이 고른다 */
  | { status: 'sync-needed'; reason: string }

/** 위키화 큐 항목 상태 — 마지막 실행 기록용. 화면 표시는 후속에서 붙인다 */
export type IngestQueueStatus =
  'pending' | 'processing' | 'done' | 'skipped' | 'empty' | 'failed' | 'canceled'

export type QueuedIngestItem = {
  clippingName: string
  rawName: string
  sha: string
  status: IngestQueueStatus
  attempts: number
  updatedAt: number
}

export interface AppApiClipIngest {
  clipFile(srcPath: string): Promise<AddResult>
  clipUrl(url: string): Promise<AddResult>
  startIngest(opts?: { skipSync?: boolean }): Promise<IngestOutcome>
  cancelIngest(): Promise<void>
  /** 마지막 위키화 실행의 항목별 상태 — 진행 중 죽으면 pending/processing 이 남는다 */
  getIngestQueue(): Promise<QueuedIngestItem[]>
  /** 진행 이벤트 구독. 반환 함수로 해제한다. */
  onIngestEvent(listener: (event: EngineEvent) => void): () => void
  /** 볼트 활동(위키화·확정 등) 시작·종료 푸시. 반환 함수로 해제한다. */
  onActivityChanged(listener: (running: boolean) => void): () => void
}
