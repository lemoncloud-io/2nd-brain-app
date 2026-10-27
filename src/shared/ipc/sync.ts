export const APP_CHANNELS_SYNC = {
  syncVault: 'vault:sync',
  shareEdits: 'vault:share-edits',
  getSyncState: 'vault:sync-state',
  syncChanged: 'vault:sync-changed'
} as const

/**
 * 팀 변경 받기 상태 — 레일과 설정이 같이 읽는다.
 * `received` = 마지막으로 받은 팀 변경 수, `conflicts` = 고르기를 기다리는 파일,
 * `at` = 마지막으로 받은 시각(ms), `error` = 받지 못한 사유(앱을 막지 않는다).
 */
export type ShareEditsResult =
  { ok: true; url: string; added: boolean } | { ok: false; reason: string }

export type SyncState = {
  received: number
  conflicts: string[]
  at: number | null
  error: string | null
  running: boolean
  /** 아직 팀에 올리지 않은 내 작업 수 — 읽을 때마다 보관함에서 센다 */
  ahead: number
  /** 안 올린 작업이 바꾼 파일 — 올리기 전에 무엇이 나가는지 보여 준다(자동 저장도 여기 잡힌다) */
  aheadFiles: string[]
  /** 앱 밖에서 새로 만들어 아직 한 번도 저장되지 않은 문서 — 사람이 고를 때만 확인 요청에 싣는다 */
  newDocs: string[]
  /** 팀에 올라왔는데 아직 안 받은 변경 수 — 앱이 살펴본(가져온) 것 기준, 읽을 때마다 센다 */
  behind: number
  /** 내 수정으로 열어 둔 팀 확인 요청 — `unsent` 는 거기에 아직 안 실린 새 작업 수. 없으면 null */
  shared: { url: string; unsent: number } | null
  /** 받지 않고 지나갔으면 그 사유 — 받았으면 null. 뜻은 `sync-service.ts` 의 `SyncSkip` */
  skipped:
    'no-remote' | 'signed-out' | 'review-pending' | 'busy' | 'stuck' | 'switch-blocked' | null
  /** 어제의 작업에 남아 있으면 그 작업 이름 — 화면은 "자세히" 안에서만 보여 준다 */
  held: string | null
  /** 마지막 받기가 팀 것에 맞춘 길 — 앞으로 감았는지·되감기했는지·합치기로 받았는지. 받지 않았으면 null */
  via: 'forward' | 'rewind' | 'merge' | null
}

export interface AppApiSync {
  /** 팀 변경 받기 — 버튼이 부른다. 앱도 시작·보관함 전환·위키화 직전·올리기 직전에 알아서 부른다 */
  syncVault(): Promise<SyncState>
  /** 안 올린 내 수정을 팀 확인 요청(PR)으로 보낸다 — 열어 둔 요청이 있으면 거기에 더한다 */
  /** include = 함께 보낼 새 문서(`SyncState.newDocs` 중 사람이 고른 것) */
  shareEdits(include?: string[]): Promise<ShareEditsResult>
  getSyncState(): Promise<SyncState>
  onSyncChanged(listener: (state: SyncState) => void): () => void
}
