// 모든 창에 IPC 푸시 — 닫히는 중인 창은 건너뛴다(send 가 던지는 경우 포함).
import { BrowserWindow } from 'electron'
import { bindings, resolveTargets } from '../window/window-vaults'

export const broadcast = (channel: string, ...args: unknown[]): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send(channel, ...args)
    } catch {
      // 창이 사라졌다
    }
  }
}

/** 그 보관함을 연 창에만 푸시 — 다른 보관함 창은 다시 읽지 않는다 */
export const sendToVault = (dir: string, channel: string, ...args: unknown[]): void => {
  const windows = BrowserWindow.getAllWindows()
  const targets = new Set(
    resolveTargets(
      bindings.idsFor(dir),
      windows.map((win) => ({ id: win.webContents.id, destroyed: win.isDestroyed() }))
    )
  )
  for (const win of windows) {
    try {
      if (targets.has(win.webContents.id)) win.webContents.send(channel, ...args)
    } catch {
      // 창이 사라졌다
    }
  }
}
