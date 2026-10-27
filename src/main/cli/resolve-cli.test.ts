import { describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile, resolveCli } from './resolve-cli'

describe('execFile spawn 실패', () => {
  it('없는 파일은 원인을 stderr에 남긴다', async () => {
    const result = await execFile('/nonexistent/xyz-123', ['--version'], 3000)
    expect(result.code).toBe(-1)
    expect(result.stderr).toMatch(/ENOENT|spawn/)
  })
})

describe('resolveCli spawn 실패', () => {
  it('실행권한 없는 override는 미설치가 아닌 실행 실패로 안내한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-noexec-'))
    try {
      const file = join(dir, 'claude')
      writeFileSync(file, '#!/bin/sh\necho x\n')
      chmodSync(file, 0o644)
      const result = await resolveCli('claude', file, {
        PATH: '/nonexistent',
        HOME: '/nonexistent'
      })
      expect(result).toMatchObject({ missing: true })
      if (!('missing' in result) || !result.missing) return
      expect(result.reason).toMatch(/실행|권한|EACCES/)
      expect(result.reason).not.toContain('설치돼 있지 않아요')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
