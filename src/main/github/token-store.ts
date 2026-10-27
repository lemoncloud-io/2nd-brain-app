// GitHub 토큰 보관 — OS 키체인(Electron safeStorage)으로 암호화해 userData 에 둔다.
// 평문으로는 쓰지 않는다: 암호화를 쓸 수 없는 환경이면 보관을 포기하고 매번 다시 로그인한다.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TokenStore } from './device-auth'

/** safeStorage 의 좁은 면 — 테스트에서 갈아 끼운다 */
export type Crypto = {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(buffer: Buffer): string
}

const FILE = 'github-token'

export const createTokenStore = (userDataDir: string, crypto: Crypto): TokenStore => {
  const file = join(userDataDir, FILE)
  return {
    read(): string | null {
      if (!existsSync(file) || !crypto.isEncryptionAvailable()) return null
      try {
        return crypto.decryptString(readFileSync(file))
      } catch {
        // 다른 사용자·다른 기계에서 만든 파일은 못 푼다 — 없는 것과 같다
        return null
      }
    },
    write(token: string | null): void {
      if (token === null) {
        rmSync(file, { force: true })
        return
      }
      if (!crypto.isEncryptionAvailable()) return
      mkdirSync(userDataDir, { recursive: true })
      writeFileSync(file, crypto.encryptString(token))
    }
  }
}
