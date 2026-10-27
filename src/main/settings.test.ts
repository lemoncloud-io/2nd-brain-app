// 최근 보관함 기록 — 정규화·중복 제거·상한. 순수라 단위 테스트한다.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeChatDefaults } from '../shared/chat-defaults'
import {
  loadSettings,
  normalizeOnboardingPurpose,
  PURPOSE_ANSWER_LIMIT,
  RECENT_VAULT_LIMIT,
  recordRecentVault,
  saveSettings
} from './settings'

describe('recordRecentVault', () => {
  it('맨 앞에 쌓고 10개까지만 둔다 — test: settings vault scope', () => {
    let recents: string[] = []
    for (let n = 0; n < RECENT_VAULT_LIMIT + 3; n += 1) {
      recents = recordRecentVault(recents, `/vaults/v${n}`)
    }
    expect(recents).toHaveLength(RECENT_VAULT_LIMIT)
    expect(recents[0]).toBe(`/vaults/v${RECENT_VAULT_LIMIT + 2}`)
  })

  it('다시 열면 맨 앞으로 옮기고 하나만 남는다', () => {
    const recents = recordRecentVault(['/a', '/b'], '/b')
    expect(recents.slice(0, 2)).toEqual(['/b', '/a'])
  })

  it('대소문자·꼬리 구분자를 같게 본다', () => {
    const recents = recordRecentVault(['/Vaults/A'], '/vaults/a/')
    expect(recents).toEqual(['/vaults/a'])
  })

  it('없으면 빈 목록에서 시작한다', () => {
    expect(recordRecentVault(undefined, '/a')).toEqual(['/a'])
  })
})

describe('chatDefaults 영속', () => {
  it('저장했다 읽으면 값이 남는다 — 재시작 뒤에도 이어진다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chat-defaults-'))
    saveSettings(dir, {
      chatDefaults: { permissionMode: 'all', userSettings: false }
    })
    expect(normalizeChatDefaults(loadSettings(dir).chatDefaults)).toEqual({
      permissionMode: 'all',
      userSettings: false
    })
  })
})

describe('normalizeOnboardingPurpose', () => {
  it.each([
    [42, null],
    [undefined, null],
    ['   ', null],
    ['  여행\n\n계획   세우기 ', '여행 계획 세우기']
  ])('%j → %j', (raw, expected) => {
    expect(normalizeOnboardingPurpose(raw)).toBe(expected)
  })

  it('상한에서 자른다', () => {
    expect(normalizeOnboardingPurpose('가'.repeat(PURPOSE_ANSWER_LIMIT + 5))).toBe(
      '가'.repeat(PURPOSE_ANSWER_LIMIT)
    )
  })
})
