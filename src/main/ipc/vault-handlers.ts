// 보관함 선택·생성·열기 IPC. 전역 설정+창별 바인딩이 출처 — 재실행 시 전역 설정이 첫 창에 열린다.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { resolve } from 'node:path'
import { resolveInVault } from '../vault/vault-path'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import type {
  CreateTeamRepoResult,
  InviteResult,
  PushResult,
  RemoteStatus,
  RestoreResult,
  VaultStatus
} from '../../shared/ipc-contract'
import { readJourney } from '../vault/journey'
import { readVaultChanges } from '../vault/git-status'
import {
  checkVisibility,
  clearRemote,
  forgetVisibility,
  pushVault,
  readRemote,
  rememberedVisibility,
  remoteHasCommits,
  setRemote
} from '../vault/remote-service'
import { githubCloneUrl } from '../../shared/github-url'
import { needsGithubLogin } from '../git'
import { acceptInvitation, createTeamRepo, inviteMember } from '../github/repos'
import { githubLogin, githubToken } from './github-handlers'
import { adoptableNotes, adoptPreview, adoptVault, type AdoptPreview } from '../vault/adopt-vault'
import {
  createVault,
  defaultVaultParent,
  newVaultDir,
  openVault,
  requireFullVault
} from '../vault/vault-service'
import { cloneVault } from '../vault/clone-service'
import { createVaultFromTemplate } from '../vault/template-vault'
import { migrateOnboardingPurpose } from '../vault/purpose'
import { VAULT_TEMPLATE_REPO } from '../github/endpoints'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { detachInflightSync, refreshSyncState, resetSyncState, runSync } from './sync-handlers'
import { pushBlockedReason } from '../vault/sync-state'
import { restoreVault } from '../vault/sync-service'
import { loadSettings, normalizeVaultKey, recordRecentVault, saveSettings } from '../settings'
import {
  cancelAiWorkForVaultSwitch,
  ensureVaultWatched,
  notifyVaultSwitched,
  releaseVaultWatch
} from './wiki-handlers'
import { cancelChatsForVaultSwitch, recoverNoteRuns } from './chat-handlers'
import { cancelIngestForVaultSwitch } from './ingest-handlers'
import { bindings, vaultTitle } from '../window/window-vaults'
import { mainT } from '../i18n'

export const pickFolder = async (
  message?: string,
  parent?: BrowserWindow | null
): Promise<string | null> => {
  const win = parent ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    message,
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

/** 새 창으로 열기 — main/index.ts 가 창 만들기를 꽂는다(순환 import 방지) */
let openWindow: ((dir: string) => void) | null = null
export const setWindowOpener = (fn: (dir: string) => void): void => {
  openWindow = fn
}

/** 발신 창 — 없으면 null(전역 폴백은 호출부가 한다) */
const windowFor = (senderId?: number): BrowserWindow | null => {
  if (senderId === undefined) return null
  return BrowserWindow.getAllWindows().find((w) => w.webContents.id === senderId) ?? null
}

/** 발신 창의 보관함 — 바인딩이 없으면 전역 설정(단일 창·구 흐름) */
export const vaultStatus = (senderId?: number): VaultStatus => {
  const bound = senderId === undefined ? undefined : bindings.dirFor(senderId)
  const { vaultDir, recentVaultDirs } = loadSettings(app.getPath('userData'))
  const dir = bound ?? vaultDir
  const recentVaults = recentVaultDirs ?? []
  if (!dir) return { vaultDir: null, valid: false, missing: [], recentVaults }
  const result = openVault(dir)
  return result.ok
    ? { vaultDir: dir, valid: true, missing: [], kind: result.kind ?? 'full', recentVaults }
    : { vaultDir: dir, valid: false, missing: result.missing, recentVaults }
}

type ApplyResult = { ok: true } | { ok: false; reason?: string; missing?: string[] }

const failureMessage = (dir: string, result: { reason?: string; missing?: string[] }): string =>
  result.missing && result.missing.length > 0
    ? mainT().vaultMain.notVault(result.missing.join('·'), dir)
    : `${result.reason ?? mainT().vaultMain.openUnknown} (${dir})`

/** 열기에서 고른, 노트가 있는 보관함 아닌 폴더 — 보관함으로 쓰기 버튼이 이 폴더에만 쓴다 */
let adoptCandidate: string | null = null

// 실패하면 설정을 바꾸지 않고 사유를 돌려준다 — 조용히 '보관함 없음'으로 돌아가면 사용자는 왜인지 모른다
const chooseAnd = async (
  pick: () => Promise<string | null>,
  apply: (dir: string) => ApplyResult,
  senderId?: number
): Promise<VaultStatus> => {
  const dir = await pick()
  if (!dir) return vaultStatus(senderId)
  const result = apply(dir)
  if (!result.ok) return { ...vaultStatus(senderId), error: failureMessage(dir, result) }
  return openCreated(dir, senderId)
}

/** 열린 창들의 제목을 다시 쓴다 — 뒤늦은 이름 겹침도 여기서 구분된다 */
export const refreshTitles = (): void => {
  const dirs = bindings.dirs()
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    const bound = bindings.dirFor(win.webContents.id)
    if (!bound) continue
    try {
      win.setTitle(vaultTitle(dirs, bound))
    } catch {
      // 닫히는 중인 창은 건너뛴다
    }
  }
}

/** 첫 질문 답 — 설정에서 읽고, 보관함으로 옮기면 지운다 */
const onboardingPurpose = {
  get: (): string | undefined => loadSettings(app.getPath('userData')).onboardingPurpose,
  clear: (): void => {
    const dir = app.getPath('userData')
    const settings = loadSettings(dir)
    delete settings.onboardingPurpose
    saveSettings(dir, settings)
  }
}

/**
 * 방금 만든 보관함을 연다 — 보관함이 생기기 전에 받아 둔 첫 질문 답을 purpose.md 로 옮긴다.
 * 만드는 길에서만 옮긴다: 팀 보관함 받기·기존 보관함 열기에 옮기면 개인 답이 팀이 같이 보는 기록에 들어간다
 */
const openCreated = (dir: string, senderId?: number): VaultStatus => {
  migrateOnboardingPurpose(resolve(dir), onboardingPurpose)
  return switchTo(dir, senderId)
}

/** 이 폴더를 열린 보관함으로 삼는다 — 발신 창이 떠나는 보관함 일만 끊는다.
 *  발신 창만 갈아끼운다 — 다른 창은 자기 보관함을 그대로 본다 */
const switchTo = (rawDir: string, senderId?: number): VaultStatus => {
  // 들어오는 표기는 하나로 — 바인딩·감시·동기화 키가 갈라지지 않게
  const dir = resolve(rawDir)
  const settings = loadSettings(app.getPath('userData'))
  const oldVaultDir = settings.vaultDir
  const prevRaw = senderId === undefined ? oldVaultDir : (bindings.dirFor(senderId) ?? oldVaultDir)
  // 이전 표기(꼬리 구분자 등)는 여기서 하나로 — 키 비교가 갈라지지 않게
  const prev = prevRaw ? resolve(prevRaw) : undefined
  saveSettings(app.getPath('userData'), {
    ...settings,
    vaultDir: dir,
    recentVaultDirs: recordRecentVault(settings.recentVaultDirs, dir)
  })
  if (senderId !== undefined) bindings.bind(senderId, dir)
  refreshTitles()
  // 떠나는 보관함 일만 끊는다 — 다른 창에서 도는 다른 보관함 일은 그대로 둔다
  const parting = prev && prev !== dir ? prev : undefined
  cancelChatsForVaultSwitch(parting)
  // 점검·합치기 제안도 옛 보관함에 묶여 있다 — 두면 B 화면에 A 진행이 뜬다
  cancelAiWorkForVaultSwitch(parting)
  // 위키화도 끊는다 — 실행은 시작 시점의 보관함 경로에 묶여 있어, 두면 옛 보관함에 계속 쓴다
  cancelIngestForVaultSwitch(parting)
  // 감시 — 이전 보관함은 놓고 새 보관함은 든다. 같은 보관함이면 그대로
  if (prev === undefined || prev !== dir) {
    if (prev !== undefined) releaseVaultWatch(prev)
    ensureVaultWatched(dir)
  }
  // 탭은 숨겨진 채 마운트돼 있다 — 재마운트로 다시 읽던 것을 신호로 대신한다
  notifyVaultSwitched(dir)
  // 보관함 전환 — 그 보관함의 받기 결과를 지우고 새 보관함 것을 받는다.
  // 옛 받기는 끊지 않고 결과만 버린다(receive 가드) — 줄은 비워 새 보관함이 바로 받는다
  resetSyncState(dir)
  detachInflightSync(dir)
  // 끊긴 노트 실행을 받기보다 먼저 마무리한다 — 둘 다 보관함 줄에 서서 이 순서로 돈다
  recoverNoteRuns(dir)
  void runSync({}, dir)
  return vaultStatus(senderId)
}

/**
 * 공개 저장소에는 올리지 않는다 — 경고를 올린 **뒤**에 보이면 그것은 경고가 아니라 사후 통보다.
 * 확인하지 못한 저장소(한도·네트워크)는 막지 않는다: 모른다는 이유로 올리지 못하게 하면 그것도 손해다.
 */
const publicRepo = (): PushResult => ({ ok: false, reason: mainT().syncMain.publicRepo })

/** 연결·가져오기는 로그인부터 — 로그인 없이 나가면 GitHub 는 비공개 저장소를 "없다" 고 답한다 */

const connectAndPush = async (vaultDir: string, url: string): Promise<PushResult> => {
  const webUrl = url.replace(/\.git$/, '')
  if ((await checkVisibility(webUrl)) === true) return publicRepo()
  // 빈 저장소가 아니면 push 가 거절된다 — git stderr 대신 무엇을 해야 하는지로 먼저 말한다
  if ((await remoteHasCommits(vaultDir, url)) === true) {
    return {
      ok: false,
      reason: mainT().vaultMain.repoNotEmpty
    }
  }
  setRemote(vaultDir, url)
  return pushed(vaultDir)
}

/** 올리기는 파일을 바꾸지 않아 다른 신호가 없다 — 성공하면 안 올린 작업 수를 여기서 다시 센다 */
const pushed = async (vaultDir: string): Promise<PushResult> => {
  const result = await pushVault(vaultDir)
  if (result.ok) refreshSyncState(vaultDir)
  return result
}

/**
 * 팀 보관함을 받아 바로 연다 — GitHub 저장소 주소만 받는다. 받을 곳은 사람이 고르고, 받은 폴더를 그대로 연다.
 * 받은 초대(`invitationId`)는 받을 곳을 고른 뒤에 수락한다 — 창을 닫고 그만두면 초대는 그대로 남는다
 */
const importTeamVault = async (
  input: unknown,
  invitationId?: number,
  senderId?: number
): Promise<VaultStatus> => {
  const url = typeof input === 'string' ? githubCloneUrl(input) : null
  if (!url) {
    return {
      ...vaultStatus(senderId),
      error: mainT().vaultMain.notRepoUrl
    }
  }
  if (needsGithubLogin(url))
    return { ...vaultStatus(senderId), error: mainT().githubMain.loginAbove }
  const parentDir = await pickFolder(mainT().vaultMain.pickCloneParent, windowFor(senderId))
  if (!parentDir) return vaultStatus(senderId)
  if (invitationId !== undefined) {
    const accepted = await acceptInvitation(
      { token: githubToken(), fetch: globalThis.fetch },
      invitationId
    )
    if (!accepted.ok) return { ...vaultStatus(senderId), error: accepted.reason }
  }
  const cloned = await cloneVault(url, parentDir)
  // 실패하면 설정을 바꾸지 않는다 — 열려 있던 보관함이 그대로 남는다
  if (!cloned.ok) return { ...vaultStatus(senderId), error: cloned.reason }
  return switchTo(cloned.dir, senderId)
}

/** 만들던 저장소 기록 — 설정에 둔다(앱을 껐다 켜도 같은 저장소를 다시 받는다) */
const onboardingRepo = {
  get: (): string | undefined => loadSettings(app.getPath('userData')).onboardingRepo,
  set: (fullName: string | undefined): void => {
    const dir = app.getPath('userData')
    const settings = loadSettings(dir)
    if (fullName === undefined) delete settings.onboardingRepo
    else settings.onboardingRepo = fullName
    saveSettings(dir, settings)
  }
}

/**
 * 첫 실행 보관함 — 기본 위치(문서 폴더)에 만들어 연다. GitHub 로그인이 있고 원하면 템플릿으로 내 비공개 저장소를 만들어 받는다.
 * 실패하면 열린 보관함은 그대로다. 만든 저장소는 기억해 두고(`onboardingRepo`) 다시 누르면 새로 만들지 않고 그것을 받는다
 */
const createStarterVault = async (opts: unknown, senderId?: number): Promise<VaultStatus> => {
  const wanted = typeof opts === 'object' && opts !== null ? (opts as Record<string, unknown>) : {}
  let parentDir = defaultVaultParent(app.getPath('documents'))
  if (wanted['pickParent'] === true) {
    const picked = await pickFolder(mainT().vaultMain.pickCreateParent, windowFor(senderId))
    if (!picked) return vaultStatus(senderId)
    parentDir = picked
  }
  try {
    mkdirSync(parentDir, { recursive: true })
  } catch (error) {
    console.error('could not create the vault parent folder', parentDir, error)
    return { ...vaultStatus(senderId), error: mainT().vaultMain.parentFailed(parentDir) }
  }
  const github = wanted['github'] === true
  const login = github ? await githubLogin() : null
  // GitHub 로 만들려 했는데 아이디를 모른다(로그인 풀림·오프라인) — 말없이 이 컴퓨터에만 만들지 않는다
  if (github && login === null) {
    return {
      ...vaultStatus(senderId),
      error: mainT().vaultMain.loginUnchecked
    }
  }
  if (login === null) {
    const dir = newVaultDir(parentDir, { inside: true })
    const made = createVault(dir)
    if (!made.ok) return { ...vaultStatus(senderId), error: failureMessage(dir, made) }
    return { ...openCreated(dir, senderId), starter: { via: 'local' } }
  }
  let result: Awaited<ReturnType<typeof createVaultFromTemplate>>
  try {
    result = await createVaultFromTemplate(
      {
        github: { token: githubToken(), fetch: globalThis.fetch },
        template: VAULT_TEMPLATE_REPO,
        clone: (url, dir) => cloneVault(url, dirname(dir), { into: dir }),
        wait: (ms) => sleep(ms),
        pending: onboardingRepo,
        skeleton: (dir) => createVault(dir),
        connect: (dir, url) => connectAndPush(dir, url)
      },
      { parentDir, login }
    )
  } catch (error) {
    // 설정 쓰기·폴더 만들기가 던지면 생 IPC 오류 대신 할 일로 말한다
    console.error('could not create the first-run vault', error)
    return { ...vaultStatus(senderId), error: mainT().vaultMain.createFailed }
  }
  if (!result.ok) {
    console.error('first-run vault creation failed', result.reason, result.detail)
    return { ...vaultStatus(senderId), error: result.reason }
  }
  const opened = openCreated(result.dir, senderId)
  // 방향 문서는 올린 뒤에 커밋된다 — 같이 올려 두지 않으면 혼자 쓰는 저장소에 "팀에 확인 요청 보내기" 가 뜬다.
  // 못 올려도 보관함은 열렸다: 다음 승인·지금 올리기가 같이 싣는다
  if (result.repo !== '' && result.publishError === undefined) {
    const pushed = await pushVault(result.dir)
    if (!pushed.ok) console.error('could not push the purpose document', pushed.reason)
  }
  return {
    ...opened,
    starter: {
      via: result.via,
      ...(result.repo === '' ? {} : { repo: result.repo }),
      ...(result.publishError === undefined ? {} : { publishError: result.publishError })
    }
  }
}

export const registerVaultHandlers = (): void => {
  // renderer 입력 — { github, pickParent } 불리언만 본다. 경로는 받지 않는다
  ipcMain.handle(APP_CHANNELS.createStarterVault, (event, opts: unknown) =>
    createStarterVault(opts, event.sender.id)
  )
  ipcMain.handle(APP_CHANNELS.getVaultStatus, (event) => vaultStatus(event.sender.id))
  // renderer 입력 — 문자열이 아니면 템플릿 없이 만든다. 모르는 문자열 id 는 createVault 가 쓰기 전에 거절한다
  ipcMain.handle(APP_CHANNELS.createVault, (event, template?: unknown) =>
    chooseAnd(
      () =>
        pickFolder(mainT().vaultMain.pickCreateParentMaybe, windowFor(event.sender.id)).then(
          (picked) => (picked ? newVaultDir(picked) : null)
        ),
      (dir) => createVault(dir, { template: typeof template === 'string' ? template : undefined }),
      event.sender.id
    )
  )
  // 트리 배지 — 화면이 `wikiChanged` 를 받을 때 같이 묻는다(푸시 채널을 새로 두지 않는다)
  ipcMain.handle(APP_CHANNELS.getVaultChanges, (event) => {
    const { vaultDir, valid } = vaultStatus(event.sender.id)
    return vaultDir && valid ? readVaultChanges(vaultDir) : {}
  })
  ipcMain.handle(APP_CHANNELS.getJourney, (event) => {
    const { vaultDir, valid } = vaultStatus(event.sender.id)
    // generic 폴더에는 첫 실행 체크리스트가 없다 — 진행 없음으로
    if (!vaultDir || !valid || requireFullVault(vaultDir)) return null
    return readJourney(vaultDir)
  })
  // 위키화를 도중에 멈추거나 다른 도구(CLI)가 브랜치를 만들면 보관함이 기본 줄기를 벗어난다 —
  // 그때 사용자가 터미널을 열지 않고 앱 안에서 되돌린다
  ipcMain.handle(
    APP_CHANNELS.restoreVault,
    async (event, confirmed: boolean): Promise<RestoreResult> => {
      const { vaultDir, valid } = vaultStatus(event.sender.id)
      if (!vaultDir || !valid) return { status: 'refused', reason: mainT().vaultMain.noOpenVault }
      const generic = requireFullVault(vaultDir)
      if (generic) return { status: 'refused', reason: generic }
      try {
        const result = await restoreVault(vaultDir, confirmed === true)
        if (result.status === 'done') {
          // 문서 목록·리더가 새 줄기를 읽고, 팀 최신도 바로 받는다
          notifyVaultSwitched(vaultDir)
          void runSync({}, vaultDir)
        }
        return result
      } catch (error) {
        return {
          status: 'refused',
          reason: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )
  // 화면 갱신마다 부르는 자리다 — 기억해 둔 답만 싣고 GitHub 에 묻지 않는다(묻는 것은 연결·올리기 직전).
  ipcMain.handle(APP_CHANNELS.getRemote, (event): RemoteStatus => {
    const { vaultDir, valid } = vaultStatus(event.sender.id)
    if (!vaultDir || !valid) return null
    const remote = readRemote(vaultDir)
    if (!remote) return null
    const remembered = rememberedVisibility(remote.webUrl)
    return remembered === 'miss' ? remote : { ...remote, public: remembered }
  })
  // renderer 입력 — GitHub 저장소 주소만 받는다(다른 곳은 받지 않는다). 연결은 올리기가 실패해도 남긴다
  ipcMain.handle(APP_CHANNELS.connectRemote, (event, input: unknown): Promise<PushResult> => {
    const { vaultDir, valid } = vaultStatus(event.sender.id)
    if (!vaultDir || !valid) return Promise.resolve({ ok: false, reason: mainT().common.noVault })
    const generic = requireFullVault(vaultDir)
    if (generic) return Promise.resolve({ ok: false, reason: generic })
    const url = typeof input === 'string' ? githubCloneUrl(input) : null
    if (!url) {
      return Promise.resolve({
        ok: false,
        reason: mainT().vaultMain.notRepoUrl
      })
    }
    if (needsGithubLogin(url))
      return Promise.resolve({ ok: false, reason: mainT().githubMain.loginAbove })
    return connectAndPush(vaultDir, url)
  })
  // renderer 입력 — org 는 null(내 계정) 또는 조직 이름, name 은 저장소 이름. 모양은 repos.ts 가 다시 본다.
  // 만들고 나서 연결·첫 올리기는 주소를 붙여 넣은 연결과 같은 길(connectAndPush)이다
  ipcMain.handle(
    APP_CHANNELS.createTeamRepo,
    async (event, org: unknown, name: unknown): Promise<CreateTeamRepoResult> => {
      const { vaultDir, valid } = vaultStatus(event.sender.id)
      if (!vaultDir || !valid) return { ok: false, reason: mainT().common.noVault }
      const generic = requireFullVault(vaultDir)
      if (generic) return { ok: false, reason: generic }
      if (org !== null && typeof org !== 'string') {
        return { ok: false, reason: mainT().vaultMain.noOwner }
      }
      if (typeof name !== 'string') {
        return { ok: false, reason: mainT().vaultMain.noRepoName }
      }
      const created = await createTeamRepo(
        { token: githubToken(), fetch: globalThis.fetch },
        { org, name }
      )
      if (!created.ok) return created
      // 저장소는 GitHub 에 생겼다 — 여기서부터의 실패는 "만들지 못했다" 가 아니다. 연결까지 됐으면 화면은
      // 연결됨으로 넘어가 지금 올리기로 다시 올린다(같은 이름으로 다시 만들면 이미 있다고 거절된다)
      // reason = 할 일 문장, detail = 던진 원문("자세히")
      let reason = mainT().vaultMain.linkProblem
      let detail: string | undefined
      try {
        const pushed = await connectAndPush(vaultDir, created.url)
        if (pushed.ok) return created
        reason = pushed.reason
      } catch (error) {
        console.error('team repo link failed', error)
        detail = error instanceof Error ? error.message : String(error)
      }
      // 만든 저장소에 연결됐는가 — 다른 저장소로 바꾸는 중이면 옛 연결이 남아 있을 수 있다
      const connected = readRemote(vaultDir)?.url === created.url
      return {
        ok: false,
        reason: connected
          ? mainT().vaultMain.createdNotPushed(reason)
          : mainT().vaultMain.createdNotLinked(reason, created.url),
        ...(detail === undefined ? {} : { detail }),
        ...(connected ? { connected: true as const } : {})
      }
    }
  )
  // renderer 입력 — GitHub 아이디. 초대는 연결해 둔 팀 저장소로만 간다(주소는 renderer 가 보내지 않는다)
  ipcMain.handle(
    APP_CHANNELS.inviteMember,
    async (event, username: unknown): Promise<InviteResult> => {
      const { vaultDir, valid } = vaultStatus(event.sender.id)
      const remote = vaultDir && valid ? readRemote(vaultDir) : null
      if (!remote) return { ok: false, reason: mainT().vaultMain.linkFirst }
      if (typeof username !== 'string')
        return { ok: false, reason: mainT().vaultMain.enterUsername }
      return inviteMember(
        { token: githubToken(), fetch: globalThis.fetch },
        { url: remote.url, username }
      )
    }
  )
  ipcMain.handle(APP_CHANNELS.pushRemote, async (event): Promise<PushResult> => {
    const { vaultDir, valid } = vaultStatus(event.sender.id)
    if (!vaultDir || !valid) return { ok: false, reason: mainT().common.noVault }
    const generic = requireFullVault(vaultDir)
    if (generic) return { ok: false, reason: generic }
    // 올리기 직전 — 팀 것을 먼저 받아 두면 거절당하고 사유를 읽을 일이 없다.
    // 받지 못했으면 올리지 않는다 — 올려도 거절되고, 고르기 대기 중이면 고르기 전 상태가 올라간다
    const blocked = pushBlockedReason(await runSync({}, vaultDir))
    if (blocked) return { ok: false, reason: blocked }
    const remote = readRemote(vaultDir)
    if (remote && (await checkVisibility(remote.webUrl)) === true) return publicRepo()
    return pushed(vaultDir)
  })
  // 연결만 지운다 — 이미 GitHub 에 올라간 것은 그대로 남는다
  ipcMain.handle(APP_CHANNELS.disconnectRemote, (event): RemoteStatus => {
    const { vaultDir, valid } = vaultStatus(event.sender.id)
    if (!vaultDir || !valid) return null
    const before = readRemote(vaultDir)
    clearRemote(vaultDir)
    if (before) forgetVisibility(before.webUrl)
    return readRemote(vaultDir)
  })
  // renderer 입력 — GitHub 저장소 주소만 받는다. 받을 곳은 사용자가 고르고, 받은 폴더를 그대로 연다
  ipcMain.handle(APP_CHANNELS.importVault, (event, input: unknown) =>
    importTeamVault(input, undefined, event.sender.id)
  )
  // renderer 입력 — 목록에서 고른 주소와(받은 초대면) 초대 번호. 주소는 같은 판정을 다시 타고, 번호는 repos.ts 가 본다.
  // 번호와 주소를 서로 맞춰 보지는 않는다 — 수락은 이 계정 앞으로 온 초대에만 되고, 받는 것은 그 주소가 볼 수 있을 때뿐이다
  ipcMain.handle(APP_CHANNELS.joinTeamVault, (event, input: unknown, invitationId: unknown) =>
    importTeamVault(
      input,
      typeof invitationId === 'number' ? invitationId : undefined,
      event.sender.id
    )
  )

  ipcMain.handle(APP_CHANNELS.openVault, async (event): Promise<VaultStatus> => {
    adoptCandidate = null
    const dir = await pickFolder(undefined, windowFor(event.sender.id))
    if (!dir) return vaultStatus(event.sender.id)
    const result = openVault(dir)
    // 뼈대 보관함이든 Obsidian任意 폴더든 존재하는 디렉토리면 그대로 연다(읽기 중심).
    // 존재하지 않거나 디렉토리가 아니면 기존처럼 사유를 돌려준다
    if (result.ok) return switchTo(dir, event.sender.id)
    let notes = 0
    try {
      notes = adoptableNotes(dir).length
    } catch {
      notes = 0
    }
    if (notes === 0) return { ...vaultStatus(event.sender.id), error: failureMessage(dir, result) }
    adoptCandidate = dir
    return {
      ...vaultStatus(event.sender.id),
      error: mainT().vaultMain.adoptable(notes, dir),
      adoptable: { dir, notes }
    }
  })
  // 새 창으로 열기 — 고른 보관함을 새 창에 연다. 지금 창의 보관함·설정은 그대로 둔다.
  // 보관함이 아닌 폴더는 현재 창 열기와 같은 사유로 거절한다(보관함으로 쓰기는 현재 창에서).
  ipcMain.handle(
    APP_CHANNELS.openVaultInNewWindow,
    async (event): Promise<{ opened: boolean; error?: string }> => {
      const dir = await pickFolder(mainT().vaultMain.pickNewWindow, windowFor(event.sender.id))
      if (!dir) return { opened: false }
      // 들어오는 표기는 하나로 — 최근 목록·바인딩 키가 갈라지지 않게
      const normalized = resolve(dir)
      const result = openVault(normalized)
      if (!result.ok) return { opened: false, error: failureMessage(normalized, result) }
      if (!openWindow) return { opened: false, error: mainT().vaultMain.newWindowFailed }
      const settings = loadSettings(app.getPath('userData'))
      saveSettings(app.getPath('userData'), {
        ...settings,
        recentVaultDirs: recordRecentVault(settings.recentVaultDirs, normalized)
      })
      openWindow(normalized)
      return { opened: true }
    }
  )
  // 최근 보관함으로 전환 — 경로는 보내지 않고 목록 안에서만 고른다. 목록 밖·이상한 값은 거절한다
  ipcMain.handle(
    APP_CHANNELS.openVaultRecent,
    async (event, dir: unknown): Promise<VaultStatus> => {
      const status = vaultStatus(event.sender.id)
      if (typeof dir !== 'string' || dir.length === 0 || dir.length > 4096) {
        return { ...status, error: mainT().vaultMain.noVaultDir }
      }
      const normalized = resolve(dir)
      const { recentVaultDirs } = loadSettings(app.getPath('userData'))
      const listed = (recentVaultDirs ?? []).some(
        (entry) => normalizeVaultKey(entry) === normalizeVaultKey(normalized)
      )
      if (!listed) {
        return { ...status, error: mainT().vaultMain.notRecent }
      }
      const result = openVault(normalized)
      if (!result.ok) return { ...status, error: failureMessage(normalized, result) }
      return switchTo(normalized, event.sender.id)
    }
  )
  // renderer 는 경로를 보내지 않는다 — 방금 사람이 창에서 고른 폴더(adoptCandidate)가 없으면
  // 지금 읽기 중심으로 열린 generic 폴더를 쓴다. full 보관함은 이미 보관함이라 adoptVault 가 거절한다
  ipcMain.handle(APP_CHANNELS.adoptVault, (event): VaultStatus => {
    let dir = adoptCandidate
    adoptCandidate = null
    if (!dir) {
      const status = vaultStatus(event.sender.id)
      if (status.vaultDir && status.kind === 'generic') dir = status.vaultDir
    }
    if (!dir)
      return {
        ...vaultStatus(event.sender.id),
        error: mainT().vaultMain.pickAdoptFirst
      }
    const result = adoptVault(dir)
    if (!result.ok) return { ...vaultStatus(event.sender.id), error: `${result.reason} (${dir})` }
    return {
      ...switchTo(dir, event.sender.id),
      adopted: { queued: result.queued, kept: result.kept }
    }
  })
  // 미리보기 — 경로를 보내지 않는다. 후보(열기에서 고른 폴더·열린 generic 폴더)가 없으면 null
  ipcMain.handle(APP_CHANNELS.adoptPreview, (event): AdoptPreview | null => {
    const dir =
      adoptCandidate ??
      (() => {
        const status = vaultStatus(event.sender.id)
        return status.vaultDir && status.kind === 'generic' ? status.vaultDir : null
      })()
    if (!dir) return null
    return adoptPreview(dir)
  })
  // Obsidian으로 열기 — obsidian:// URL. 미설치면 폴더로 폴백한다.
  ipcMain.handle(
    APP_CHANNELS.openInObsidian,
    async (
      event,
      rel?: unknown
    ): Promise<{ ok: true; via: 'obsidian' | 'folder' } | { error: string }> => {
      const { vaultDir } = vaultStatus(event.sender.id)
      if (!vaultDir) return { error: mainT().common.noVault }
      let target = vaultDir
      if (typeof rel === 'string' && rel.length > 0) {
        const resolved = resolveInVault(vaultDir, rel)
        if (!resolved) return { error: mainT().vaultMain.outsideVault }
        target = resolved
      }
      try {
        await shell.openExternal(`obsidian://open?path=${encodeURIComponent(target)}`)
        return { ok: true, via: 'obsidian' }
      } catch {
        // basename 참조 없이 target 그대로 — Obsidian 미설치 시 폴더 폴백
        await shell.openPath(target)
        return { ok: true, via: 'folder' }
      }
    }
  )
}
