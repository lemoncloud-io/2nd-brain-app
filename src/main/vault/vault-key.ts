// 볼트별 userData 하위 폴더 이름 — sha256(realpath 볼트) 앞 16자. 대화·임베딩 인덱스가 같이 쓴다.
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'

export const vaultKey = (vaultDir: string): string => {
  let real = vaultDir
  try {
    real = realpathSync(vaultDir)
  } catch {
    // 사라진 볼트 — 원래 경로로 해시
  }
  return createHash('sha256').update(real).digest('hex').slice(0, 16)
}
