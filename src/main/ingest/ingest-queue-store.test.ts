import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vaultKey } from '../vault/vault-key'
import { createIngestQueueStore } from './ingest-queue-store'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'ingest-queue-'))

describe('createIngestQueueStore', () => {
  it('쓰고 읽으면 같은 항목이 돌아오고, 다시 열어도 남는다', () => {
    const userData = tmp()
    try {
      const store = createIngestQueueStore(() => userData)
      store.write('/v', [
        {
          clippingName: 'a.md',
          rawName: 'a.md',
          sha: 'abc',
          status: 'done',
          attempts: 1,
          updatedAt: 1
        }
      ])
      expect(createIngestQueueStore(() => userData).read('/v')).toMatchObject([
        { clippingName: 'a.md', status: 'done' }
      ])
    } finally {
      rmSync(userData, { recursive: true, force: true })
    }
  })

  it('지우면 비고, 깨진 파일·모르는 상태는 빈 목록으로 읽힌다', () => {
    const userData = tmp()
    try {
      const store = createIngestQueueStore(() => userData)
      expect(store.read('/v')).toEqual([])
      store.write('/v', [
        {
          clippingName: 'a.md',
          rawName: 'a.md',
          sha: 'x',
          status: 'done',
          attempts: 1,
          updatedAt: 1
        }
      ])
      store.clear('/v')
      expect(store.read('/v')).toEqual([])
      writeFileSync(join(userData, 'ingest-queue', `${vaultKey('/v')}.json`), '{깨짐')
      expect(store.read('/v')).toEqual([])
    } finally {
      rmSync(userData, { recursive: true, force: true })
    }
  })
})
