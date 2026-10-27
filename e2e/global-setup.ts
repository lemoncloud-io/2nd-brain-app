// 이번 실행의 임시 그루를 만들고, 옛 그루를 걷는다. 워커는 이 env 를 물려받는다.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { RUNS_DIR, sweepOldRuns } from './run-tree'

export default function globalSetup(): void {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
  const dir = join(RUNS_DIR, runId)
  mkdirSync(dir, { recursive: true })
  process.env['E2E_RUN_DIR'] = dir
  const swept = sweepOldRuns()
  if (swept > 0) console.log(`[e2e] 하루 넘은 임시 폴더 ${swept}그루를 지웠다`)
}
