// 검토 항목 IPC(슬라이스 12) — AI 점검·검증 결함을 모은 목록, 무시. 공급은 lint·review 핸들러가 한다.
import { app, ipcMain } from 'electron'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import { createReviewItemStore } from '../review/review-item-store'
import { currentVaultDir } from './clip-handlers'
import { WikiService } from '../wiki/wiki-service'

// userData 덮어쓰기(setPath)는 모듈 로드 뒤에 일어난다 — 게터로 늦게 읽는다
// 위키 페이지 목록은 목록을 읽을 때마다 넘긴다 — 그사이 생긴 페이지의 '빠진 페이지' 항목이 빠진다
export const reviewItems = createReviewItemStore(
  () => app.getPath('userData'),
  (vaultDir) => WikiService.pageRefs(vaultDir)
)

export const registerReviewItemHandlers = (): void => {
  ipcMain.handle(APP_CHANNELS.listReviewItems, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    return vaultDir ? reviewItems.list(vaultDir) : []
  })
  ipcMain.handle(APP_CHANNELS.dismissReviewItem, (event, id: unknown) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir || typeof id !== 'string') return false
    return reviewItems.dismiss(vaultDir, id)
  })
  ipcMain.handle(APP_CHANNELS.listDismissedReviewItems, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    return vaultDir ? reviewItems.listDismissed(vaultDir) : []
  })
  ipcMain.handle(APP_CHANNELS.restoreReviewItem, (event, id: unknown) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir || typeof id !== 'string') return false
    return reviewItems.restore(vaultDir, id)
  })
}
