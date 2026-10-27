// @vitest-environment jsdom
// renderer lib 텍스트 헬퍼 — applyLanguage 뒤 부르면 그 언어로 나온다(호출 시점 getT). 한국어 단언은 각 헬퍼 테스트가 한다.
import { afterEach, describe, expect, it } from 'vitest'
import { applyLanguage } from './i18n'
import { syncText } from './sync-text'
import { formatElapsed } from './elapsed'
import { countLabel } from './count-label'
import { runLabel } from './ingest-run'
import { COMMANDS } from './commands'
import { suggestActions } from './chat-actions'
import { publishFailedText } from './review-text'
import type { SyncState } from '../../../shared/ipc-contract'

afterEach(() => applyLanguage('ko'))

const idle = {
  running: false,
  skipped: null,
  error: null,
  conflicts: [],
  behind: 0,
  ahead: 0,
  at: 1,
  held: null,
  received: 0,
  via: null
} as unknown as SyncState

describe('renderer lib text in English', () => {
  it('sync line uses singular and plural', () => {
    applyLanguage('en')
    expect(syncText({ ...idle, received: 1 })).toBe('Got 1 change')
    expect(syncText({ ...idle, received: 3, ahead: 2 })).toBe('Got 3 changes · 2 not uploaded yet')
  })

  it('elapsed, counts and run labels follow the language', () => {
    applyLanguage('en')
    expect(formatElapsed(75)).toBe('1m 15s')
    expect(countLabel({ chars: 1234, words: 1 })).toBe('1,234 characters · 1 word')
    expect(runLabel('app/ingest-2026-10-23-2')).toBe('Oct 23 wiki draft (2nd)')
  })

  it('command table labels are read at access time', () => {
    const palette = COMMANDS.find((c) => c.id === 'palette')!
    expect(palette.label).toBe('문서 찾아 열기')
    applyLanguage('en')
    expect(palette.label).toBe('Find and open a page')
  })

  it('next-action cards understand an English question', () => {
    applyLanguage('en')
    expect(suggestActions('Please organize these notes into the wiki')).toEqual([
      { id: 'ingest', label: 'Make a wiki draft' }
    ])
  })

  it('publish failure drops the repeated head in the same language', () => {
    applyLanguage('en')
    expect(publishFailedText("Couldn't upload to GitHub — sign in again")).toBe(
      "It's in your wiki, but couldn't be uploaded to GitHub yet — sign in again"
    )
  })
})
