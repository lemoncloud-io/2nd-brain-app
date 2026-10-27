// 임시 그루 걷기 — 하루 넘은 것만 지운다. 재귀 삭제라 판정이 틀리면 남의 실행을 지운다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sweepOldRuns } from './run-tree'

const DAY_MS = 24 * 60 * 60 * 1000

// 진짜 그루 자리(`RUNS_DIR`)를 쓰지 않는다 — 이 테스트가 도는 동안 도는 e2e 실행의 폴더를 지울 수 있다
let runs = ''
beforeEach(() => {
  runs = mkdtempSync(join(tmpdir(), 'sweep-test-'))
})
afterEach(() => {
  rmSync(runs, { recursive: true, force: true })
})

const runAt = (name: string, ageMs: number): string => {
  const dir = join(runs, name)
  mkdirSync(join(dir, 'vault'), { recursive: true })
  writeFileSync(join(dir, 'vault', 'note.md'), '# 안에 든 것\n')
  const when = new Date(Date.now() - ageMs)
  utimesSync(dir, when, when)
  return dir
}

describe('sweepOldRuns', () => {
  it('하루 넘은 그루는 안에 든 것까지 지우고, 갓 만든 그루는 둔다', () => {
    const old = runAt('old', DAY_MS + 60_000)
    const fresh = runAt('fresh', 60_000)

    const swept = sweepOldRuns(Date.now(), runs)

    expect(existsSync(old)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
    expect(swept).toBe(1)
  })

  // 기준은 "지금"이 아니라 인자다 — 시계를 뒤로 돌려 경계를 직접 본다
  it('꼭 하루가 안 됐으면 두고, 하루를 넘기면 지운다', () => {
    const dir = runAt('edge', 0)
    expect(sweepOldRuns(Date.now() + DAY_MS - 60_000, runs)).toBe(0)
    expect(existsSync(dir)).toBe(true)
    expect(sweepOldRuns(Date.now() + DAY_MS + 60_000, runs)).toBe(1)
    expect(existsSync(dir)).toBe(false)
  })

  it('그루를 담는 폴더가 아예 없으면 0 이다', () => {
    expect(sweepOldRuns(Date.now(), join(runs, '없는-폴더'))).toBe(0)
  })
})
