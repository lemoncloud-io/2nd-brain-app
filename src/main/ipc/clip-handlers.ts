// 클리핑 IPC — full 보관함에서만 받는다. generic 폴더에는 Clippings/ 입력함이 없어
// 클리핑이 폴더를 만들기 전에 사유 문구로 거절한다.
import { app, ipcMain } from 'electron'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import type { AddResult } from '../../shared/ipc-contract'
import { addFile, addUrl } from '../clip/clip-service'
import { vaultActivity } from '../vault/vault-activity'
import { openVault, requireFullVault } from '../vault/vault-service'
import { loadSettings } from '../settings'
import { bindings, isVaultShown } from '../window/window-vaults'
import { mainT } from '../i18n'

/**
 * 이 요청을 보낸 창의 보관함 — 새 창 바인딩이 있으면 그것을 쓰고, 없으면 전역 설정(단일 창·구 흐름).
 * 묶인 폴더가 지워졌으면 그 창은 보관함 없음으로 — 남의 보관함을 대신 보여주지 않는다.
 */
export const currentVaultDir = (senderId?: number): string | null => {
  if (senderId !== undefined) {
    const bound = bindings.dirFor(senderId)
    if (bound !== null) return openVault(bound).ok ? bound : null
  }
  const { vaultDir } = loadSettings(app.getPath('userData'))
  if (!vaultDir) return null
  return openVault(vaultDir).ok ? vaultDir : null
}

/** 그 보관함을 연 창이 하나라도 있나 — 묶인 창도 전역 설정도 아니면 옛 보관함 일이다 */
export const isVaultOpen = (dir: string): boolean =>
  isVaultShown(dir, bindings.dirs(), loadSettings(app.getPath('userData')).vaultDir ?? null)

/** 자료를 담을 보관함 — 그 창의 보관함이 full 이고 위키화 중이 아니면 그 폴더, 아니면 거절 사유 */
export const clipVaultDir = (senderId: number): { dir: string } | { reason: string } => {
  const dir = currentVaultDir(senderId)
  if (!dir) return { reason: mainT().common.noVault }
  const reason = requireFullVault(dir) ?? vaultActivity.clipLock(dir)
  return reason ? { reason } : { dir }
}

export const registerClipHandlers = (): void => {
  ipcMain.handle(APP_CHANNELS.clipFile, async (event, srcPath: unknown): Promise<AddResult> => {
    if (typeof srcPath !== 'string' || srcPath.length === 0)
      return { ok: false, reason: mainT().clipMain.noFilePath }
    const target = clipVaultDir(event.sender.id)
    if ('reason' in target) return { ok: false, reason: target.reason }
    return addFile(target.dir, srcPath)
  })

  ipcMain.handle(APP_CHANNELS.clipUrl, async (event, url: unknown): Promise<AddResult> => {
    if (typeof url !== 'string' || url.length === 0)
      return { ok: false, reason: mainT().clipMain.noUrl }
    const target = clipVaultDir(event.sender.id)
    if ('reason' in target) return { ok: false, reason: target.reason }
    return addUrl(target.dir, url)
  })
}
