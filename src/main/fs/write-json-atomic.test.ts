import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJsonAtomic } from './write-json-atomic'

describe('writeJsonAtomic', () => {
  it('쓰고 읽으면 같다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wja-'))
    try {
      const file = join(dir, 'a.json')
      writeJsonAtomic(file, { a: 1, b: [1, 2] })
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: 1, b: [1, 2] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('indent를 지키고 tmp를 남기지 않는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wja-'))
    try {
      const file = join(dir, 'a.json')
      writeJsonAtomic(file, { a: 1 }, 2)
      expect(readFileSync(file, 'utf8')).toContain('\n  "a": 1')
      expect(readdirSync(dir)).toEqual(['a.json'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('덮어쓰면 이전 내용이 남지 않는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wja-'))
    try {
      const file = join(dir, 'a.json')
      writeJsonAtomic(file, { a: 1 })
      writeJsonAtomic(file, { b: 2 })
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ b: 2 })
      expect(readdirSync(dir)).toEqual(['a.json'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('직렬화 불가면 throw하고 파일을 만들지 않는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wja-'))
    try {
      const bad: Record<string, unknown> = {}
      bad.self = bad
      expect(() => writeJsonAtomic(join(dir, 'a.json'), bad)).toThrow(TypeError)
      expect(readdirSync(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('없는 디렉토리면 throw한다 (mkdir 없음)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wja-'))
    try {
      expect(() => writeJsonAtomic(join(dir, 'nope', 'a.json'), { a: 1 })).toThrow()
      expect(readdirSync(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
