// 자동 업데이트 — electron-updater 를 감싸는 유일한 자리.
// 레포가 private 인 동안은 꺼 둔다(2nd-brain projects/2nd-brain-app/design.md §4.5) — 설치본은 사람이 전달한다.
// 꺼진 앱은 electron-updater 를 import 하지도 않는다: 설치본에 app-update.yml 이 없거나 주소가 private 레포면
// 확인하는 순간 오류가 나고, 그 오류를 비개발자에게 보일 이유가 없다.
import type { UpdateState } from '../../shared/ipc-contract'
import { updateReducer, type UpdateEvent } from './update-state'

/** 공개 전환(lemoncloud-io 이전·이력 비밀값 스캔) 뒤에 true 로 바꾼다 — docs/RELEASE.md § 공개 전환 */
export const AUTO_UPDATE = false

/** 시작 직후는 창·받기·색인이 몰린다 — 조금 기다렸다 확인한다 */
export const FIRST_CHECK_MS = 30_000
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
/** e2e 가 받은 파일을 두는 캐시 폴더 이름 — e2e/update.spec.ts 가 끝나고 지운다 */
export const E2E_UPDATE_CACHE = '2nd-brain-e2e-updater'

/**
 * `import('electron-updater')` 의 결과에서 autoUpdater 를 꺼낸다. main 번들은 동적 import 를 네이티브 import() 로 남기고,
 * electron-updater 는 CJS 에서 autoUpdater 를 getter 로 정의해 Node 가 이름 있는 export 로 못 뽑는다 —
 * Electron 39 에서 `'autoUpdater' in m` 이 false, `m.default.autoUpdater` 로만 닿는다(2026-09-27 실측)
 */
export const pickAutoUpdater = <T>(mod: { autoUpdater?: T; default?: { autoUpdater?: T } }): T => {
  const updater = mod.autoUpdater ?? mod.default?.autoUpdater
  if (!updater) throw new Error('electron-updater: autoUpdater export not found')
  return updater
}

/** electron-updater AppUpdater 에서 쓰는 부분만 */
export interface UpdaterPort {
  autoDownload: boolean
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-available', listener: (info: { version: string }) => void): unknown
  on(event: 'update-not-available', listener: () => void): unknown
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

/**
 * 켤지와 어디서 받을지. 설치본은 빌드 상수만 본다. `SECOND_BRAIN_UPDATE_FEED` 는 패키징 안 된 실행(e2e)에서만
 * 읽는다 — 설치본에서 env 로 업데이트 주소를 바꿀 수 있으면 안 된다
 */
export const updateMode = (input: {
  flag: boolean
  packaged: boolean
  feed: string | undefined
}): { on: false } | { on: true; feed?: string } => {
  if (!input.packaged) return input.feed ? { on: true, feed: input.feed } : { on: false }
  return input.flag ? { on: true } : { on: false }
}

export interface UpdaterDeps {
  mode: ReturnType<typeof updateMode>
  /** electron-updater 를 불러와 설정까지 마친 포트 — 켜진 경우에만 부른다 */
  load: (feed: string | undefined) => Promise<UpdaterPort>
  publish: (state: UpdateState) => void
  setTimer: (run: () => void, ms: number) => void
  /** 첫 확인까지 기다릴 시간 — 기본 FIRST_CHECK_MS */
  firstCheckMs?: number
  /**
   * 설치가 앱을 끝내기 시작한다(true)·설치가 실패해 멈췄다(false). Electron 은 설치 종료에서 창을 먼저 닫고
   * before-quit 을 나중에 낸다(electron.d.ts `before-quit` NOTE) — 창 닫기가 숨기기면 그 전에 알아야 한다
   */
  quitting?: (on: boolean) => void
}

export interface UpdaterControl {
  state(): UpdateState
  check(): Promise<void>
  install(): boolean
  /** 설치 종료가 저장 안 한 글에 막혀 멈췄다 — 실패가 아니므로 받아 둔 그대로 다시 누를 수 있게 한다 */
  installStopped(): void
}

export const startUpdater = (deps: UpdaterDeps): UpdaterControl => {
  let state: UpdateState = deps.mode.on ? { kind: 'idle' } : { kind: 'off' }
  let port: Promise<UpdaterPort> | null = null
  // 겹친 확인(시작 확인 + 주기 확인)은 한 번으로 합친다
  let inflight: Promise<void> | null = null
  // 설정 칸과 사이드바가 따로 누를 수 있다 — 설치는 한 번만 부른다
  let installing = false

  const apply = (event: UpdateEvent): void => {
    const next = updateReducer(state, event)
    if (next === state) return
    state = next
    deps.publish(state)
  }

  const connect = (feed: string | undefined): Promise<UpdaterPort> => {
    port ??= deps.load(feed).then(
      (updater) => {
        updater.autoDownload = true
        updater.on('checking-for-update', () => apply({ type: 'check' }))
        updater.on('update-available', (info) =>
          apply({ type: 'available', version: info.version })
        )
        updater.on('update-not-available', () => apply({ type: 'none' }))
        updater.on('download-progress', (p) => apply({ type: 'progress', percent: p.percent }))
        updater.on('update-downloaded', (info) =>
          apply({ type: 'downloaded', version: info.version })
        )
        updater.on('error', (error) => {
          // 화면에는 한 줄 상태로, 원문은 main 로그에 남긴다
          console.error('[update]', error)
          // 설치 실패는 던지지 않고 이 이벤트로 온다 — win 은 BaseUpdater.install 이 잡아 dispatchError,
          // mac 은 Squirrel 이 설치를 준비하다 낸다. 설치 중이면 설치 실패로 읽는다(ready 는 확인 오류를 무시한다).
          // 한계: 설치를 기다리는 사이 무관한 오류가 와도 설치 실패로 읽힌다 — ready 에서는 확인이 돌지 않아 경로는 좁다
          if (installing) {
            installing = false
            deps.quitting?.(false)
            apply({ type: 'install-failed', detail: error.message })
          } else apply({ type: 'error', detail: error.message })
        })
        return updater
      },
      (error: unknown) => {
        // 불러오기 실패를 붙들고 있으면 다음 주기 확인도 영영 실패한다 — 다음 확인이 다시 불러오게 놓는다
        port = null
        throw error
      }
    )
    return port
  }

  const check = async (): Promise<void> => {
    const mode = deps.mode
    // 받아 둔 게 있으면 다시 받지 않는다 — 다시 시작하면 설치된다
    if (!mode.on || state.kind === 'ready') return
    inflight ??= (async () => {
      try {
        apply({ type: 'check' })
        await (await connect(mode.feed)).checkForUpdates()
      } catch (error) {
        apply({ type: 'error', detail: error instanceof Error ? error.message : String(error) })
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  if (deps.mode.on) {
    const loop = (): void => {
      void check()
      deps.setTimer(loop, CHECK_EVERY_MS)
    }
    deps.setTimer(loop, deps.firstCheckMs ?? FIRST_CHECK_MS)
  }

  return {
    state: () => state,
    check,
    installStopped: () => {
      installing = false
    },
    install: () => {
      // 설치가 한 번 실패해도 받아 둔 파일로 다시 시도할 수 있다 — electron-updater 는 install 이 false 면
      // quitAndInstallCalled 를 되돌린다(BaseUpdater.quitAndInstall)
      const installable =
        state.kind === 'ready' || (state.kind === 'failed' && state.during === 'install')
      if (!installable || !port || installing) return false
      installing = true
      // 설치가 실패하면 버튼이 조용히 아무 일도 안 한 것처럼 보인다 — 실패 상태로 알린다
      void port
        .then((updater) => {
          deps.quitting?.(true)
          updater.quitAndInstall()
        })
        .catch((error: unknown) => {
          console.error('[update] install', error)
          installing = false
          deps.quitting?.(false)
          apply({
            type: 'install-failed',
            detail: error instanceof Error ? error.message : String(error)
          })
        })
      return true
    }
  }
}
