// 자동 업데이트 배선 — 상태 푸시와 "다시 시작하면 새 버전" 버튼.
import { app, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import {
  AUTO_UPDATE,
  E2E_UPDATE_CACHE,
  FIRST_CHECK_MS,
  pickAutoUpdater,
  startUpdater,
  updateMode,
  type UpdaterControl,
  type UpdaterPort
} from '../update/updater'
import { broadcast } from './broadcast'
import { quitGuard } from '../window/quit-guard'

/** 켜진 경우에만 부른다 — 꺼진 앱은 electron-updater 를 불러오지 않는다 */
const loadUpdater = async (feed: string | undefined): Promise<UpdaterPort> => {
  const autoUpdater = pickAutoUpdater<import('electron-updater').AppUpdater>(
    await import('electron-updater')
  )
  if (feed) {
    // e2e: 패키징 안 된 실행은 기본으로 확인을 건너뛴다(AppUpdater.isUpdaterActive) — 가짜 서버로 강제한다.
    // 받기는 설정 파일(app-update.yml)의 updaterCacheDirName 을 읽는다(AppUpdater.getOrCreateDownloadHelper) —
    // 주소와 함께 userData 에 적어 두고, 캐시 이름은 e2e 전용으로 둬 사용자 캐시를 건드리지 않는다
    autoUpdater.forceDevUpdateConfig = true
    const config = join(app.getPath('userData'), 'e2e-app-update.yml')
    writeFileSync(
      config,
      `provider: generic\nurl: ${JSON.stringify(feed)}\nupdaterCacheDirName: ${E2E_UPDATE_CACHE}\n`
    )
    autoUpdater.updateConfigPath = config
    // mac 은 받자마자 Squirrel 에 설치 준비를 시킨다(MacUpdater: autoInstallOnAppQuit 면 nativeUpdater.checkForUpdates).
    // 개발용 Electron 을 바꾸려 들지 않게 e2e 에서는 끈다
    autoUpdater.autoInstallOnAppQuit = false
  }
  return autoUpdater
}

let updateControl: UpdaterControl | null = null

/** 설치 종료가 저장 안 한 글에 막혔다 — 다시 시작 단추가 다시 눌리게 한다 */
export const updateInstallStopped = (): void => updateControl?.installStopped()

/** 막혔던 설치 종료를 버리기 뒤에 잇는다 — 그냥 끝내면 받아 둔 업데이트가 설치되지 않는다 */
export const resumeUpdateInstall = (): boolean => updateControl?.install() ?? false

export const registerUpdateHandlers = (): void => {
  const mode = updateMode({
    flag: AUTO_UPDATE,
    packaged: app.isPackaged,
    feed: process.env['SECOND_BRAIN_UPDATE_FEED']
  })
  const control = startUpdater({
    mode,
    // e2e 는 바로 본다 — 설치본은 시작 직후 몰리는 일을 피해 조금 기다린다
    firstCheckMs: mode.on && mode.feed ? 0 : FIRST_CHECK_MS,
    load: loadUpdater,
    publish: (state) => broadcast(APP_CHANNELS.updateChanged, state),
    setTimer: (run, ms) => void setTimeout(run, ms).unref(),
    quitting: (on) => (on ? quitGuard.quitStarted('update') : quitGuard.quitCanceled())
  })
  updateControl = control
  ipcMain.handle(APP_CHANNELS.getUpdateState, () => control.state())
  ipcMain.handle(APP_CHANNELS.installUpdate, () => control.install())
  ipcMain.handle(APP_CHANNELS.checkUpdate, () => control.check())
}
