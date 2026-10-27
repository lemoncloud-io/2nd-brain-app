import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vaultKey } from './vault-key'

describe('vaultKey', () => {
  it('같은 폴더는 항상 같은 16자 hex 키다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vk-'))
    try {
      const key = vaultKey(dir)
      expect(key).toMatch(/^[0-9a-f]{16}$/)
      expect(vaultKey(dir)).toBe(key)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('심볼릭링크와 실제 경로는 같은 키다', () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-'))
    try {
      const real = join(root, 'real')
      const link = join(root, 'link')
      mkdirSync(real)
      symlinkSync(real, link)
      expect(vaultKey(link)).toBe(vaultKey(real))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('사라진 볼트도 throw 없이 키를 낸다', () => {
    expect(vaultKey(join(tmpdir(), 'vk-gone-xyz'))).toMatch(/^[0-9a-f]{16}$/)
  })

  it('다른 폴더는 다른 키다', () => {
    const a = mkdtempSync(join(tmpdir(), 'vk-a-'))
    const b = mkdtempSync(join(tmpdir(), 'vk-b-'))
    try {
      expect(vaultKey(a)).not.toBe(vaultKey(b))
    } finally {
      rmSync(a, { recursive: true, force: true })
      rmSync(b, { recursive: true, force: true })
    }
  })

  it('뒤 슬래시 유무가 키를 바꾸지 않는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vk-'))
    try {
      expect(vaultKey(`${dir}/`)).toBe(vaultKey(dir))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
