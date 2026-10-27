import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRunStore } from './run-store'
import { vaultKey } from '../vault/vault-key'

describe('run-store readAll', () => {
  it('못 읽은 기록 수를 버리지 않는다', () => {
    const root = mkdtempSync(join(tmpdir(), 'run-store-'))
    try {
      const store = createRunStore(() => root)
      const key = vaultKey(join(root, 'vault'))
      const good = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      const bad = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
      mkdirSync(join(root, key, good), { recursive: true })
      writeFileSync(
        join(root, key, good, 'run.json'),
        JSON.stringify({
          id: good,
          state: 'done',
          conversationId: 'c',
          startedAt: 1,
          base: 'x',
          ignoredOnly: true,
          before: {},
          snapshots: []
        })
      )
      mkdirSync(join(root, key, bad), { recursive: true })
      writeFileSync(join(root, key, bad, 'run.json'), '{broken')
      const { list, failed } = store.readAll(join(root, 'vault'))
      expect(list.map((r) => r.id)).toEqual([good])
      expect(failed).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('run-store readRecordOr 가드', () => {
  it.each([
    ['상위 탈출', '../../etc/passwd'],
    ['윈도우 탈출', '..\\..\\x'],
    ['빈 문자열', ''],
    ['대문자 UUID', 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'],
    ['36자 비-uuid', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz']
  ])('%s — gone이다', (_, id) => {
    const root = mkdtempSync(join(tmpdir(), 'run-store-'))
    try {
      const store = createRunStore(() => root)
      expect(store.readRecordOr(join(root, 'vault'), id)).toEqual({ gone: true })
      expect(store.readRecord(join(root, 'vault'), id)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('깨진 run.json은 failed다', () => {
    const root = mkdtempSync(join(tmpdir(), 'run-store-'))
    try {
      const store = createRunStore(() => root)
      const vault = join(root, 'vault')
      const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      const dir = join(root, vaultKey(vault), id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'run.json'), '{broken')
      expect(store.readRecordOr(vault, id)).toEqual({ failed: true })
      expect(store.readRecord(vault, id)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
