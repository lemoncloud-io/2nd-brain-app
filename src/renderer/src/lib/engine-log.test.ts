import { describe, expect, it } from 'vitest'
import type { EngineEvent } from '../../../shared/ipc-contract'
import { commandLabel, describeEvents, isCommandLine, splitIngestLog } from './engine-log'

const VAULT = '/Users/me/vault'

describe('describeEvents', () => {
  it('도구 이름 대신 동작을, 경로는 볼트 안 위치로', () => {
    const lines = describeEvents(
      [
        { type: 'session', id: 'abc-123' },
        { type: 'tool', name: 'Read', target: `${VAULT}/Clippings/a.md` },
        { type: 'tool', name: 'Grep', target: '위키' }
      ],
      VAULT
    )
    expect(lines).toEqual([
      { kind: 'step', label: '읽어요', detail: 'Clippings/a.md', raw: 'Read Clippings/a.md' },
      { kind: 'step', label: '내용을 찾아요', detail: '위키', raw: 'Grep 위키' }
    ])
  })

  it('claude 의 쓰기 뒤 같은 경로 file-change 는 한 줄로 합친다', () => {
    const events: EngineEvent[] = [
      { type: 'tool', name: 'Write', target: `${VAULT}/wiki/x.md` },
      { type: 'file-change', path: `${VAULT}/wiki/x.md` }
    ]
    expect(describeEvents(events, VAULT).map((l) => l.label)).toEqual(['써요'])
  })

  it('codex 는 file-change 만 오므로 그대로 쓴다 줄이 된다', () => {
    const lines = describeEvents([{ type: 'file-change', path: `${VAULT}/wiki/y.md` }], VAULT)
    expect(lines).toEqual([
      { kind: 'step', label: '써요', detail: 'wiki/y.md', raw: 'file-change wiki/y.md' }
    ])
  })

  it('명령은 셸 감싸기를 벗기고 첫 줄만 보조로', () => {
    const [line] = describeEvents(
      [
        {
          type: 'tool',
          name: 'command',
          target:
            '/bin/zsh -lc "git switch -c app/ingest-probe && apply_patch <<\'PATCH\'\n*** Begin Patch\nPATCH\ngit add note.md && git commit -m probe"'
        }
      ],
      VAULT
    )
    expect(line).toMatchObject({
      kind: 'step',
      label: '바꾼 내용을 기록해요',
      detail: "git switch -c app/ingest-probe && apply_patch <<'PATCH'"
    })
  })

  it('앱이 알리는 단계는 그대로 한 줄이 된다', () => {
    const lines = describeEvents(
      [
        { type: 'phase', label: '팀 변경을 받는 중이에요' },
        { type: 'tool', name: 'Read', target: 'Clippings/a.md' }
      ],
      VAULT
    )
    expect(lines).toEqual([
      { kind: 'phase', label: '팀 변경을 받는 중이에요' },
      { kind: 'step', label: '읽어요', detail: 'Clippings/a.md', raw: 'Read Clippings/a.md' }
    ])
  })

  it('모르는 도구도 빈칸 없이, 끝은 결과 문장', () => {
    const lines = describeEvents(
      [
        { type: 'tool', name: 'TodoWrite', target: '' },
        { type: 'error', message: 'rate limited' },
        { type: 'done', ok: false, canceled: false }
      ],
      VAULT
    )
    expect(lines.map((l) => l.label)).toEqual([
      'AI 도구를 써요',
      '작업 중 문제가 생겼어요 — AI 사용량이 한도에 닿았어요. 잠시 뒤 다시 쓸 수 있어요',
      '작업을 끝내지 못했어요'
    ])
  })
})

describe('isCommandLine', () => {
  it('명령에서 온 기록 줄만 골라낸다', () => {
    const lines = describeEvents(
      [
        { type: 'tool', name: 'command', target: 'git status --short' },
        { type: 'tool', name: 'Read', target: `${VAULT}/Clippings/a.md` }
      ],
      VAULT
    )
    expect(lines.map(isCommandLine)).toEqual([true, false])
  })
})

describe('commandLabel', () => {
  it.each([
    ['git status --short', '바뀐 내용을 확인해요'],
    ['python3 scripts/vault_verify.py --lane none', '보관함 규칙을 점검해요'],
    ['git checkout -b app/ingest-1', '위키 초안 작업 공간을 따로 만들어요'],
    ['cat wiki/INDEX.md', '파일을 읽어요'],
    ['python3 -c "print(1)"', '명령을 실행해요']
  ])('%s → %s', (command, label) => {
    expect(commandLabel(command)).toBe(label)
  })
})

describe('splitIngestLog', () => {
  it('초안 본문·경로 줄은 자세히로만 가고, 사람 말 줄은 단계·오류·끝만 남는다', () => {
    const lines = describeEvents(
      [
        { type: 'phase', label: '초안 중', progress: { done: 0, total: 2, pages: 0 } },
        { type: 'tool', name: 'Read', target: `${VAULT}/Clippings/a.md` },
        { type: 'text', text: '@@ wiki/a.md\n---\ntype: concept\n---\n# 가' },
        { type: 'thinking', text: '생각' },
        { type: 'phase', label: '초안 중', progress: { done: 1, total: 2, pages: 1 } },
        { type: 'file-change', path: `${VAULT}/wiki/a.md` },
        { type: 'error', message: 'boom' },
        { type: 'phase', label: '정리 중' },
        { type: 'done', ok: true, canceled: false }
      ],
      VAULT
    )
    const { shown, folded } = splitIngestLog(lines)
    expect(shown.map((l) => l.kind)).toEqual(['phase', 'error', 'phase', 'done'])
    expect(shown[0]!.label).toBe('초안 중')
    expect(folded).toEqual([
      'Read Clippings/a.md',
      '@@ wiki/a.md\n---\ntype: concept\n---\n# 가',
      '생각',
      'file-change wiki/a.md',
      'boom'
    ])
  })
})
