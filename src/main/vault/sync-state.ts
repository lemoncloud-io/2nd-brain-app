// 받기 결과의 화면 상태 — 마지막 결과 + 안 올린 작업 수. 수는 기억하지 않고 매번 센다.
// 세는 일은 git 을 기다린다. 기다리는 사이 받기가 끝날 수 있으므로, 센 수는 기다린 뒤의 **지금** 상태에 얹는다 —
// 기다리기 전 상태를 펼쳐 두면 끝난 받기를 "받는 중" 으로 되돌려 쓴다.
import type { SyncState } from '../../shared/ipc-contract'
import { mainT } from '../i18n'

/**
 * 올리기 직전 받기 결과가 올리기를 막는가 — 받지 못했으면 올려도 거절되고, 고르기 대기 중이면 고르기 전 상태가 올라간다
 */
export const pushBlockedReason = (state: SyncState): string | null => {
  if (state.error) return state.error
  if (state.conflicts.length > 0) return mainT().syncMain.pushConflict
  if (state.skipped === 'stuck' || state.skipped === 'switch-blocked') {
    return mainT().syncMain.pushStuck
  }
  return null
}

export type SyncCounts = Pick<SyncState, 'ahead' | 'aheadFiles' | 'newDocs' | 'behind' | 'shared'>

export const IDLE_SYNC: SyncState = {
  received: 0,
  conflicts: [],
  at: null,
  error: null,
  running: false,
  ahead: 0,
  aheadFiles: [],
  newDocs: [],
  behind: 0,
  shared: null,
  skipped: null,
  held: null,
  via: null
}

export type SyncStateStore = {
  current: () => SyncState
  /** 바뀐 필드를 얹고 수를 다시 세어 화면에 보낸다 */
  patch: (fields: Partial<Omit<SyncState, keyof SyncCounts>>) => Promise<SyncState>
  /** 수만 다시 센다 — 보내지 않는다 */
  recount: () => Promise<SyncState>
  /** 보관함이 바뀌었다 — 이전 결과를 버리고 바로 보낸다 */
  reset: () => void
}

export const createSyncStateStore = (deps: {
  count: () => Promise<SyncCounts>
  /** 지금 팀 저장소가 붙어 있는가 — 앱 밖(터미널·Obsidian)에서 붙이면 마지막 받기의 "연결 안 됨" 이 낡는다 */
  hasRemote?: () => boolean
  send: (state: SyncState) => void
}): SyncStateStore => {
  let state = IDLE_SYNC
  // 늦게 시작한 세기가 먼저 끝났으면 먼저 시작한 세기의 결과는 버린다 — 옛 수가 새 수를 덮지 않게
  let started = 0
  let applied = 0
  const recount = async (): Promise<SyncState> => {
    const mine = ++started
    let counts: SyncCounts
    try {
      counts = await deps.count()
    } catch (error) {
      // 못 세면 지난 수를 둔다 — 받기 결과를 보내는 일까지 멈추지 않게
      console.error('could not count unpushed work', error)
      return state
    }
    if (mine > applied) {
      applied = mine
      state = { ...state, ...counts }
    }
    // 남겨 두면 새 변경 수를 말하면서 단추는 연결하러 보낸다
    if (state.skipped === 'no-remote' && deps.hasRemote?.()) state = { ...state, skipped: null }
    return state
  }
  return {
    current: () => state,
    patch: async (fields) => {
      state = { ...state, ...fields }
      await recount()
      deps.send(state)
      return state
    },
    recount,
    reset: () => {
      // 옛 보관함을 세던 것은 버린다
      applied = started
      state = IDLE_SYNC
      deps.send(state)
    }
  }
}

/** 보관함별 스토어 — 같은 보관함은 같은 스토어, 다른 보관함은 따로 논다 */
export const createSyncStoreRegistry = (
  create: (_vaultDir: string) => SyncStateStore
): { store: (vaultDir: string) => SyncStateStore } => {
  const stores = new Map<string, SyncStateStore>()
  return {
    store: (vaultDir: string): SyncStateStore => {
      const existing = stores.get(vaultDir)
      if (existing) return existing
      const created = create(vaultDir)
      stores.set(vaultDir, created)
      return created
    }
  }
}
