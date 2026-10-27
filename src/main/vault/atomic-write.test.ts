import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomic-write'

describe('writeJsonAtomic', () => {
  it('쓰고 읽으면 같다 — 임시 파일은 남지 않는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-'))
    try {
      const file = join(dir, 'sub', 'store.json')
      writeJsonAtomic(file, { a: 1 })
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: 1 })
      expect(readdirSync(join(dir, 'sub'))).toEqual(['store.json'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('덮어써도 예전 내용이 섞이지 않는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-'))
    try {
      const file = join(dir, 'store.json')
      writeFileSync(file, '{"stale":true}\n')
      writeJsonAtomic(file, { fresh: [1, 2] })
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ fresh: [1, 2] })
      expect(existsSync(file)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('쓰다 실패하면 원래 파일은 그대로다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-'))
    try {
      const file = join(dir, 'store.json')
      writeFileSync(file, '{"keep":true}\n')
      const circular: Record<string, unknown> = {}
      circular.self = circular
      expect(() => writeJsonAtomic(file, circular)).toThrow()
      expect(readFileSync(file, 'utf8')).toBe('{"keep":true}\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
