import type { VaultChangeMap } from '../vault-changes'
import type { CreateTeamRepoResult, InviteResult } from './github'

export const APP_CHANNELS_VAULT = {
  getVaultStatus: 'vault:get-status',
  createVault: 'vault:create',
  openVault: 'vault:open',
  openVaultInNewWindow: 'vault:open-in-new-window',
  openVaultRecent: 'vault:open-recent',
  adoptVault: 'vault:adopt',
  adoptPreview: 'vault:adopt-preview',
  importVault: 'vault:import',
  readConflict: 'vault:read-conflict',
  resolveConflict: 'vault:resolve-conflict',
  getJourney: 'vault:get-journey',
  getVaultChanges: 'vault:get-changes',
  restoreVault: 'vault:restore',
  getRemote: 'remote:get',
  connectRemote: 'remote:connect',
  pushRemote: 'remote:push',
  disconnectRemote: 'remote:disconnect',
  createTeamRepo: 'remote:create-team-repo',
  inviteMember: 'remote:invite-member',
  joinTeamVault: 'vault:join-team',
  createStarterVault: 'vault:create-from-template'
} as const

export type VaultStatus = {
  vaultDir: string | null
  valid: boolean
  missing: string[]
  /** full = 뼈대 보관함, generic = Obsidian任意 폴더(읽기 중심). 없으면 full 취급 */
  kind?: 'full' | 'generic'
  /** 최근에 연 보관함 — 빠른 전환이 쓴다. 맨 앞이 가장 최근 */
  recentVaults?: string[]
  /** 방금 요청한 열기·만들기가 실패한 사유 */
  error?: string
  /** 방금 고른 폴더가 보관함은 아니지만 노트가 있다 — 그대로 두고 보관함으로 쓸 수 있다 */
  adoptable?: { dir: string; notes: number }
  /** 방금 폴더를 보관함으로 삼았다 — 대기함에 넣은 노트 수와, 뼈대와 이름이 같아 그 사람 것을 둔 파일 */
  adopted?: { queued: number; kept: string[] }
  /** 방금 첫 실행 보관함을 만들었다 — template = 내 GitHub 에 템플릿으로, skeleton = 앱 뼈대 + 내 GitHub, local = 이 컴퓨터에만 */
  starter?: { via: 'template' | 'skeleton' | 'local'; repo?: string; publishError?: string }
}

/** 첫 실행 체크리스트의 볼트 쪽 진행 — Clippings 에 쌓인 자료 수, 위키화한 적 있음, 승인해 병합한 적 있음 */
export type Journey = { clippings: number; ingested: boolean; merged: boolean }

/** 같은 문서를 둘이 고쳤을 때 나란히 보여 줄 두 내용 — 한쪽이 지웠으면 그쪽은 null */
export type ConflictSides = { path: string; team: string | null; mine: string | null }

/** 보관함 문서 한 줄 — ⌘K 가 제목을 읽는 모양 */
export type VaultDocEntry = { rel: string; title: string }

/**
 * 연결한 팀 저장소(GitHub) — 연결 안 됐으면 null.
 * `public` 은 로그인 없이 그 저장소가 보이는지 확인한 결과다 — 확인하지 못했으면 없다.
 */
export type RemoteStatus = { url: string; webUrl: string; public?: boolean } | null

export type PushResult = { ok: true } | { ok: false; reason: string }

/**
 * 보관함 상태 되돌리기 결과 — 파일은 보관함 상대 경로.
 * carried = 앱에서 고쳐 두었다가 기본 줄기로 챙겨 온 문서 · awaiting = 팀이 받아들일 때까지 안 보이는 문서.
 * confirm 은 아직 떠나지 않았다 — 사람이 보고 다시 눌러야 떠난다.
 */
export type RestoreResult =
  | { status: 'done' | 'confirm'; carried: string[]; awaiting: string[] }
  | { status: 'refused'; reason: string }

export interface AppApiVault {
  getVaultStatus(): Promise<VaultStatus>
  /** template = src/shared/vault-templates.ts 의 id, 없으면 뼈대 그대로 */
  createVault(template?: string): Promise<VaultStatus>
  /**
   * 첫 실행 보관함 — 사람이 폴더를 고르지 않고 기본 위치에 만들어 연다. github 면 로그인 계정에 비공개 저장소를
   * 템플릿으로 만들어 받고, 아니면(나중에 하기) 앱 뼈대로 이 컴퓨터에만. pickParent 면 둘 곳을 먼저 고른다
   */
  createStarterVault(opts: { github: boolean; pickParent?: boolean }): Promise<VaultStatus>
  openVault(): Promise<VaultStatus>
  /** 고른 보관함을 새 창에 연다 — 지금 창의 보관함·설정은 그대로. 취소하면 opened false */
  openVaultInNewWindow(): Promise<{ opened: boolean; error?: string }>
  /** 최근 보관함으로 전환 — 목록 안의 폴더만 받는다 */
  openVaultRecent(dir: string): Promise<VaultStatus>
  /** 방금 열기에서 고른 폴더를 그대로 두고 보관함으로 쓴다 — 뼈대를 더하고 노트 사본을 대기함에 넣는다 */
  adoptVault(): Promise<VaultStatus>
  /** 보관함으로 쓰기 미리보기 — 더해질 파일·그대로 둘 파일·노트 수. 후보가 없으면 null */
  adoptPreview(): Promise<{ add: string[]; kept: string[]; notes: number } | null>
  /** 팀 보관함에 들어가기 — 주소를 받아 받을 곳을 고르고 clone 한 뒤 연다 */
  importVault(url: string): Promise<VaultStatus>
  /** 고르기를 기다리는 문서의 두 내용 — 팀 것과 내 것 */
  readConflict(path: string): Promise<ConflictSides | { error: string }>
  /** 한 문서의 고르기를 끝낸다. 고르지 않은 쪽은 옆에 남는다 */
  resolveConflict(
    path: string,
    pick: 'team' | 'mine'
  ): Promise<{ ok: true; remaining: string[] } | { ok: false; reason: string }>
  /** 첫 실행 체크리스트 진행 — 볼트가 없거나 볼트가 아니면 null */
  getJourney(): Promise<Journey | null>
  /**
   * 보관함에서 바뀐·새로 생긴 파일 — 경로마다 뜻 하나. 트리 배지가 쓴다.
   * git 기록이 없는 보관함이나 읽기 실패는 빈 맵이다(배지를 안 그린다)
   */
  getVaultChanges(): Promise<VaultChangeMap>
  getRemote(): Promise<RemoteStatus>
  /** GitHub 저장소 주소를 볼트에 연결하고 바로 올린다. 주소가 GitHub 저장소가 아니면 올리지 않고 사유 */
  connectRemote(url: string): Promise<PushResult>
  /**
   * 보관함을 기본 줄기로 되돌린다 — 앱이 남긴 편집은 챙겨 오고, 팀이 확인 중인 작업이 있으면
   * `confirmed` 없이는 떠나지 않고 무엇이 잠시 안 보이게 되는지 돌려준다
   */
  restoreVault(confirmed: boolean): Promise<RestoreResult>
  /** 승인해 병합된 기본 브랜치를 GitHub 로 올린다 */
  pushRemote(): Promise<PushResult>
  /** 이 컴퓨터의 GitHub 연결만 지운다 — 이미 올라간 것은 GitHub 에 남는다 */
  disconnectRemote(): Promise<RemoteStatus>
  /** 비공개 팀 저장소를 만들고(`org` null = 내 계정) 열린 보관함을 연결해 첫 올리기까지 한다 */
  createTeamRepo(org: string | null, name: string): Promise<CreateTeamRepoResult>
  /** 연결한 팀 저장소에 팀원을 GitHub 아이디로 초대한다 */
  inviteMember(username: string): Promise<InviteResult>
  /**
   * 팀 보관함을 받아 연다 — `invitationId` 가 있으면 초대를 먼저 수락한다. 받아 둘 곳은 사람이 창에서 고른다.
   * 주소 붙여 넣기(`importVault`)와 같은 길이다
   */
  joinTeamVault(url: string, invitationId?: number): Promise<VaultStatus>
}
