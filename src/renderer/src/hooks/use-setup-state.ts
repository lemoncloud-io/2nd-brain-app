import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  EngineStatus,
  GithubAuthState,
  Journey,
  RemoteStatus,
  SyncState,
  VaultStatus
} from '../../../shared/ipc-contract'
import type { EngineKind } from '../../../shared/engine-settings'
import { useWorkbench } from '../store/workbench'
import { toUserError, type UserError } from '../lib/user-error'
import { getT } from '../lib/i18n'

export type VaultReadiness = 'checking' | 'none' | 'invalid' | 'ok'
/** `unreadable` = CLI 는 있는데 로그인 상태를 알아듣지 못했다 — 미로그인과 다르게 다뤄야 한다 */
export type EngineReadiness = 'checking' | 'missing' | 'unreadable' | 'logged-out' | 'ok'
export type SetupState = {
  vault: VaultReadiness
  engine: EngineReadiness
  engineKind: EngineKind
  /** 엔진 CLI 버전·로그인 계정 — 아직 모르면 null */
  engineStatus: EngineStatus | null
  /** 첫 실행 진행 — 보관함이 없거나 아직 모르면 null */
  journey: Journey | null
  /** 연결한 팀 저장소 */
  remote: RemoteStatus
  /** remote 를 읽었다 — false 면 null 이 "연결 없음" 인지 "아직 모름·읽기 실패" 인지 모른다 */
  remoteKnown: boolean
  /** GitHub 로그인 — 아직 모르면 null. 로그인 칸이 여러 화면에 있어 상태는 여기 하나다 */
  github: GithubAuthState | null
  /** 팀 변경 받기 — 앱이 알아서 받은 결과와 지금 받는 중인지 */
  sync: SyncState
  /** 준비 상태를 읽지 못했을 때의 사용자 문구 — 읽혔으면 null */
  error: UserError | null
  /** 엔진·보관함·진행을 다시 읽는다 — 로그인·설치를 기다리는 화면이 부른다 */
  refresh: () => void
  /** 진행(자료·위키화·병합)과 GitHub 연결만 다시 읽는다 */
  refreshJourney: () => void
  /** 사람이 누르는 받기 — 앱이 알아서 받는 네 시점과 같은 길을 탄다 */
  receiveTeamChanges: () => void
  /** GitHub 로그인·로그아웃 뒤 — 로그인 상태를 다시 읽고, 받기 줄이 맞게 팀 변경도 다시 받는다 */
  refreshGithub: () => void
}

export const vaultReadiness = (status: VaultStatus | null): VaultReadiness =>
  status === null ? 'checking' : status.vaultDir === null ? 'none' : status.valid ? 'ok' : 'invalid'

export const engineReadiness = (
  status: Pick<EngineStatus, 'cli' | 'auth'> | null
): EngineReadiness =>
  status === null
    ? 'checking'
    : 'missing' in status.cli
      ? 'missing'
      : status.auth.loggedIn
        ? 'ok'
        : status.auth.unknown
          ? 'unreadable'
          : 'logged-out'

/**
 * 보관함·엔진 준비와 첫 실행 진행의 단일 출처 — SetupProvider 가 한 번만 호출한다.
 * getEngineStatus 는 설정에서 고른 엔진 CLI 를 실행하므로 탭 전환마다 부르지 않는다:
 * 시작, 설정·시작하기 탭 진입·이탈, 보관함 전환 신호(빈 wikiChanged), 화면이 부르는 refresh 에만 다시 확인한다.
 * 진행(journey)은 git 몇 번이라 싸다 — 위키 변경·볼트 작업 종료마다 다시 읽는다.
 */
export const useSetupStateSource = (): SetupState => {
  const view = useWorkbench((s) => s.view)
  const [vault, setVault] = useState<VaultStatus | null>(null)
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [journey, setJourney] = useState<Journey | null>(null)
  const [remote, setRemote] = useState<RemoteStatus>(null)
  const [remoteKnown, setRemoteKnown] = useState(false)
  const [github, setGithub] = useState<GithubAuthState | null>(null)
  const [sync, setSync] = useState<SyncState>({
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
  })
  // 준비 상태를 못 읽으면 탭 가드가 영원히 "확인 중" 에 선다 — 실패를 들고 있다가 화면이 다시 묻게 한다.
  // 한 곳의 성공이 다른 곳의 실패를 지우면 안 된다 — 칸막이별로 들고 먼저 난 것을 보여 준다
  const [domainErrors, setDomainErrors] = useState<
    Record<'vault' | 'engine' | 'journey' | 'remote' | 'github', UserError | null>
  >({ vault: null, engine: null, journey: null, remote: null, github: null })

  const clearDomain = useCallback(
    (domain: 'vault' | 'engine' | 'journey' | 'remote' | 'github'): void => {
      setDomainErrors((prev) => (prev[domain] === null ? prev : { ...prev, [domain]: null }))
    },
    []
  )

  const failDomain = useCallback(
    (
      domain: 'vault' | 'engine' | 'journey' | 'remote' | 'github',
      error: unknown,
      what: string
    ): void => {
      setDomainErrors((prev) => ({ ...prev, [domain]: toUserError(error, what) }))
    },
    []
  )

  // 받기 줄 실패는 조용히 넘기지 않는다 — SyncState.error 가 그 자리다(running 은 main 푸시가 주인이다)
  const failSync = useCallback((error: unknown, what: string): void => {
    const text = toUserError(error, what).text
    setSync((prev) => (prev.error === text ? prev : { ...prev, error: text }))
  }, [])

  const refreshJourney = useCallback((): void => {
    window.api
      .getJourney()
      .then((journey) => {
        setJourney(journey)
        clearDomain('journey')
      })
      .catch((e) => failDomain('journey', e, getT().shell.setupRead.journey))
    window.api
      .getRemote()
      .then((remote) => {
        setRemote(remote)
        setRemoteKnown(true)
        clearDomain('remote')
      })
      .catch((e) => {
        setRemoteKnown(false)
        failDomain('remote', e, getT().shell.setupRead.remote)
      })
    window.api
      .githubAuthState()
      .then((github) => {
        setGithub(github)
        clearDomain('github')
      })
      .catch((e) => failDomain('github', e, getT().shell.setupRead.github))
  }, [clearDomain, failDomain])

  // 오류는 답이 오는 순간에만 지운다 — 다시 확인을 누르자마자 지우면 렌더 도중 상태를 바꾸게 된다
  const refresh = useCallback((): void => {
    window.api
      .getVaultStatus()
      .then((status) => {
        setVault(status)
        clearDomain('vault')
      })
      .catch((e) => failDomain('vault', e, getT().shell.setupRead.vault))
    window.api
      .getEngineStatus()
      .then((status) => {
        setEngine(status)
        clearDomain('engine')
      })
      .catch((e) => failDomain('engine', e, getT().shell.setupRead.engine))
    refreshJourney()
  }, [refreshJourney, clearDomain, failDomain])

  useEffect(() => {
    refresh()
  }, [refresh])

  const previousView = useRef(view)
  useEffect(() => {
    const previous = previousView.current
    previousView.current = view
    const setupViews = ['settings', 'start']
    if (previous !== view && (setupViews.includes(previous) || setupViews.includes(view))) refresh()
  }, [view, refresh])

  // 위키가 바뀌면 미동기 수부터 다시 센다 — 같은 채널을 두 번 구독하지 않는다(푸시마다 둘 다 돈다)
  useEffect(
    () =>
      window.api.onWikiChanged((rels) => {
        window.api
          .getSyncState()
          .then(setSync)
          .catch((e) => failSync(e, getT().shell.setupRead.sync))
        if (rels.length === 0) refresh()
        else refreshJourney()
      }),
    [refresh, refreshJourney, failSync]
  )

  useEffect(
    () =>
      window.api.onActivityChanged((running) => {
        if (!running) refreshJourney()
      }),
    [refreshJourney]
  )

  // 받기는 앱이 알아서도 한다 — 화면은 그 결과를 구독만 하고, 처음 한 번 현재 상태를 읽는다
  useEffect(() => {
    window.api
      .getSyncState()
      .then(setSync)
      .catch((e) => failSync(e, getT().shell.setupRead.sync))
    return window.api.onSyncChanged(setSync)
  }, [failSync])

  const receiveTeamChanges = useCallback((): void => {
    window.api
      .syncVault()
      .then(setSync)
      .catch((e) => failSync(e, getT().shell.setupRead.receive))
  }, [failSync])

  const refreshGithub = useCallback((): void => {
    window.api
      .githubAuthState()
      .then((github) => {
        setGithub(github)
        clearDomain('github')
      })
      .catch((e) => failDomain('github', e, getT().shell.setupRead.github))
    receiveTeamChanges()
  }, [receiveTeamChanges, clearDomain, failDomain])

  return {
    vault: vaultReadiness(vault),
    engine: engineReadiness(engine),
    engineKind: engine?.engine ?? 'claude',
    engineStatus: engine,
    journey,
    remote,
    remoteKnown,
    github,
    sync,
    error:
      domainErrors.vault ??
      domainErrors.engine ??
      domainErrors.journey ??
      domainErrors.remote ??
      domainErrors.github,
    refresh,
    refreshJourney,
    receiveTeamChanges,
    refreshGithub
  }
}
