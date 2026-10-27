// 이번 실행의 그루를 통째로 지운다 — 테스트가 실패했든 시간 초과로 끊겼든 그루는 하나다.
import { rmSync } from 'node:fs'

export default function globalTeardown(): void {
  const dir = process.env['E2E_RUN_DIR']
  if (!dir) return
  // 여기서 던지면 테스트가 전부 통과해도 실행이 실패로 끝난다 — 못 지운 것은 다음 실행의 sweep 이 걷는다
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (error) {
    console.error(`[e2e] 임시 그루를 지우지 못했다: ${dir}`, error)
  }
}
