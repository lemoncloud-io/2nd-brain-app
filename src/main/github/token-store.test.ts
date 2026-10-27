import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTokenStore } from './token-store'

// OS 키체인이 없는 환경(리눅스 데스크톱 일부·테스트)에서도 토큰을 평문으로 두지 않는다
const fakeCrypto = {
  isEncryptionAvailable: (): boolean => true,
  // 진짜 safeStorage 처럼 원문이 그대로 보이지 않게 — 테스트는 "파일에 평문이 없다" 를 본다
  encryptString: (text: string): Buffer =>
    Buffer.from(`enc:${Buffer.from(text, 'utf8').toString('base64')}`),
  decryptString: (buffer: Buffer): string =>
    Buffer.from(buffer.toString().replace(/^enc:/, ''), 'base64').toString('utf8')
}

describe('createTokenStore', () => {
  it('토큰을 암호화해 두고 다시 읽는다 — 파일에 평문이 없다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'token-store-'))
    try {
      const store = createTokenStore(dir, fakeCrypto)
      expect(store.read()).toBeNull()
      store.write('gho_secret')
      expect(store.read()).toBe('gho_secret')

      const file = join(dir, 'github-token')
      expect(readFileSync(file, 'utf8')).not.toContain('gho_secret')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('지우면 파일도 사라진다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'token-store-clear-'))
    try {
      const store = createTokenStore(dir, fakeCrypto)
      store.write('gho_secret')
      store.write(null)
      expect(store.read()).toBeNull()
      expect(existsSync(join(dir, 'github-token'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('암호화를 쓸 수 없으면 저장하지 않는다 — 평문으로 남기느니 다시 로그인한다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'token-store-none-'))
    try {
      const store = createTokenStore(dir, { ...fakeCrypto, isEncryptionAvailable: () => false })
      store.write('gho_secret')
      expect(store.read()).toBeNull()
      expect(existsSync(join(dir, 'github-token'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
