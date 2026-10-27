// 검색 IPC — 키워드(BM25) 검색만 쓴다(한글 부분 일치 포함).
import { ipcMain } from 'electron'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import { WikiService } from '../wiki/wiki-service'
import { currentVaultDir } from './clip-handlers'
import { searchVault } from '../wiki/search-vault'
import { DETAIL_MARK } from '../../shared/engine-failure'
import { mainT } from '../i18n'

export const registerSearchHandlers = (): void => {
  ipcMain.handle(APP_CHANNELS.searchWiki, async (event, query: unknown, limit: unknown) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    try {
      return await searchVault(() => WikiService.listDocs(vaultDir), query, limit)
    } catch (err) {
      console.error('wiki search failed', err)
      const detail = err instanceof Error ? err.message : String(err)
      return { error: `${mainT().wikiMain.searchFailed}${DETAIL_MARK}${detail}` }
    }
  })
}
