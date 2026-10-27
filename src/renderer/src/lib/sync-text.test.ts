import { describe, expect, it } from 'vitest'
import type { SyncState } from '../../../shared/ipc-contract'
import { aheadFilesText, syncText } from './sync-text'

const state = (over: Partial<SyncState> = {}): SyncState => ({
  received: 0,
  conflicts: [],
  at: 1,
  error: null,
  running: false,
  ahead: 0,
  aheadFiles: [],
  newDocs: [],
  behind: 0,
  shared: null,
  skipped: null,
  held: null,
  via: null,
  ...over
})

const GIT_WORDS = /브랜치|branch|커밋|commit|merge|병합|origin/i

describe('syncText', () => {
  it('팀에 새 변경이 있으면 몇 건인지 말한다 — 승인 대기 중이면 언제 받는지 말한다', () => {
    const waiting = syncText(state({ behind: 3, ahead: 1 }))
    expect(waiting).toContain('팀에 새 변경 3개')
    expect(waiting).toContain('내 작업은 그대로 남아요')
    expect(waiting).toContain('안 올린 작업 1개')
    expect(waiting).not.toMatch(GIT_WORDS)
    expect(syncText(state({ behind: 2, skipped: 'review-pending' }))).toContain(
      '승인을 마치면 받아요'
    )
    // 받는 중·실패·고르기가 먼저다
    expect(syncText(state({ behind: 2, running: true }))).toBe('팀 변경을 받는 중…')
    expect(syncText(state({ behind: 2, conflicts: ['a.md'] }))).toContain(
      '나와 팀이 따로 고친 문서'
    )
  })

  // 업데이트 뒤 첫 실행 — 예전 브라우저 로그인으로 쓰던 사람에게 받기 실패 대신 할 일을 말한다
  it('GitHub 로그인이 없으면 다시 연결하라고 말하고, 쌓인 팀 변경 수보다 먼저 말한다', () => {
    const text = syncText(state({ skipped: 'signed-out', behind: 2, ahead: 1 }))
    expect(text).toContain('GitHub 다시 연결이 필요해요')
    expect(text).toContain('안 올린 작업 1개')
    expect(text).not.toContain('팀에 새 변경')
    expect(syncText(state({ skipped: 'signed-out', at: null }))).toContain(
      'GitHub 다시 연결이 필요해요'
    )
  })

  it('어제 작업에 남아 있으면 그렇게 말하고, 작업 이름은 말하지 않는다', () => {
    const text = syncText(state({ held: 'docs/2026-09-16-plan', received: 2 }))
    expect(text).toContain('팀의 최신 내용은 받아 두었어요')
    // 팀 확인 중이라는 말은 아래 보내기 줄이 한다 — 두 줄이 같은 말을 하지 않는다
    expect(text).not.toContain('팀 확인 중')
    expect(text).not.toContain('docs/2026-09-16-plan')
  })

  it('못 푸는 상태마다 이유와 할 일 하나를 말한다', () => {
    expect(syncText(state({ skipped: 'stuck' }))).toContain('보관함 상태 되돌리기')
    expect(syncText(state({ skipped: 'switch-blocked', held: 'x' }))).toContain('새로 만든 파일')
    expect(syncText(state({ skipped: 'busy' }))).toContain('위키 초안 만들기')
    expect(syncText(state({ skipped: 'review-pending', held: 'app/ingest-2026-09-16' }))).toContain(
      '승인 대기'
    )
  })

  it('연결이 없으면 할 일을 말하고, 어제 작업에 남아 있으면 그것도 말한다', () => {
    expect(syncText(state({ skipped: 'no-remote' }))).toContain(
      '설정의 팀 저장소에서 연결해 주세요'
    )
    expect(syncText(state({ skipped: 'no-remote', held: 'docs/plan' }))).toContain(
      '지난번 작업에 머물러 있어요'
    )
  })

  it('합치기로 받았으면 그렇게 말한다 — 앞으로 감기·되감기는 기존 문구 그대로', () => {
    expect(syncText(state({ received: 2, via: 'merge' }))).toContain('합치기로 받았어요')
    expect(syncText(state({ received: 2, via: 'forward' }))).toBe('팀 변경 2개를 받았어요')
    expect(syncText(state({ received: 2, via: 'rewind' }))).toBe('팀 변경 2개를 받았어요')
    expect(syncText(state({ received: 2, via: null }))).toBe('팀 변경 2개를 받았어요')
  })

  it('화면 문장에 git 어휘가 없다', () => {
    const all = [
      state(),
      state({ received: 3 }),
      state({ received: 3, via: 'merge' }),
      state({ held: 'docs/plan' }),
      state({ skipped: 'stuck' }),
      state({ skipped: 'switch-blocked', held: 'docs/plan' }),
      state({ skipped: 'busy' }),
      state({ skipped: 'review-pending' }),
      state({ skipped: 'no-remote' }),
      state({ conflicts: ['wiki/a.md'] })
    ]
    for (const each of all) expect(syncText(each)).not.toMatch(GIT_WORDS)
  })
})

describe('aheadFilesText', () => {
  it('올라갈 파일 이름을 보여 주고 많으면 줄인다', () => {
    expect(aheadFilesText([])).toBeNull()
    expect(aheadFilesText(['private/a.md', 'outputs/plan.md'])).toBe(
      '올라가는 파일: private/a.md, outputs/plan.md'
    )
    const many = Array.from({ length: 7 }, (_, i) => `wiki/p${i}.md`)
    expect(aheadFilesText(many)).toBe(
      '올라가는 파일: wiki/p0.md, wiki/p1.md, wiki/p2.md, wiki/p3.md, wiki/p4.md 외 2개'
    )
  })
})
