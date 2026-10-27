// 위키화 큐 기록 — userData/ingest-queue/<볼트 키>.json. 마지막 실행의 항목별 상태.
// 진행 중 죽으면 pending/processing 이 남는다 — 다음 시작이 덮어쓴다(재시작 복구).
// 쓰기는 임시 파일 → rename (writeJsonAtomic).
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { writeJsonAtomic } from '../fs/write-json-atomic'
import { vaultKey } from '../vault/vault-key'
import type { IngestQueueStatus, QueuedIngestItem } from '../../shared/ipc/clip-ingest'

const STATUSES: readonly IngestQueueStatus[] = [
  'pending',
  'processing',
  'done',
  'skipped',
  'empty',
  'failed',
  'canceled'
]

export type IngestQueueStore = {
  read(vaultDir: string): QueuedIngestItem[]
  write(vaultDir: string, items: QueuedIngestItem[]): void
  clear(vaultDir: string): void
}

const isItem = (value: unknown): value is QueuedIngestItem => {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item['clippingName'] === 'string' &&
    typeof item['rawName'] === 'string' &&
    typeof item['sha'] === 'string' &&
    (STATUSES as readonly string[]).includes(item['status'] as string) &&
    typeof item['attempts'] === 'number' &&
    typeof item['updatedAt'] === 'number'
  )
}

export const createIngestQueueStore = (userDataDir: () => string): IngestQueueStore => {
  const fileOf = (vaultDir: string): string =>
    join(userDataDir(), 'ingest-queue', `${vaultKey(vaultDir)}.json`)

  const read = (vaultDir: string): QueuedIngestItem[] => {
    try {
      const parsed = JSON.parse(readFileSync(fileOf(vaultDir), 'utf8')) as unknown
      return Array.isArray(parsed) ? parsed.filter(isItem) : []
    } catch {
      // 파일 없음·깨짐 — 빈 목록으로 시작한다
      return []
    }
  }

  const write = (vaultDir: string, items: QueuedIngestItem[]): void => {
    mkdirSync(join(userDataDir(), 'ingest-queue'), { recursive: true })
    writeJsonAtomic(fileOf(vaultDir), items, 2)
  }

  const clear = (vaultDir: string): void => {
    rmSync(fileOf(vaultDir), { force: true })
  }

  return { read, write, clear }
}
