import { describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsePorcelain, readVaultChanges } from './git-status'

// 끝나지 않는 git 흉내 — 실제 git 대신 실행할 스크립트 경로. 팩토리는 호이스팅되므로
// 바깥 const를 직접 못 보고 hoisted 홀더로 받는다
// vi.mock은 파일 단위라 위의 비저장소 테스트도 가짜 경로('')로 돈다 —
// exec 실패→{}라는 같은 계약을 타므로 의도는 유지된다
const hangCtl = vi.hoisted(() => ({ script: '' }))
vi.mock('../git', async (original) => {
  const actual = await original<typeof import('../git')>()
  return {
    ...actual,
    gitRuntime: () => ({ file: hangCtl.script, env: {} })
  }
})

/** `-z` 출력 — 기록마다 NUL 하나 */
const z = (...records: string[]): string => records.map((r) => `${r}\0`).join('')

describe('parsePorcelain', () => {
  it('바뀐 파일과 새 파일을 가른다', () => {
    expect(parsePorcelain(z('?? 새글.md', ' M wiki/INDEX.md', 'M  raw/a.md'))).toEqual({
      '새글.md': 'new',
      'wiki/INDEX.md': 'changed',
      'raw/a.md': 'changed'
    })
  })

  it('공백·한글이 든 경로를 자르지 않는다 — 따옴표도 그대로 오지 않는다', () => {
    expect(parsePorcelain(z('?? areas/회의 기록 2026.md'))).toEqual({
      'areas/회의 기록 2026.md': 'new'
    })
  })

  // 회귀(리뷰 2026-09-21): `-unormal` 이면 git 이 미추적 폴더를 `?? 새 폴더/` 한 줄로 접어,
  // 갓 만든 폴더 안의 파일에 배지가 하나도 안 붙었다. `-uall` 이라야 파일마다 한 줄이다
  it('새 폴더 안의 파일도 한 줄씩 온다', () => {
    expect(parsePorcelain(z('?? 새 폴더/바로.md', '?? 새 폴더/안/노트.md'))).toEqual({
      '새 폴더/바로.md': 'new',
      '새 폴더/안/노트.md': 'new'
    })
  })

  it('지운 파일·무시된 파일은 담지 않는다 — 트리에 행이 없다', () => {
    expect(parsePorcelain(z(' D 지움.md', 'D  색인에서 지움.md', '!! ignored.md'))).toEqual({})
  })

  // `DU` 는 우리가 지웠고 상대 것이 작업본에 있다 — 행이 있는 파일이라 지워졌다고 말하면 안 된다
  it('병합 충돌은 바뀐 파일이다', () => {
    expect(parsePorcelain(z('DU 충돌.md', 'UU 둘다.md'))).toEqual({
      '충돌.md': 'changed',
      '둘다.md': 'changed'
    })
  })

  it('색인과 작업본이 둘 다 바뀐 파일도 뜻은 하나다', () => {
    expect(parsePorcelain(z('MM a.md', 'AM b.md'))).toEqual({ 'a.md': 'changed', 'b.md': 'new' })
  })

  it('빈 출력·꼬리 NUL 은 빈 맵이다', () => {
    expect(parsePorcelain('')).toEqual({})
    expect(parsePorcelain('\0')).toEqual({})
  })
})

describe('readVaultChanges', () => {
  it('git 저장소가 아니면 빈 맵 — 던지지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'git-status-'))
    try {
      await expect(readVaultChanges(dir)).resolves.toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // 끝나지 않는 git — 인자를 무시하고 버티는 셸 스크립트. Windows에서는 실행 불가
  it.skipIf(process.platform === 'win32')(
    '10초 넘게 안 끝나는 git은 빈 맵으로 끝나고 줄을 비운다',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'git-status-hang-'))
      const script = join(dir, 'hang-git')
      writeFileSync(script, '#!/bin/sh\nsleep 30\n')
      chmodSync(script, 0o755)
      hangCtl.script = script
      try {
        const start = Date.now()
        await expect(readVaultChanges(dir)).resolves.toEqual({})
        // 즉시 실패가 아니라 타임아웃 대기를 탔다는 증거 — 위로도 못 새게 상한을 둔다
        const elapsed = Date.now() - start
        expect(elapsed).toBeGreaterThanOrEqual(9000)
        expect(elapsed).toBeLessThan(25000)
        // 줄이 비었으면 같은 보관함의 다음 읽기도 타임아웃 한 번분 안에 끝난다
        await expect(readVaultChanges(dir)).resolves.toEqual({})
      } finally {
        hangCtl.script = ''
        rmSync(dir, { recursive: true, force: true })
      }
    },
    60000
  )
})
