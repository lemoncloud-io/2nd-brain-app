// 작은 JSON 기록을 깨지지 않게 쓴다 — 팀 확인·보내기 같은 "열려 있음" 상태다.
// 실체는 `../fs/write-json-atomic` 하나다. 여기서 mkdir 만 더한다.
// 차이점(의도적): 꼬리 개행 없음(리더는 JSON.parse), 실패 시 tmp 잔재 가능(uuid 무작위라 리더가 무시).
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { writeJsonAtomic as writeJsonAtomicCore } from '../fs/write-json-atomic'

export const writeJsonAtomic = (file: string, value: unknown): void => {
  mkdirSync(dirname(file), { recursive: true })
  writeJsonAtomicCore(file, value, 2)
}
