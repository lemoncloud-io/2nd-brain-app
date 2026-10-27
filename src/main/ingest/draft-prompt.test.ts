import { describe, expect, it } from 'vitest'
import {
  buildBatchDraftPrompt,
  buildDraftPrompt,
  parseBatchDraft,
  parseDraft,
  splitBatchSections
} from './draft-prompt'

const INPUT = {
  title: '백프레셔',
  source: 'https://example.com/a',
  body: '백프레셔는 생산 속도를 소비 속도에 맞추는 압력이다.',
  updateTargets: [],
  bodies: [{ rel: 'wiki/herdr.md', title: 'herdr', content: '# herdr\n\n터미널 멀티플렉서' }],
  topics: ['distributed-systems'],
  template: '---\ntype: concept\n---\n\n# T\n\n## Summary'
}

const GOOD = [
  '```',
  '@@ wiki/backpressure.md',
  '---',
  'type: concept',
  'topics: [distributed-systems]',
  'status: draft',
  '---',
  '# 백프레셔',
  '',
  '## Summary',
  '',
  '생산 속도를 늦춘다.',
  '```'
].join('\n')

describe('buildDraftPrompt', () => {
  it('원문·템플릿·토픽 목록을 싣고 파일 쓰기 금지를 못박는다', () => {
    const prompt = buildDraftPrompt(INPUT)
    expect(prompt).toContain('백프레셔는 생산 속도')
    expect(prompt).toContain('distributed-systems')
    expect(prompt).toContain('Do NOT write INDEX')
  })

  it('갱신 대상이 있으면 전문을 싣고 경로 유지를 지시한다', () => {
    const prompt = buildDraftPrompt({
      ...INPUT,
      updateTargets: [{ rel: 'wiki/old.md', content: '# 옛 글' }]
    })
    expect(prompt).toContain('UPDATE these existing notes')
    expect(prompt).toContain('--- FILE wiki/old.md ---')
  })

  it('관련 노트가 있으면 전문과 갱신 규칙을 싣는다', () => {
    const prompt = buildDraftPrompt(INPUT)
    expect(prompt).toContain('--- FILE wiki/herdr.md (herdr) ---')
    expect(prompt).toContain('UPDATE blocks are accepted ONLY')
  })

  it('purpose가 있으면 방향 블록을 싣고, 없으면 싣지 않는다', () => {
    expect(buildDraftPrompt({ ...INPUT, purpose: '분산 시스템 공부' })).toContain(
      '분산 시스템 공부'
    )
    expect(buildDraftPrompt({ ...INPUT, purpose: '분산 시스템 공부' })).toContain('Wiki purpose')
    expect(buildDraftPrompt(INPUT)).not.toContain('Wiki purpose')
    expect(buildDraftPrompt({ ...INPUT, purpose: '' })).not.toContain('Wiki purpose')
  })

  it('purpose가 길면 자르고 잘림 표시를 붙인다', () => {
    const prompt = buildDraftPrompt({ ...INPUT, purpose: '가'.repeat(3000) })
    expect(prompt).toContain('…(이하 잘림)')
    expect(prompt).not.toContain('가'.repeat(2500))
  })
})

describe('parseDraft', () => {
  it('정상 블록을 페이지로 푼다', () => {
    const parsed = parseDraft(GOOD)
    expect(parsed).toMatchObject({
      ok: true,
      pages: [
        {
          rel: 'wiki/backpressure.md',
          type: 'concept',
          topics: ['distributed-systems'],
          status: 'draft',
          title: '백프레셔'
        }
      ]
    })
  })

  it('계약 위반은 재시도 사유로 돌려준다', () => {
    expect(parseDraft('그냥 문장만')).toMatchObject({ ok: false })
    expect(parseDraft('@@ wiki/한글.md\n---\ntype: concept\n---\n# T')).toMatchObject({ ok: false })
    expect(parseDraft(GOOD.replace('type: concept', 'type: essay'))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('type')
    })
    expect(parseDraft(GOOD.replace('# 백프레셔', '제목 없음'))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('H1')
    })
    expect(parseDraft(`${GOOD}\n${GOOD}`)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('두 번')
    })
  })
})

const BATCH_SOURCES = [
  {
    rawName: 'a.md',
    title: '갑',
    source: 'https://example.com/a',
    body: '갑 본문.',
    updateTargets: [],
    bodies: []
  },
  {
    rawName: 'b.md',
    title: '을',
    body: '을 본문.',
    updateTargets: [],
    bodies: []
  }
]

const BATCH_GOOD = [
  '## SOURCE 1: raw/a.md',
  '```',
  '@@ wiki/alpha.md',
  '---',
  'type: concept',
  'topics: []',
  'status: draft',
  '---',
  '# 갑 개념',
  '',
  '## Summary',
  '',
  '갑이다.',
  '```',
  '## SOURCE 2: raw/b.md',
  '```',
  '@@ wiki/beta.md',
  '---',
  'type: concept',
  'topics: []',
  'status: draft',
  '---',
  '# 을 개념',
  '',
  '## Summary',
  '',
  '을이다.',
  '```'
].join('\n')

describe('buildBatchDraftPrompt', () => {
  it('소스별 섹션과 독립 초안 규칙을 싣는다', () => {
    const prompt = buildBatchDraftPrompt(BATCH_SOURCES, ['distributed-systems'], '# T')
    expect(prompt).toContain('## SOURCE 1: raw/a.md')
    expect(prompt).toContain('## SOURCE 2: raw/b.md')
    expect(prompt).toContain('independently')
    expect(prompt).toContain('Do NOT mix concepts across sources')
    expect(prompt).toContain('갑 본문.')
    expect(prompt).toContain('을 본문.')
  })

  it('purpose가 있으면 싣고, 없으면 싣지 않는다', () => {
    expect(buildBatchDraftPrompt(BATCH_SOURCES, [], '# T', '분산 시스템 공부')).toContain(
      'Wiki purpose'
    )
    expect(buildBatchDraftPrompt(BATCH_SOURCES, [], '# T')).not.toContain('Wiki purpose')
  })
})

describe('splitBatchSections', () => {
  it('빠진 섹션을 실패로 돌려준다', () => {
    expect(splitBatchSections('## SOURCE 1: raw/a.md\n@@ wiki/a.md', 2)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('빠졌어요: 2')
    })
    expect(splitBatchSections('그냥 문장', 2)).toMatchObject({ ok: false })
  })
})

describe('parseBatchDraft', () => {
  it('소스별 페이지를 귀속해 푼다', () => {
    const parsed = parseBatchDraft(BATCH_GOOD, 2)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.pagesPerSource).toHaveLength(2)
    expect(parsed.pagesPerSource[0]).toMatchObject([{ rel: 'wiki/alpha.md' }])
    expect(parsed.pagesPerSource[1]).toMatchObject([{ rel: 'wiki/beta.md' }])
  })

  it('빈 섹션은 0페이지로 둔다', () => {
    const parsed = parseBatchDraft('## SOURCE 1: raw/a.md\n', 1)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.pagesPerSource).toEqual([[]])
  })

  it('소스 간 같은 경로는 전체 실패로 돌려준다', () => {
    const dup = BATCH_GOOD.replace('@@ wiki/beta.md', '@@ wiki/alpha.md')
    expect(parseBatchDraft(dup, 2)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('다른 소스')
    })
  })
})
