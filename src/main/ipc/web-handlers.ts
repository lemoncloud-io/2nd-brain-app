// 웹 탭 IPC — 보낸 창의 view 만 다룬다(탭 id 는 창마다 따로다).
import { ipcMain } from 'electron'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import type { AddResult } from '../../shared/ipc-contract'
import { addPage, MAX_PAGE_BYTES, pageTooBig } from '../clip/clip-service'
import { createInFlight } from '../web/in-flight'
import { validRect } from '../web/web-rect'
import { webViews } from '../web/web-views'
import { clipVaultDir } from './clip-handlers'
import { mainT } from '../i18n'

/** 담는 중인 탭 — 두 번 눌러 같은 페이지를 두 개 쓰지 않는다(`clipLock` 은 위키화만 막는다) */
const clipOnce = createInFlight()

const clipPage = async (sender: Electron.WebContents, tabId: string): Promise<AddResult> => {
  const target = clipVaultDir(sender.id)
  if ('reason' in target) return { ok: false, reason: target.reason }
  const page = await webViews.pageHtml(sender, tabId, MAX_PAGE_BYTES)
  if ('failed' in page) {
    return {
      ok: false,
      reason: page.failed === 'too-big' ? pageTooBig() : mainT().clipMain.pageUnreadable
    }
  }
  return addPage(target.dir, page.url, page.html)
}

const isTabId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64

export const registerWebHandlers = (): void => {
  ipcMain.handle(APP_CHANNELS.webEnsure, (event, tabId: unknown, url: unknown): void => {
    if (!isTabId(tabId) || typeof url !== 'string') return
    webViews.ensure(event.sender, tabId, url)
  })
  ipcMain.handle(APP_CHANNELS.webNavigate, (event, tabId: unknown, url: unknown): boolean => {
    if (!isTabId(tabId) || typeof url !== 'string') return false
    return webViews.navigate(event.sender, tabId, url)
  })
  ipcMain.handle(APP_CHANNELS.webSetBounds, (event, tabId: unknown, rect: unknown): void => {
    if (!isTabId(tabId) || (rect !== null && !validRect(rect))) return
    webViews.setBounds(event.sender, tabId, rect)
  })
  ipcMain.handle(APP_CHANNELS.webClip, async (event, tabId: unknown): Promise<AddResult> => {
    if (!isTabId(tabId)) return { ok: false, reason: mainT().clipMain.pageUnreadable }
    return clipOnce(`${event.sender.id}\0${tabId}`, () => clipPage(event.sender, tabId), {
      ok: false,
      reason: mainT().clipMain.pageSaving
    })
  })
  ipcMain.handle(APP_CHANNELS.webCapture, (event, tabId: unknown): Promise<string | null> | null =>
    isTabId(tabId) ? webViews.capture(event.sender, tabId) : null
  )
  // 탭 id 하나만 받는 명령들 — 없는 탭이면 아무 일도 없다
  const byTab = [
    [APP_CHANNELS.webClose, webViews.close],
    [APP_CHANNELS.webBack, webViews.back],
    [APP_CHANNELS.webForward, webViews.forward],
    [APP_CHANNELS.webReload, webViews.reload],
    [APP_CHANNELS.webStop, webViews.stop]
  ] as const
  for (const [channel, run] of byTab) {
    ipcMain.handle(channel, (event, tabId: unknown): void => {
      if (isTabId(tabId)) run(event.sender, tabId)
    })
  }
}
