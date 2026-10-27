import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCliEngine } from './cli-process'
import type { EngineEvent } from '../../shared/ipc-contract'

describe('createCliEngine timeout', () => {
  it('끝나지 않는 CLI 를 자르고 사유+실패 done 으로 끝낸다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'engine-timeout-'))
    try {
      const engine = createCliEngine({
        name: 'test',
        cliPath: process.execPath,
        lock: false,
        // 끝나지 않는다 — 표준출력도 닫지 않는다
        args: () => ['-e', 'setInterval(() => {}, 1000)'],
        parseLine: () => ({ events: [] }),
        noResultMessage: 'x',
        timeoutMs: 300
      })
      const events: EngineEvent[] = []
      for await (const event of engine.run({ vaultDir: dir, prompt: 'x' })) events.push(event)
      expect(events.some((event) => event.type === 'error')).toBe(true)
      expect(events.at(-1)).toEqual({ type: 'done', ok: false, canceled: false })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
