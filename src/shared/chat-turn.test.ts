import { describe, expect, it } from 'vitest'
import type { ChangeSet, ChatMessage } from './ipc-contract'
import { keepsFiles, keepsNewAnswer, lastTurn } from './chat-turn'

const user = (text: string): ChatMessage => ({ role: 'user', text, refs: [] })
const answer = (text: string, changes?: ChangeSet): ChatMessage => ({
  role: 'assistant',
  text,
  refs: [],
  ...(changes ? { changes } : {})
})
const card = (extra: Partial<ChangeSet> = {}): ChangeSet => ({
  id: 'run-1',
  files: [{ rel: 'private/a.md', kind: 'created', tracked: false, afterHash: 'h' }],
  blocked: [],
  ...extra
})

describe('lastTurn', () => {
  it('마지막이 답이고 그 앞이 질문이면 그 질문과 답을 돌려준다', () => {
    expect(lastTurn([user('q1'), answer('a1'), user('q2'), answer('a2')])).toEqual({
      question: 'q2',
      answer: answer('a2')
    })
  })

  it('마지막이 질문이면(답이 실패했다) 답 없이 그 질문을 돌려준다', () => {
    expect(lastTurn([user('q1'), answer('a1'), user('q2')])).toEqual({
      question: 'q2',
      answer: null
    })
  })

  it('빈 대화이거나 답 앞에 질문이 없으면(끊긴 실행 카드) null', () => {
    expect(lastTurn([])).toBeNull()
    expect(lastTurn([user('q'), answer('a'), answer('', card({ interrupted: true }))])).toBeNull()
  })
})

describe('keepsFiles', () => {
  it('답이 만든 파일이 아직 있으면 true — 되돌렸거나 막기만 했으면 false', () => {
    expect(keepsFiles(answer('a', card()))).toBe(true)
    expect(keepsFiles(answer('a', card({ pruned: true })))).toBe(true)
    expect(keepsFiles(answer('a', card({ undone: true })))).toBe(false)
    const undoneFile = card().files.map((f) => ({ ...f, state: 'undone' as const }))
    expect(keepsFiles(answer('a', card({ files: undoneFile })))).toBe(false)
    expect(keepsFiles(answer('a', card({ files: [], blocked: ['막았다'] })))).toBe(false)
    expect(keepsFiles(answer('a'))).toBe(false)
    expect(keepsFiles(null)).toBe(false)
  })
})

describe('keepsNewAnswer', () => {
  const ok = { ok: true, canceled: false }
  it('끝까지 온 글 있는 새 답만 남긴다 — 실패·멈춤·빈 답이면 앞 답을 되살린다', () => {
    expect(keepsNewAnswer(answer('새 답'), ok)).toBe(true)
    expect(keepsNewAnswer(answer(''), ok)).toBe(false)
    expect(keepsNewAnswer(answer('반쯤'), { ok: false, canceled: false })).toBe(false)
    expect(keepsNewAnswer(answer('(멈춤)'), { ok: false, canceled: true })).toBe(false)
    expect(keepsNewAnswer(answer('반쯤'), null)).toBe(false)
  })

  it('파일을 남긴 새 답은 실패해도 남긴다 — 그 되돌리기 카드가 새 답에 있다', () => {
    expect(keepsNewAnswer(answer('', card()), { ok: false, canceled: true })).toBe(true)
  })

  it('파일 없이 끝난 실패 답은 남기지 않는다 — 빈 changes·되돌림済み도 앞 답을 되살린다', () => {
    const failed = { ok: false, canceled: true }
    expect(keepsNewAnswer(answer('', card({ files: [] })), failed)).toBe(false)
    const undoneFile = card().files.map((f) => ({ ...f, state: 'undone' as const }))
    expect(keepsNewAnswer(answer('', card({ files: undoneFile })), failed)).toBe(false)
    expect(keepsNewAnswer(answer('', card({ undone: true })), failed)).toBe(false)
  })
})
