import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { createHash } from 'node:crypto'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import { broadcast, sendToVault } from './broadcast'
import { currentVaultDir } from './clip-handlers'
import { openableInVault, resolveInVault } from '../vault/vault-path'
import { isHistoryFile, isVaultFile, vaultTree } from '../vault/vault-scope'
import { WikiService } from '../wiki/wiki-service'
import { parseWikiPage } from '../../shared/wiki/parse'
import { VaultWatchers } from '../vault/vault-watchers'
import { vaultActivity } from '../vault/vault-activity'
import { createAiLintService, LINT_PAGE_LIMIT } from '../lint/ai-lint'
import { createEngine, resolveEngineCli } from './handlers'
import type { EngineCli } from '../engine/create-engine'
import { reviewItems } from './review-items-handlers'
import { recordLintResult } from '../review/review-item-store'
import { withVaultGit } from '../vault/vault-queue'
import {
  createFolder,
  createNote,
  moveEntry,
  movableEntry,
  renameEntry
} from '../vault/tree-actions'
import { readBase } from '../vault/base-service'
import { saveAttachment } from '../vault/attachments'
import { listTemplates } from '../vault/note-templates'
import { listBookmarks, toggleBookmark } from '../vault/bookmarks'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { INGEST_LOCK } from '../engine/cli-process'
import { docAt, docHistory } from '../vault/doc-history'
import { DETAIL_MARK } from '../../shared/engine-failure'
import type { Engine } from '../engine/engine'
import { applyMerge, readMergePair, runMergeProposal, undoMerge } from '../wiki/merge-service'
import { mainT } from '../i18n'

// 보관함별 감시 — 같은 보관함은 하나로 공유하고, 여는 창 수만큼 센다.
// 닫힘·전환 때 참조를 놓고, 0이 되면 멈춘다.
const vaultWatchers = new VaultWatchers()

/** 그 보관함을 연 창에만 — 다른 보관함 창은 다시 읽지 않는다 */
const pushWikiChanged = (vaultDir: string, rels: string[]): void =>
  sendToVault(vaultDir, APP_CHANNELS.wikiChanged, rels)

// fs 실패의 원문(경로·시스템 코드) — 화면에는 칸막이 뒤에 접어 두고 앞에는 할 일을 말한다.
// 앞 3곳(list·treeAction·entryAction)보다 뒤에 정의돼 있어도 부르는 시점에는 살아 있다 —
// 모듈로 올겨 핸들러 등록 순서에 묶지 않는다
const detailOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** 그 보관함을 연 창에 상태 재확인 신호(빈 묶음) — 이미 마운트된 탭들이 목록을 다시 읽는다.
 * dir 없으면 전체 방송(단일 창 흐름·슬라이스 02 이전 동기화 경로) */
export const notifyVaultSwitched = (vaultDir?: string): void => {
  if (vaultDir === undefined) broadcast(APP_CHANNELS.wikiChanged, [])
  else pushWikiChanged(vaultDir, [])
}

/** 창이 보관함을 열 때 — 같은 보관함은 감시자 하나로 공유한다 */
export const ensureVaultWatched = (vaultDir: string): void => {
  vaultWatchers.ensure(vaultDir, {
    onChange: (rels) => {
      pushWikiChanged(vaultDir, rels)
    },
    onError: () => {
      // 볼트 폴더 삭제·이동·권한 — 감시를 버리고 그 보관함 창만 상태를 재확인하게 빈 묶음 푸시
      vaultWatchers.drop(vaultDir)
      pushWikiChanged(vaultDir, [])
    },
    // 위키화·확정 중에는 적립만 — 끝나면 release에서 1회 보낸다
    isHeld: () => vaultActivity.clipLock(vaultDir) !== null
  })
}

/** 창이 보관함을 닫을 때 — 아무도 안 보면 감시를 멈춘다 */
export const releaseVaultWatch = (vaultDir: string): void => {
  vaultWatchers.release(vaultDir)
}

/** 열린 감시를 전부 멈춘다 — 마지막 창이 닫힐 때 */
export const stopAllWatches = (): void => {
  for (const dir of vaultWatchers.dirs()) vaultWatchers.drop(dir)
}

/** VaultActivity 가 끝났을 때 쉬고 있는 감시의 적립된 변경을 1회 푸시한다 */
export const releaseIdleWatchers = (): void => {
  for (const dir of vaultWatchers.dirs()) {
    if (vaultActivity.clipLock(dir) === null) vaultWatchers.peek(dir)?.watcher.release()
  }
}

// AI 점검·합치기 제안 엔진 — 등록 함수가 아니라 모듈이 쥔다. 볼트 전환 때 끊어야 해서
// (옛 보관함에 계속 쓰면 B 화면에 A 진행이 뜬다) 핸들러 안에서 만들지 않는다
const lintCliRef: { current: EngineCli | null } = { current: null }
const aiLint = createAiLintService(() => {
  if (!lintCliRef.current) throw new Error(mainT().mainErrors.engineUnchecked)
  return createEngine('lint', lintCliRef.current)
})
let merging: { engine: Engine | null; canceled: boolean; vaultDir: string } | null = null
/** 도는 AI 점검의 보관함 — 전환 때 같은 보관함 것만 끊는다 */
let lintVault: string | null = null

/** 볼트 전환 — 옛 보관함에 묶인 점검·합치기 제안을 끊는다. 다른 보관함은 그대로 돈다 */
export const cancelAiWorkForVaultSwitch = (oldVaultDir?: string): void => {
  if (oldVaultDir === undefined || lintVault === oldVaultDir) aiLint.cancel()
  if (merging !== null && (oldVaultDir === undefined || merging.vaultDir === oldVaultDir)) {
    merging.canceled = true
    merging.engine?.cancel()
  }
}

export const registerWikiHandlers = (): void => {
  ipcMain.handle(APP_CHANNELS.listWikiPages, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    try {
      return WikiService.list(vaultDir)
    } catch (err) {
      console.error('could not list the wiki', err)
      return { error: `${mainT().wikiMain.listFailed}${DETAIL_MARK}${detailOf(err)}` }
    }
  })

  // 그래프 — 볼트 전체 md를 본다. wiki/ 없는 generic 폴더에서도 그려진다
  ipcMain.handle(APP_CHANNELS.listGraphPages, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    try {
      return WikiService.listGraphPages(vaultDir)
    } catch (err) {
      console.error('could not list the graph', err)
      return { error: `${mainT().wikiMain.graphFailed}${DETAIL_MARK}${detailOf(err)}` }
    }
  })

  ipcMain.handle(APP_CHANNELS.listVaultDocs, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    try {
      // 본문은 빼고 목록에 필요한 것만 — IPC 로 보관함 전체 본문이 건너가지 않게
      return WikiService.listDocs(vaultDir).map(({ rel, title }) => ({ rel, title }))
    } catch (err) {
      console.error('could not list documents', err)
      return { error: `${mainT().wikiMain.docsFailed}${DETAIL_MARK}${detailOf(err)}` }
    }
  })

  ipcMain.handle(APP_CHANNELS.listVaultTree, async (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    try {
      return await vaultTree(vaultDir)
    } catch (err) {
      // 원문(경로·시스템 코드)은 로그로만 — 화면에는 할 일을 말한다
      console.error('could not read the file tree', err)
      return {
        error: mainT().wikiMain.treeFailed
      }
    }
  })

  // renderer 입력 — 폴더 경로는 tree-actions 가 보관함 안인지 다시 본다
  const treeAction =
    (make: typeof createNote) =>
    (
      event: IpcMainInvokeEvent,
      folder: unknown,
      name: unknown
    ): { rel: string } | { error: string } => {
      if (typeof folder !== 'string') return { error: mainT().mainErrors.badPath }
      // 이름은 트리가 인라인 칸에서 받아 온다 — 안 주면 tree-actions 가 기본 이름을 고른다
      if (name !== undefined && typeof name !== 'string')
        return { error: mainT().mainErrors.badName }
      const vaultDir = currentVaultDir(event.sender.id)
      if (!vaultDir) return { error: mainT().common.noVault }
      try {
        const result = make(vaultDir, folder, name)
        if (!result.ok) return { error: result.reason }
        // 폴더는 감시가 알리지 않는다(확장자 없는 경로) — 트리가 다시 읽게 알린다
        pushWikiChanged(vaultDir, [result.rel])
        return { rel: result.rel }
      } catch (err) {
        console.error('could not create the entry', err)
        return { error: `${mainT().wikiMain.createFailed}${DETAIL_MARK}${detailOf(err)}` }
      }
    }
  ipcMain.handle(APP_CHANNELS.createVaultNote, treeAction(createNote))
  ipcMain.handle(APP_CHANNELS.createVaultFolder, treeAction(createFolder))

  // 이름 바꾸기·옮기기·지우기 — 위키화·확정·채팅 쓰기 중에는 그 도구가 보관함을 쥐고 있다
  const busyReason = (vaultDir: string): string | null => {
    if (vaultActivity.editLock(vaultDir)) return mainT().mainErrors.aiWriting
    if (existsSync(join(vaultDir, INGEST_LOCK))) return mainT().mainErrors.ingestWriting
    return null
  }
  const entryAction =
    (
      change: (
        vaultDir: string,
        rel: string,
        arg: string,
        nameHasExt?: boolean
      ) => ReturnType<typeof renameEntry>
    ) =>
    (
      event: IpcMainInvokeEvent,
      rel: unknown,
      arg: unknown,
      // 트리가 확장자까지 보여 주고 받은 이름인가 — 이름 바꾸기만 본다(옮기기는 이 인자를 안 쓴다)
      nameHasExt: unknown
    ): { rel: string } | { error: string } => {
      if (typeof rel !== 'string' || typeof arg !== 'string')
        return { error: mainT().mainErrors.badPath }
      const vaultDir = currentVaultDir(event.sender.id)
      if (!vaultDir) return { error: mainT().common.noVault }
      const busy = busyReason(vaultDir)
      if (busy) return { error: busy }
      try {
        const result = change(vaultDir, rel, arg, nameHasExt === true)
        if (!result.ok) return { error: result.reason }
        pushWikiChanged(vaultDir, [rel, result.rel])
        return { rel: result.rel }
      } catch (err) {
        console.error('could not rename or move', rel, err)
        return { error: `${mainT().wikiMain.renameFailed}${DETAIL_MARK}${detailOf(err)}` }
      }
    }
  ipcMain.handle(APP_CHANNELS.renameVaultEntry, entryAction(renameEntry))
  ipcMain.handle(APP_CHANNELS.moveVaultEntry, entryAction(moveEntry))
  ipcMain.handle(APP_CHANNELS.readBase, async (event, rel: unknown) => {
    if (typeof rel !== 'string') return { views: [], error: mainT().mainErrors.badPath }
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { views: [], error: mainT().common.noVault }
    return readBase(vaultDir, rel)
  })
  ipcMain.handle(APP_CHANNELS.trashVaultEntry, async (event, rel: unknown) => {
    if (typeof rel !== 'string') return { error: mainT().mainErrors.badPath }
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    const busy = busyReason(vaultDir)
    if (busy) return { error: busy }
    const entry = movableEntry(vaultDir, rel)
    if (!entry.ok) return { error: entry.reason }
    try {
      await shell.trashItem(entry.full)
      pushWikiChanged(vaultDir, [rel])
      return { ok: true }
    } catch (err) {
      console.error('could not move to trash', rel, err)
      return { error: `${mainT().wikiMain.trashFailed}${DETAIL_MARK}${detailOf(err)}` }
    }
  })

  ipcMain.handle(APP_CHANNELS.readWikiPage, (event, rel: unknown) => {
    if (typeof rel !== 'string' || rel.length === 0) return { error: mainT().mainErrors.badPath }
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    const result = WikiService.read(vaultDir, rel)
    if (!result) return { error: mainT().wikiMain.pageUnreadable }
    const page = parseWikiPage(rel, result.text)
    return { page, ...result }
  })

  // 트리 진행 고리 — 펼친 폴더 단위로 한 번에 묻는다(행마다 부르지 않는다)
  ipcMain.handle(APP_CHANNELS.checkboxCounts, (event, rels: unknown) => {
    if (!Array.isArray(rels)) return {}
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return {}
    return WikiService.checkboxCounts(
      vaultDir,
      rels.filter((rel): rel is string => typeof rel === 'string')
    )
  })

  ipcMain.handle(
    APP_CHANNELS.writeWikiPage,
    async (event, rel: unknown, text: unknown, baseHash: unknown) => {
      if (typeof rel !== 'string' || typeof text !== 'string' || typeof baseHash !== 'string') {
        return { error: mainT().mainErrors.badRequest }
      }
      const vaultDir = currentVaultDir(event.sender.id)
      if (!vaultDir) return { error: mainT().common.noVault }
      try {
        // 받기가 `fetch` 를 기다리는 사이에 커밋이 끼지 않게 같은 줄에 선다
        const result = await withVaultGit(vaultDir, () =>
          WikiService.write(vaultDir, rel, text, baseHash)
        )
        return result.ok
          ? { ok: true, hash: createHash('sha256').update(text).digest('hex') }
          : { error: result.reason }
      } catch (err) {
        console.error('could not save the document', rel, err)
        return { error: `${mainT().mainErrors.saveFailed}${DETAIL_MARK}${detailOf(err)}` }
      }
    }
  )

  ipcMain.handle(
    APP_CHANNELS.writeTextFile,
    async (event, rel: unknown, text: unknown, baseHash: unknown) => {
      if (typeof rel !== 'string' || typeof text !== 'string' || typeof baseHash !== 'string') {
        return { error: mainT().mainErrors.badRequest }
      }
      const vaultDir = currentVaultDir(event.sender.id)
      if (!vaultDir) return { error: mainT().common.noVault }
      try {
        const result = await withVaultGit(vaultDir, () =>
          WikiService.writeText(vaultDir, rel, text, baseHash)
        )
        return result.ok
          ? { ok: true, hash: createHash('sha256').update(text).digest('hex') }
          : { error: result.reason }
      } catch (err) {
        console.error('could not save the text file', rel, err)
        return { error: `${mainT().mainErrors.saveFailed}${DETAIL_MARK}${detailOf(err)}` }
      }
    }
  )

  // 문서 기록 — 읽기만 한다. md 가 아닌 글자 파일(html·코드)도 준다(`isHistoryFile`).
  // 되돌리기는 md 만: 화면이 그 버전 글을 writeWikiPage 로 저장한다(같은 확인을 탄다)
  const historyTarget = (
    rel: unknown,
    senderId?: number
  ): { vaultDir: string; rel: string } | { error: string } => {
    const vaultDir = currentVaultDir(senderId)
    if (!vaultDir) return { error: mainT().common.noVault }
    if (typeof rel !== 'string' || !isHistoryFile(rel) || resolveInVault(vaultDir, rel) === null) {
      return { error: mainT().mainErrors.badPath }
    }
    return { vaultDir, rel }
  }
  ipcMain.handle(APP_CHANNELS.docHistory, (event, rel: unknown) => {
    const target = historyTarget(rel, event.sender.id)
    if ('error' in target) return target
    try {
      return docHistory(target.vaultDir, target.rel)
    } catch (error) {
      console.error('could not read document history', target.rel, error)
      return { error: `${mainT().wikiMain.historyFailed}${DETAIL_MARK}${detailOf(error)}` }
    }
  })
  ipcMain.handle(APP_CHANNELS.docAt, (event, rel: unknown, rev: unknown) => {
    const target = historyTarget(rel, event.sender.id)
    if ('error' in target) return target
    try {
      const text = typeof rev === 'string' ? docAt(target.vaultDir, target.rel, rev) : null
      return text === null ? { error: mainT().wikiMain.versionMissing } : { text }
    } catch (error) {
      console.error('could not read the document version', target.rel, rev, error)
      return { error: `${mainT().wikiMain.versionFailed}${DETAIL_MARK}${detailOf(error)}` }
    }
  })

  ipcMain.handle(APP_CHANNELS.saveAttachment, (event, name: unknown, bytes: unknown) => {
    if (typeof name !== 'string' || !(bytes instanceof Uint8Array))
      return { error: mainT().mainErrors.badRequest }
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    try {
      const result = saveAttachment(vaultDir, name, bytes)
      return result.ok ? { rel: result.rel } : { error: result.reason }
    } catch (err) {
      console.error('could not add the attachment', err)
      return { error: `${mainT().wikiMain.attachFailed}${DETAIL_MARK}${detailOf(err)}` }
    }
  })

  ipcMain.handle(APP_CHANNELS.unlinkedMentions, (event, rel: unknown) => {
    if (typeof rel !== 'string' || rel === '') return { error: mainT().mainErrors.badPath }
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    try {
      return WikiService.unlinkedMentions(vaultDir, rel)
    } catch (err) {
      console.error('could not list mentions', rel, err)
      return { error: `${mainT().wikiMain.mentionsFailed}${DETAIL_MARK}${detailOf(err)}` }
    }
  })

  ipcMain.handle(APP_CHANNELS.listTags, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    try {
      return WikiService.tags(vaultDir)
    } catch (err) {
      console.error('could not read tags', err)
      return { error: `${mainT().wikiMain.tagsFailed}${DETAIL_MARK}${detailOf(err)}` }
    }
  })

  ipcMain.handle(APP_CHANNELS.listBookmarks, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    return vaultDir ? listBookmarks(vaultDir) : []
  })

  ipcMain.handle(APP_CHANNELS.toggleBookmark, (event, rel: unknown) => {
    if (typeof rel !== 'string' || rel === '') return { error: mainT().mainErrors.badPath }
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    // 보관함 밖·숨김 폴더를 가리키는 경로는 달지 않는다
    const full = resolveInVault(vaultDir, rel)
    if (full === null || !isVaultFile(rel)) return { error: mainT().wikiMain.bookmarkOnlyVault }
    try {
      const result = toggleBookmark(vaultDir, rel)
      return result.ok ? { bookmarks: result.bookmarks } : { error: result.reason }
    } catch (err) {
      console.error('could not change the bookmark', rel, err)
      return { error: `${mainT().wikiMain.bookmarkFailed}${DETAIL_MARK}${detailOf(err)}` }
    }
  })

  ipcMain.handle(APP_CHANNELS.listTemplates, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    return vaultDir ? listTemplates(vaultDir) : []
  })

  ipcMain.handle(APP_CHANNELS.getEditLock, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return mainT().common.noVault
    return vaultActivity.editLock(vaultDir)
  })

  // 리더 외부 링크 — http·https·mailto만 연다
  ipcMain.handle(APP_CHANNELS.openExternal, (_event, url: unknown) => {
    if (typeof url !== 'string') return
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return
    }
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      void shell.openExternal(url)
    }
  })

  ipcMain.handle(APP_CHANNELS.lintWiki, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    return WikiService.lint(vaultDir)
  })

  // AI 점검(슬라이스 13) — lint 프로필 엔진, 볼트 읽기 전용. 진행 중 1개, 취소 가능.
  // 엔진 핸들은 모듈이 쥰다(aiLint·merging) — 볼트 전환 때 끊는다
  ipcMain.handle(APP_CHANNELS.lintAiPages, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return 0
    // 화면이 "약 N페이지를 점검합니다" 로 쓰는 값이다 — 실제로 보내는 수와 같아야 한다
    return Math.min(WikiService.list(vaultDir).length, LINT_PAGE_LIMIT)
  })
  ipcMain.handle(APP_CHANNELS.lintAiRun, async (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { status: 'unparsed', reason: mainT().common.noVault }
    const cli = await resolveEngineCli()
    if ('error' in cli) return { status: 'unparsed', reason: cli.error }
    lintCliRef.current = cli
    // 무거운 작업 슬롯 — 점검은 한 번에 하나만 돈다
    const end = vaultActivity.begin('lint', vaultDir)
    if (typeof end !== 'function') return { status: 'unparsed', reason: end.busy }
    lintVault = vaultDir
    try {
      // 발견은 승인 탭 검토 항목에도 쌓는다 — 기록이 실패해도 점검 결과는 돌려준다.
      // 진행은 요청한 보관함 창에만 — 다른 보관함 창은 건드리지 않는다
      return recordLintResult(
        reviewItems,
        vaultDir,
        await aiLint.run(vaultDir, (payload) =>
          sendToVault(vaultDir, APP_CHANNELS.lintAiEvent, payload)
        )
      )
    } finally {
      if (lintVault === vaultDir) lintVault = null
      end()
    }
  })
  ipcMain.handle(APP_CHANNELS.lintAiCancel, (event) => {
    // 점검 중인 보관함 일만 끊는다 — 보관함 없는 창은 아무것도 끊지 않는다
    const vaultDir = currentVaultDir(event.sender.id)
    if (vaultDir && lintVault === vaultDir) aiLint.cancel()
  })

  // 중복 합치기(슬라이스 09) — 제안은 lint 프로필 엔진(읽기 전용)이 무거운 작업 슬롯에서, 받기·되돌리기는
  // 노트 쓰기와 같은 배타 슬롯에서 받기(fetch)와 줄을 서서 커밋한다
  // 제안 하나만 — 새 요청이 오면 앞의 것을 멈추고 자리를 넘겨받는다(창을 닫았다 다시 연 때, 개발 모드의 두 번 실행).
  // 엔진을 만들기 전에 온 멈추기도 기억해 두었다가 만들자마자 멈춘다.
  // `merging` 핸들은 모듈이 쥔다 — 볼트 전환 때 끊는다
  ipcMain.handle(APP_CHANNELS.mergePropose, async (event, relA: unknown, relB: unknown) => {
    if (typeof relA !== 'string' || typeof relB !== 'string')
      return { error: mainT().wikiMain.badPages }
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    // 제안 하나만 — 같은 보관함의 앞 요청은 멈추고 자리를 넘겨받는다.
    // 다른 보관함이 만들고 있으면 건드리지 않고 기다리라고 한다
    if (merging !== null && merging.vaultDir !== vaultDir) {
      return { error: mainT().wikiMain.proposeBusy }
    }
    if (merging !== null) {
      merging.canceled = true
      merging.engine?.cancel()
    }
    const run: { engine: Engine | null; canceled: boolean; vaultDir: string } = {
      engine: null,
      canceled: false,
      vaultDir
    }
    merging = run
    let end: (() => void) | null = null
    try {
      const draft = readMergePair(vaultDir, relA, relB)
      if ('error' in draft) return draft
      const cli = await resolveEngineCli()
      if ('error' in cli) return { error: cli.error }
      const begun = vaultActivity.begin('lint', vaultDir)
      if (typeof begun !== 'function') return { error: begun.busy }
      end = begun
      if (run.canceled) return { error: mainT().wikiMain.proposeStopped }
      run.engine = createEngine('lint', cli)
      const proposal = await runMergeProposal(run.engine, vaultDir, draft)
      return 'error' in proposal ? proposal : { ...draft, body: proposal.body }
    } catch (error) {
      console.error('merge proposal failed', error)
      return { error: `${mainT().wikiMain.proposeFailed}${DETAIL_MARK}${detailOf(error)}` }
    } finally {
      if (merging === run) merging = null
      end?.()
    }
  })
  ipcMain.handle(APP_CHANNELS.mergeCancel, (event) => {
    if (merging === null) return
    // 제안 중인 보관함 일만 끊는다 — 보관함 없는 창은 아무것도 끊지 않는다
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir || merging.vaultDir !== vaultDir) return
    merging.canceled = true
    merging.engine?.cancel()
  })
  const exclusive = async <T>(
    vaultDir: string,
    fn: () => T
  ): Promise<T | { ok: false; reason: string }> => {
    const end = vaultActivity.begin('note', vaultDir)
    if (typeof end !== 'function') return { ok: false, reason: end.busy }
    try {
      return await withVaultGit(vaultDir, fn)
    } finally {
      end()
    }
  }
  ipcMain.handle(APP_CHANNELS.mergeApply, async (event, input: unknown) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    const fields = ['keep', 'drop', 'body', 'keepHash', 'dropHash'] as const
    const value = input as Record<(typeof fields)[number], unknown> | null
    if (!value || fields.some((key) => typeof value[key] !== 'string')) {
      return { error: mainT().wikiMain.badMerge }
    }
    try {
      const result = await exclusive(vaultDir, () =>
        applyMerge(vaultDir, value as Record<(typeof fields)[number], string>)
      )
      return result.ok ? result : { error: result.reason }
    } catch (error) {
      console.error('merge failed', error)
      return { error: `${mainT().wikiMain.mergeFailed}${DETAIL_MARK}${detailOf(error)}` }
    }
  })
  ipcMain.handle(APP_CHANNELS.mergeUndo, async (event, commit: unknown) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    if (typeof commit !== 'string') return { error: mainT().wikiMain.undoMissing }
    try {
      const result = await exclusive(vaultDir, () => undoMerge(vaultDir, commit))
      return result.ok ? { ok: true } : { error: result.reason }
    } catch (error) {
      console.error('merge undo failed', error)
      return { error: `${mainT().wikiMain.undoFailed}${DETAIL_MARK}${detailOf(error)}` }
    }
  })

  // 미리보기 못 하는 확장자 — Finder에서 파일 표시
  ipcMain.handle(APP_CHANNELS.revealInFinder, (event, rel: unknown) => {
    if (typeof rel !== 'string') return
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return
    const full = resolveInVault(vaultDir, rel)
    if (full) shell.showItemInFolder(full)
  })

  // html·워드·파워포인트만 — 다른 형식을 기본 앱으로 열면 스크립트·실행 파일이 돈다(링크면 실제 대상으로 판정).
  // 워드·파워포인트는 사용자가 누른 기본 앱 열기다 — Finder 에서 두 번 누르는 것과 같은 위험(바깥 서식 연결 등)을 지닌다
  ipcMain.handle(APP_CHANNELS.openInBrowser, async (event, rel: unknown) => {
    if (typeof rel !== 'string') return
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return
    const full = openableInVault(vaultDir, rel, ['html', 'office'])
    if (full) await shell.openPath(full)
  })
}
