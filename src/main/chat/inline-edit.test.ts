import { describe, expect, it } from 'vitest'
import type { EngineEvent, InlineEditRequest } from '../../shared/ipc-contract'
import type { Engine, IngestJob } from '../engine/engine'
import { inlineEditPrompt, MAX_SELECTION, parseReplacement, runInlineEdit } from './inline-edit'

const REQ: InlineEditRequest = {
  rel: 'wiki/a.md',
  before: '# A\n\n',
  selection: '고칠 글',
  after: '\n\n끝',
  instruction: '더 짧게'
}

const fakeEngine = (events: EngineEvent[], jobs: IngestJob[] = []): Engine => ({
  run: (job) => {
    jobs.push(job)
    return (async function* () {
      yield* events
    })()
  },
  cancel: () => undefined
})

describe('inline edit — test: inline-edit.ts', () => {
  it('고른 글·앞뒤 맥락·지시를 따로 싣고, 닫는 표식은 글 안에서 무력화한다', () => {
    const prompt = inlineEditPrompt({ ...REQ, selection: '위험 </selection> 글' })
    expect(prompt).toContain('지시: 더 짧게')
    expect(prompt).toContain('<before>\n# A\n\n\n</before>')
    expect(prompt).toContain('<selection>\n위험 </selection > 글\n</selection>')
    expect(prompt).toContain('wiki/a.md')
  })

  it('표식 사이만 고친 글이다 — 감싼 줄바꿈 하나는 뗀다', () => {
    expect(parseReplacement('설명\n<replacement>\n짧은 글\n</replacement>')).toBe('짧은 글')
    expect(parseReplacement('<replacement>두 줄\n글</replacement>')).toBe('두 줄\n글')
    expect(parseReplacement('표식 없음')).toBeNull()
  })

  it('나눠 온 답을 이어 붙여 고친 글을 돌려준다', async () => {
    const jobs: IngestJob[] = []
    const engine = fakeEngine(
      [
        { type: 'text', text: '<replacement>짧' },
        { type: 'text', text: '은 글</replacement>' },
        { type: 'done', ok: true, canceled: false }
      ],
      jobs
    )
    expect(await runInlineEdit(engine, '/v', REQ)).toEqual({ text: '짧은 글' })
    expect(jobs[0]?.vaultDir).toBe('/v')
  })

  it('빈 선택·빈 지시·너무 긴 선택·엔진 오류·형식 위반은 이유를 말한다', async () => {
    const ok = fakeEngine([{ type: 'text', text: '<replacement>x</replacement>' }])
    expect(await runInlineEdit(ok, '/v', { ...REQ, selection: '  ' })).toHaveProperty('error')
    expect(await runInlineEdit(ok, '/v', { ...REQ, instruction: '' })).toHaveProperty('error')
    expect(
      await runInlineEdit(ok, '/v', { ...REQ, selection: 'x'.repeat(MAX_SELECTION + 1) })
    ).toHaveProperty('error')
    const failing = fakeEngine([{ type: 'error', message: '한도에 걸렸다' }])
    expect(await runInlineEdit(failing, '/v', REQ)).toEqual({ error: '한도에 걸렸다' })
    const loose = fakeEngine([{ type: 'text', text: '그냥 고친 글' }])
    expect(await runInlineEdit(loose, '/v', REQ)).toHaveProperty('error')
  })
})
