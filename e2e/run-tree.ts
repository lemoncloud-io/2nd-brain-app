// e2e 가 쓰는 임시 폴더는 실행마다 한 그루다 — `$TMPDIR/2nd-brain-e2e/<runId>/<prefix>-xxxx`.
//
// 왜 한 그루인가(2026-09-18 실측): 스위트를 돌 때마다 `$TMPDIR` 에 `*-e2e-*` 가 흩어져 쌓여 49개 189MB 가
// 남아 있었다. 폴더마다 볼트 사본 + Electron userData(캐시·GPU 캐시)라 회당 6MB 다. 흩어져 있으면
// 어느 것이 이번 실행인지 알 수 없어 통째로 지우지도 못한다.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const RUNS_DIR = join(tmpdir(), '2nd-brain-e2e')

/**
 * globalSetup 이 정한 이번 실행의 그루. 없으면(globalSetup 밖에서 부를 때) 같은 부모 아래 따로 판다 —
 * 그 그루는 globalTeardown 이 모르므로 다음 실행의 `sweepOldRuns` 가 하루 뒤에 걷는다.
 */
export const runDir = (): string => {
  const dir = process.env['E2E_RUN_DIR'] ?? join(RUNS_DIR, `adhoc-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 앱과 무관한 임시 폴더(공유 저장소·로그·볼트 원본)도 같은 그루 안에 판다 —
 * `$TMPDIR` 바로 아래에 두면 지우는 사람이 spec 마다 따로 있어야 한다
 */
export const tempDir = (prefix: string): string => mkdtempSync(join(runDir(), `${prefix}-`))

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 하루 넘은 옛 그루를 걷는다 — 죽은 실행(강제 종료·전원 차단)이 남긴 것.
 * `now`·`runsDir` 은 테스트가 시계와 자리를 넣기 위한 것이다(재귀 삭제라 판정을 직접 봐야 한다).
 */
export const sweepOldRuns = (now = Date.now(), runsDir = RUNS_DIR): number => {
  if (!existsSync(runsDir)) return 0
  let swept = 0
  for (const name of readdirSync(runsDir)) {
    const path = join(runsDir, name)
    try {
      if (now - statSync(path).mtimeMs < DAY_MS) continue
      rmSync(path, { recursive: true, force: true })
      swept += 1
    } catch {
      // 다른 실행이 지우는 중일 수 있다 — 다음 실행이 다시 본다
    }
  }
  return swept
}
