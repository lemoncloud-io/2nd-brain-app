// 팀 변경 받기 배선 — 앱이 알아서 받는 네 시점(앱 시작·보관함 전환·위키화 직전·올리기 직전)과
// 사람이 누르는 받기 버튼이 같은 `syncVault()` 를 탄다. 마지막 결과는 보관함마다 들고 있는다.
// 그 사이에는 살펴보기만 한다(`watchTeam`) — 팀에 새 변경이 몇 건 있는지 알리고, 받기는 사람이 누른다
import { app, BrowserWindow, ipcMain, net } from 'electron'
import { APP_CHANNELS, type ShareEditsResult, type SyncState } from '../../shared/ipc-contract'
import { createPullRequest, pullRequestOpen } from '../github/pull-request'
import { editShareState, shareEdits } from '../review/edit-share'
import { checkVisibility, pushBranchAs, readRemote } from '../vault/remote-service'
import { createSyncStateStore, createSyncStoreRegistry, IDLE_SYNC } from '../vault/sync-state'
import { requireFullVault } from '../vault/vault-service'
import {
  commitNewDocs,
  conflictSides,
  newDocs,
  resolveConflict,
  syncVault,
  lookForTeamChanges,
  unpushedCount,
  unpushedFiles,
  unreceivedCount
} from '../vault/sync-service'
import { currentVaultDir, isVaultOpen } from './clip-handlers'
import { withVaultGit } from '../vault/vault-queue'
import { githubToken } from './github-handlers'
import { sendToVault } from './broadcast'
import { bindings } from '../window/window-vaults'
import { loadSettings } from '../settings'
import { dockBadge } from '../window/quit-guard'
import { notifyVaultSwitched } from './wiki-handlers'
import { mainT } from '../i18n'

// 진행 중인 받기 — 보관함마다. 겹쳐 부른 쪽은 건너뛰지 않고 같은 실행에 합류한다.
// "먼저 받아 두고 시작" 하려는 자리(위키화·올리기 직전)가 앱 시작 받기와 겹쳐도 옛 상태로 가지 않게.
const inflights = new Map<string, Promise<SyncState>>()

/** Dock 배지는 앞에 있는 창의 보관함을 따른다 — 앞에 창이 없으면 그대로 둔다 */
const badgeVault = (): string | null => {
  const focused = BrowserWindow.getFocusedWindow()
  if (!focused || focused.isDestroyed()) return null
  return (
    bindings.dirFor(focused.webContents.id) ??
    loadSettings(app.getPath('userData')).vaultDir ??
    null
  )
}

/** 안 올린 작업 수는 기억하지 않고 보관함에서 센다 — 편집·승인·올리기 어느 쪽으로 바뀌어도 맞는다 */
const stores = createSyncStoreRegistry((vaultDir) =>
  createSyncStateStore({
    count: async () => {
      const [ahead, aheadFiles, fresh, behind] = await Promise.all([
        unpushedCount(vaultDir),
        unpushedFiles(vaultDir),
        newDocs(vaultDir),
        unreceivedCount(vaultDir)
      ])
      return {
        ahead,
        aheadFiles,
        newDocs: fresh,
        behind,
        shared: await editShareState(vaultDir, ahead)
      }
    },
    hasRemote: () => readRemote(vaultDir) !== null,
    send: (next) => {
      sendToVault(vaultDir, APP_CHANNELS.syncChanged, next)
      // 창을 닫아 숨겨도 팀 살펴보기는 돈다 — 받을 변경 수를 Dock 에 띄우고, 받으면(0) 지운다
      if (process.platform === 'darwin' && vaultDir === badgeVault())
        app.dock?.setBadge(dockBadge(next.behind))
    }
  })
)

/** 보관함 전환 — 그 보관함의 받기 자리를 비워 곧바로 받을 수 있게 한다.
 *  옛 보관함 받기는 끝까지 가되 결과는 버린다(receive 가드) */
export const detachInflightSync = (vaultDir: string): void => {
  inflights.delete(vaultDir)
}

/** 네 시점과 버튼이 모두 부른다. 겹쳐 부르면 진행 중인 받기에 합류한다.
 *  합류하면 먼저 시작한 쪽의 가져오기 상한을 따른다 — 뒤에 붙은 fetchTimeoutMs 는 그때 못 바꾼다 */
export const runSync = (
  opts: { fetchTimeoutMs?: number } = {},
  vaultDir?: string
): Promise<SyncState> => {
  const dir = vaultDir ?? currentVaultDir()
  if (!dir) return Promise.resolve({ ...IDLE_SYNC })
  // generic 폴더에는 팀 저장소가 없다 — 살펴보기·받기 모두 조용히 건너뛴다
  if (requireFullVault(dir)) return Promise.resolve(stores.store(dir).current())
  const inflight = inflights.get(dir)
  if (inflight) return inflight
  const run = receive(dir, opts).finally(() => {
    if (inflights.get(dir) === run) inflights.delete(dir)
  })
  inflights.set(dir, run)
  return run
}

const receive = async (
  vaultDir: string,
  opts: { fetchTimeoutMs?: number } = {}
): Promise<SyncState> => {
  const store = stores.store(vaultDir)
  await store.patch({ running: true, error: null })
  let outcome: Awaited<ReturnType<typeof syncVault>>
  try {
    outcome = await syncVault(vaultDir, opts)
  } catch (error) {
    // 어떤 실패에서도 받는 중 표시를 내린다 — 스피너가 남으면 버튼이 영영 눌리지 않는다
    console.error('team pull failed', error)
    if (!isVaultOpen(vaultDir)) return store.patch({ running: false, error: null })
    return store.patch({
      running: false,
      error: mainT().syncMain.pullFailed
    })
  }
  // 받는 사이 그 보관함을 닫았으면 옛 보관함 수는 버린다 — 그 자리의 새 보관함을 덮지 않는다.
  // 받는 중 표시도 내린다 — 다시 열었을 때 스피너가 남아 있지 않게
  if (!isVaultOpen(vaultDir)) return store.patch({ running: false, error: null })
  if (!outcome.ok) {
    // 받지 못한 것은 앱을 막지 않는다 — 사유만 남기고 마지막으로 받은 시각은 그대로 둔다
    return store.patch({ running: false, error: outcome.reason })
  }
  const next = await store.patch({
    received: outcome.received,
    conflicts: outcome.conflicts,
    at: Date.now(),
    error: null,
    running: false,
    skipped: outcome.skipped,
    held: outcome.held,
    via: outcome.via
  })
  // 받은 것이 있으면 그 보관함 창의 목록·리더가 다시 읽는다
  if (outcome.received > 0) notifyVaultSwitched(vaultDir)
  return next
}

/** 내 수정을 팀에 보내는 실제 동작 — 올리기는 번들 git, 요청(PR)은 GitHub API */
const editShareDeps = {
  isPublic: (webUrl: string) => checkVisibility(webUrl),
  push: (vaultDir: string, local: string, remote: string) => pushBranchAs(vaultDir, local, remote),
  openPullRequest: (input: {
    url: string
    branch: string
    base: string
    title: string
    body: string
  }) => createPullRequest({ token: githubToken(), fetch: globalThis.fetch }, input),
  isOpen: (url: string, number: number) =>
    pullRequestOpen({ token: githubToken(), fetch: globalThis.fetch }, { url, number }),
  now: () => new Date()
}

let sharing = false

/**
 * 안 올린 내 수정을 팀 확인 요청으로 보낸다. 먼저 팀 변경을 받는다 — 팀 최신 위에 얹어야 요청이 깨끗하다.
 * 기본 줄기에 있을 때만 보낸다: 승인 대기·팀 확인 중인 위키화가 있으면 수정은 그 승인과 함께 간다.
 */
const shareMyEdits = async (include: string[], vaultDir?: string): Promise<ShareEditsResult> => {
  const dir = vaultDir ?? currentVaultDir()
  if (!dir) return { ok: false, reason: mainT().common.noVault }
  const generic = requireFullVault(dir)
  if (generic) return { ok: false, reason: generic }
  if (sharing) return { ok: false, reason: mainT().syncMain.sending }
  sharing = true
  try {
    const state = await runSync({}, dir)
    if (state.error) return { ok: false, reason: state.error }
    if (state.conflicts.length > 0) {
      return {
        ok: false,
        reason: mainT().syncMain.conflict
      }
    }
    if (state.held !== null || state.skipped === 'review-pending') {
      return {
        ok: false,
        reason: mainT().syncMain.draftWaiting
      }
    }
    if (state.skipped === 'busy') {
      return {
        ok: false,
        reason: mainT().syncMain.ingestRunning
      }
    }
    if (state.skipped === 'signed-out') {
      return {
        ok: false,
        reason: mainT().syncMain.loginNeeded
      }
    }
    if (state.skipped === 'no-remote') {
      return {
        ok: false,
        reason: mainT().syncMain.notLinked
      }
    }
    if (state.skipped !== null) return { ok: false, reason: mainT().syncMain.pullBeforeSend }
    // 고른 새 문서는 받은 뒤에 저장한다 — 팀 최신 위에 얹혀야 요청이 깨끗하다
    if (include.length > 0) {
      const blocked = await withVaultGit(dir, () => commitNewDocs(dir, include))
      if (blocked) return { ok: false, reason: blocked }
    }
    const [ahead, files] = await Promise.all([unpushedCount(dir), unpushedFiles(dir)])
    if (ahead === 0) return { ok: false, reason: mainT().syncMain.nothingToSend }
    const result = await shareEdits(dir, files, editShareDeps)
    if (isVaultOpen(dir)) await stores.store(dir).patch({})
    return result.ok ? { ok: true, url: result.share.url, added: result.added } : result
  } finally {
    sharing = false
  }
}

/** 앱이 열려 있는 동안 살펴보는 간격 */
const LOOK_EVERY_MS = 10 * 60_000
/** 창을 오가며 켤 때마다 가져오지 않게 — 이보다 짧은 사이에는 다시 보지 않는다(보관함마다) */
const LOOK_GAP_MS = 15_000
const lastLook = new Map<string, number>()
const looking = new Set<string>()

/** 팀에 새 변경이 있는지만 본다 — 합치지 않는다. 받는 중·방금 본 뒤면 건너뛴다 */
const lookForTeam = async (vaultDir?: string): Promise<void> => {
  const dir = vaultDir ?? currentVaultDir()
  if (!dir || inflights.get(dir) || looking.has(dir)) return
  if (Date.now() - (lastLook.get(dir) ?? 0) < LOOK_GAP_MS) return
  if (requireFullVault(dir)) return
  // 끊긴 인터넷에서 60초짜리 가져오기를 줄에 세우지 않는다 — 받기 버튼이 뒤에 묶인다
  if (!net.isOnline()) return
  looking.add(dir)
  lastLook.set(dir, Date.now())
  try {
    await lookForTeamChanges(dir)
    // 보는 사이 그 보관함을 닫았으면 옛 보관함 수를 보내지 않는다
    if (isVaultOpen(dir)) await stores.store(dir).patch({})
  } catch (error) {
    console.error('team change check failed', error)
  } finally {
    looking.delete(dir)
  }
}

/** 앞에 온 창과 10분마다 살펴본다 — 네트워크 git 만 쓰고 구독 사용량은 쓰지 않는다 */
export const watchTeam = (): void => {
  app.on('browser-window-focus', (_event, win) => {
    if (!win || win.isDestroyed()) return
    void lookForTeam(bindings.dirFor(win.webContents.id) ?? currentVaultDir() ?? undefined)
  })
  setInterval(() => {
    const focused = BrowserWindow.getFocusedWindow()
    const dir =
      (focused && !focused.isDestroyed() ? bindings.dirFor(focused.webContents.id) : null) ??
      currentVaultDir() ??
      undefined
    void lookForTeam(dir)
  }, LOOK_EVERY_MS).unref()
}

/** 그 보관함 상태를 다시 세어 그 보관함 창에 보낸다 — 올리기처럼 파일을 안 바꾸는 변화에 */
export const refreshSyncState = (vaultDir: string): void => {
  void stores.store(vaultDir).patch({})
}

export const syncState = (vaultDir?: string): Promise<SyncState> => {
  const dir = vaultDir ?? currentVaultDir()
  if (!dir) return Promise.resolve({ ...IDLE_SYNC })
  return stores.store(dir).recount()
}

/** 보관함이 바뀌면 그 보관함의 이전 결과는 남기지 않는다 */
export const resetSyncState = (vaultDir: string): void => stores.store(vaultDir).reset()

export const registerSyncHandlers = (): void => {
  // 보관함 없는 창(묶인 폴더 삭제)은 전역으로 떨어지지 않는다 — 남의 보관함을 건드리지 않게
  ipcMain.handle(APP_CHANNELS.syncVault, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { ...IDLE_SYNC, error: mainT().common.noVault }
    return runSync({}, vaultDir)
  })
  ipcMain.handle(APP_CHANNELS.getSyncState, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return Promise.resolve({ ...IDLE_SYNC })
    return syncState(vaultDir)
  })
  // renderer 입력 — 문자열 목록만. 목록에 있어도 지금 새 문서가 아닌 경로는 commitNewDocs 가 버린다
  ipcMain.handle(APP_CHANNELS.shareEdits, (event, include: unknown) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { ok: false, reason: mainT().common.noVault }
    return shareMyEdits(
      Array.isArray(include)
        ? include.filter((path): path is string => typeof path === 'string')
        : [],
      vaultDir
    )
  })
  // renderer 입력 — 경로는 고르기를 기다리는 목록 안에 있어야 한다(sync-service 가 다시 본다)
  ipcMain.handle(APP_CHANNELS.readConflict, (event, path: unknown) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    if (typeof path !== 'string') return { error: mainT().mainErrors.badPath }
    return conflictSides(vaultDir, path)
  })
  ipcMain.handle(APP_CHANNELS.resolveConflict, async (event, path: unknown, pick: unknown) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { ok: false, reason: mainT().common.noVault }
    if (typeof path !== 'string' || (pick !== 'team' && pick !== 'mine')) {
      return { ok: false, reason: mainT().syncMain.unknownPick }
    }
    // 받기·저장과 같은 줄에 선다 — 나란히 돌면 git 잠금(index.lock)에 걸려 둘 다 죽는다
    const result = await withVaultGit(vaultDir, () => resolveConflict(vaultDir, path, pick))
    if (result.ok) {
      void stores.store(vaultDir).patch({ conflicts: result.remaining })
      notifyVaultSwitched(vaultDir)
    }
    return result
  })
}
