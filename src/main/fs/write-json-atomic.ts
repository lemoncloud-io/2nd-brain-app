// JSON 파일 원자적 쓰기 — 임시 파일에 쓰고 rename. 중간에 죽어도 이전 파일이 온전히 남는다.
import { randomUUID } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'

export const writeJsonAtomic = (path: string, data: unknown, indent?: number): void => {
  const tmp = `${path}.${randomUUID()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, indent), 'utf8')
  renameSync(tmp, path)
}
