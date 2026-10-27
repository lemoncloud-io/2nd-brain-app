// 채팅 노트 실행 기록의 저장 자리 — `userData/snapshots/<보관함 키>/<실행 id>/`.
// note-run 이 쓰고, doc-changes 가 "바뀐 곳" 의 기준 시점을 찾을 때 읽는다.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ChangeSet } from '../../shared/ipc-contract'
import { writeJsonAtomic } from '../fs/write-json-atomic'
import { vaultKey } from '../vault/vault-key'

export type Sig = { size: number; mtimeMs: number }

/**
 * 실행 전 깨끗하지 않던 경로 — porcelain 두 글자(`??` 비추적, `!!` 무시)와 크기·수정 시각.
 * 사본이 없는 비추적 파일은 내용 해시도 둔다 — 수정 시각만 바뀐 것을 변경으로 읽지 않게
 */
export type Before = { code: string; sig: Sig | null; hash?: string }

export type RunRecord = {
  id: string
  state: 'running' | 'done'
  conversationId: string
  startedAt: number
  /** 자동 저장 뒤 HEAD — 추적 파일을 되돌릴 원본이자 "이번 답" 의 기준 커밋 */
  base: string
  ignoredOnly: boolean
  /** 실행 전 상태를 다 적었다 — 없으면 복구가 판정하지 않는다(모든 비추적 파일이 새것으로 보인다) */
  captured?: boolean
  before: Record<string, Before>
  /** files/ 에 사본을 둔 경로 — 마무리 뒤에는 바뀐 비추적 노트의 것만 남는다 */
  snapshots: string[]
  /** 엔진이 쓰려던 경로 — 실행 중에 쌓아 두어 끊긴 실행의 복구도 같은 근거로 판정한다 */
  saw?: string[]
  /** 엔진이 셸 같은 도구를 썼다 — 어떤 파일을 썼는지 알릴 길이 없으므로 범위 밖 새 파일을 전부 엔진 것으로 본다 */
  shell?: boolean
  changes?: ChangeSet | null
}

/** 없는 기록과 못 읽은 기록은 다른 일이다 — "지워졌다" 로 뭉치면 못 읽은 것을 없다고 단언하게 된다 */
export type RecordRead = { record: RunRecord } | { gone: true } | { failed: true }

export type RunStore = {
  runDir: (vaultDir: string, id: string) => string
  /** 실행 전 사본 — 비추적 노트를 되돌리고 "바뀐 곳" 의 기준으로 읽는다 */
  snapshotFile: (vaultDir: string, id: string, rel: string) => string
  readRecord: (vaultDir: string, id: string) => RunRecord | null
  readRecordOr: (vaultDir: string, id: string) => RecordRead
  writeRecord: (vaultDir: string, record: RunRecord) => void
  /** 못 읽은 기록 수까지 — 그 수가 0 이 아니면 "이 목록이 전부다" 라고 말할 수 없다 */
  readAll: (vaultDir: string) => { list: RunRecord[]; failed: number }
}

/** @param root 스냅샷 루트(userData/snapshots) — userData 는 모듈 로드 뒤에 바뀔 수 있어 늦게 읽는다 */
export const createRunStore = (root: () => string): RunStore => {
  const vaultRoot = (vaultDir: string): string => join(root(), vaultKey(vaultDir))
  const runDir = (vaultDir: string, id: string): string => join(vaultRoot(vaultDir), id)

  const readRecordOr = (vaultDir: string, id: string): RecordRead => {
    // 실행 id 는 renderer 에서 온다 — 경로 조각이 섞이면 읽지 않는다
    if (!/^[0-9a-f-]{36}$/.test(id)) return { gone: true }
    try {
      const record = JSON.parse(
        readFileSync(join(runDir(vaultDir, id), 'run.json'), 'utf8')
      ) as RunRecord
      return { record }
    } catch (error) {
      if ((error as { code?: unknown }).code === 'ENOENT') return { gone: true }
      console.error('could not read note run record', id, error)
      return { failed: true }
    }
  }

  const readRecord = (vaultDir: string, id: string): RunRecord | null => {
    const read = readRecordOr(vaultDir, id)
    return 'record' in read ? read.record : null
  }

  const readAll = (vaultDir: string): { list: RunRecord[]; failed: number } => {
    const dir = vaultRoot(vaultDir)
    if (!existsSync(dir)) return { list: [], failed: 0 }
    const list: RunRecord[] = []
    let failed = 0
    for (const id of readdirSync(dir)) {
      const read = readRecordOr(vaultDir, id)
      if ('record' in read) list.push(read.record)
      else if ('failed' in read) failed += 1
    }
    return { list, failed }
  }

  return {
    runDir,
    snapshotFile: (vaultDir, id, rel) => join(runDir(vaultDir, id), 'files', rel),
    readRecord,
    readRecordOr,
    writeRecord: (vaultDir, record) =>
      writeJsonAtomic(join(runDir(vaultDir, record.id), 'run.json'), record),
    readAll
  }
}
