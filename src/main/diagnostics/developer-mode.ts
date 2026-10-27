// 개발자 모드 — 상세 기록(debug)·배포본 DevTools·성능 손잡이. 값은 메모리에 둔다:
// 키 입력·기록 줄마다 settings.json 을 읽지 않게. 저장은 켜고 끌 때 한 번.
import { app } from 'electron'
import { loadSettings, saveSettings } from '../settings'
import { log } from './install'

let on = false

export const developerMode = (): boolean => on

const apply = (next: boolean): void => {
  on = next
  log().setLevel(next ? 'debug' : 'info')
}

/** 시작할 때 한 번 — installLogger 뒤 */
export const loadDeveloperMode = (): void => {
  apply(loadSettings(app.getPath('userData')).developerMode === true)
  if (on) log().info('main', 'developer mode on')
}

/** 저장한 뒤 바꾼다 — 저장이 실패하면 던지고 메모리 값도 그대로다 */
export const setDeveloperMode = (next: boolean): void => {
  const dir = app.getPath('userData')
  saveSettings(dir, { ...loadSettings(dir), developerMode: next })
  apply(next)
  log().info('main', `developer mode ${next ? 'on' : 'off'}`)
}
