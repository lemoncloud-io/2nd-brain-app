// 위키화 IPC — 한 번에 하나만 돈다. 진행 이벤트는 요청한 창으로 흘려보낸다.
import { app, ipcMain } from 'electron'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import type { EngineEvent, IngestOutcome, QueuedIngestItem } from '../../shared/ipc-contract'
import type { Engine } from '../engine/engine'
import { createIngestQueueStore } from '../ingest/ingest-queue-store'
import { runPipeline, type DraftRunner, type IngestQueueHooks } from '../ingest/pipeline'
import { vaultActivity } from '../vault/vault-activity'
import { currentVaultDir } from './clip-handlers'
import { requireFullVault } from '../vault/vault-service'
import { createEngine, resolveEngineCli } from './handlers'
import { runSync } from './sync-handlers'
import { mainT } from '../i18n'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

// 마지막 실행 큐 기록 — userData 영속. 진행 중 죽으면 pending/processing 이 남고 다음 시작이 덮어쓴다
const queueStore = createIngestQueueStore(() => app.getPath('userData'))

/** 기록 실패는 위키화·전환을 막지 않는다 — 조용히 둔다 */
const safeWrite = (vaultDir: string, queue: QueuedIngestItem[]): void => {
  try {
    queueStore.write(vaultDir, queue)
  } catch {
    // 기록 실패는 위키화를 막지 않는다
  }
}

const safeClear = (vaultDir: string): void => {
  try {
    queueStore.clear(vaultDir)
  } catch {
    // 기록 실패는 전환을 막지 않는다
  }
}

/** 끝난 항목(done/skipped/empty)은 예외 경로의 failed/canceled 일괄 표시가 덮지 않는다 */
const TERMINAL_QUEUE = ['done', 'skipped', 'empty'] as const

// 엔진을 만들기 전(CLI 상태 확인 중)에 온 취소도 놓치지 않는다
let cancelRequested = false
let running: Engine | null = null

/** 위키화 직전 팀 받기의 가져오기 상한 — 델타 받기에는 넉넉하고 멈춘 네트워크에는 붙잡히지 않는다 */
const PRE_SYNC_TIMEOUT_MS = 25_000

const startIngest = async (
  send: (event: EngineEvent) => void,
  skipSync = false,
  senderId?: number
): Promise<IngestOutcome> => {
  const vaultDir = currentVaultDir(senderId)
  if (!vaultDir) return { status: 'failed', reason: mainT().common.noVault }
  const generic = requireFullVault(vaultDir)
  if (generic) return { status: 'failed', reason: generic }
  if (!skipSync) {
    // 위키화 직전 — 팀 것을 먼저 받아 두면 AI 가 옛 보관함 위에 쓰지 않는다.
    // 가져오기가 멈춘 네트워크에 붙잡히지 않게 상한을 둔다 — 넘기면 사람이 고른다(없이 시작·다시 받기)
    send({ type: 'phase', label: mainT().ingestMain.phaseSync })
    const synced = await runSync({ fetchTimeoutMs: PRE_SYNC_TIMEOUT_MS }, vaultDir)
    if (synced.error) return { status: 'sync-needed', reason: synced.error }
  }
  const end = vaultActivity.begin('ingest', vaultDir)
  if (typeof end !== 'function') return { status: 'failed', reason: end.busy }
  cancelRequested = false
  // 묵은 기록(죽은 실행의 pending)은 새 실행이 덮는다 — 재시작 복구
  safeClear(vaultDir)
  try {
    send({ type: 'phase', label: mainT().ingestMain.phaseEngine })
    const cli = await resolveEngineCli()
    if ('error' in cli) return { status: 'failed', reason: cli.error }

    // 초안은 소량 클리핑당 1회·대량 묶음 1회 읽기 전용 호출 — 파일 쓰기는 파이프라인이 코드로 한다
    const runner: DraftRunner = {
      run: (prompt) => {
        const draft = createEngine('draft', cli)
        running = draft
        if (cancelRequested) draft.cancel()
        return draft.run({ vaultDir, prompt })
      },
      isCanceled: () => cancelRequested
    }
    let queue: QueuedIngestItem[] = []
    const byName = new Map<string, QueuedIngestItem>()
    const saveQueue = (): void => safeWrite(vaultDir, queue)
    const hooks: IngestQueueHooks = {
      onPrepared: (clippings) => {
        const now = Date.now()
        queue = clippings.map((c) => ({
          clippingName: c.clippingName,
          rawName: c.rawName,
          sha: c.sha,
          status: 'pending' as const,
          attempts: 1,
          updatedAt: now
        }))
        byName.clear()
        for (const item of queue) byName.set(item.clippingName, item)
        saveQueue()
      },
      mark: (name, status) => {
        const item = byName.get(name)
        if (!item) return
        if (
          (TERMINAL_QUEUE as readonly string[]).includes(item.status) &&
          (status === 'failed' || status === 'canceled')
        ) {
          return
        }
        item.status = status
        item.updatedAt = Date.now()
        saveQueue()
      }
    }
    send({ type: 'phase', label: mainT().ingestMain.phaseWrite })
    return await runPipeline(vaultDir, runner, send, hooks)
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) }
  } finally {
    running = null
    end()
  }
}

export const isIngestRunning = (vaultDir?: string): boolean => {
  const dir = vaultDir ?? currentVaultDir()
  // 노트 쓰기는 위키화가 아니다 — 위키화 취소·진행 점이 노트 쓰기에 반응하지 않게 종류로 본다
  const kind = dir === null ? null : vaultActivity.holder(dir)
  return kind === 'ingest' || kind === 'finalize'
}

/** 보관함을 바꾸기 전에 부른다 — 옛 보관함 일인 위키화만 끊는다. 다른 보관함은 그대로 돈다 */
export const cancelIngestForVaultSwitch = (oldVaultDir?: string): void => {
  if (oldVaultDir !== undefined) {
    const kind = vaultActivity.holder(oldVaultDir)
    if (kind !== 'ingest' && kind !== 'finalize') {
      // 옛 보관함은 쉬고 있다 — 기록만 치우고 도는 위키화는 건드리지 않는다
      safeClear(oldVaultDir)
      return
    }
    // 옛 보관함 일이다 — 전역 게이트를 우회하고 직접 끊는다
    cancelRequested = true
    running?.cancel()
    safeClear(oldVaultDir)
    return
  }
  cancelIngest()
}

const cancelIngest = (vaultDir?: string): void => {
  if (!isIngestRunning(vaultDir)) return
  cancelRequested = true
  running?.cancel()
}

export const registerIngestHandlers = (): void => {
  ipcMain.handle(APP_CHANNELS.startIngest, (event, raw: unknown) =>
    startIngest(
      (payload) => {
        // 창이 닫혀도 진행 중인 위키화는 끝까지 돈다 — 전달 실패만 버린다
        try {
          if (!event.sender.isDestroyed()) event.sender.send(APP_CHANNELS.ingestEvent, payload)
        } catch {
          // 창이 사라졌다
        }
      },
      isRecord(raw) && raw.skipSync === true,
      event.sender.id
    )
  )
  ipcMain.handle(APP_CHANNELS.cancelIngest, (event) => {
    // 보관함 없는 창은 아무것도 끊지 않는다 — 전역 폴백이 남의 위키화를 죽이지 않게
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return
    cancelIngest(vaultDir)
  })
  ipcMain.handle(APP_CHANNELS.ingestQueue, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    return vaultDir ? queueStore.read(vaultDir) : []
  })
  // detached 프로세스 그룹이 앱 종료 뒤에 남지 않게 한다 — 어느 보관함 일인지 묻지 않고 끊는다
  app.on('before-quit', () => {
    cancelRequested = true
    running?.cancel()
  })
}
