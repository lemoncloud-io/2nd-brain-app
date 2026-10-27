import { describe, expect, it } from 'vitest'
import { lintPrompt, parseSemanticLint } from './ai-lint'

describe('lintPrompt', () => {
  it('페이지 요약(제목 + 본문 앞 500자)을 프롬프트에 넣는다', () => {
    const body = '가'.repeat(600)
    const prompt = lintPrompt([{ rel: 'wiki/a.md', title: '에이', body }])
    expect(prompt).toContain('wiki/a.md')
    expect(prompt).toContain('에이')
    expect(prompt).toContain('가'.repeat(500))
    expect(prompt).not.toContain('가'.repeat(501))
    expect(prompt).toContain('---LINT:')
    expect(prompt).toContain('---END LINT---')
    expect(prompt).toContain('duplicate')
    expect(prompt).toContain('wiki/a.md + wiki/b.md')
  })
})

describe('parseSemanticLint', () => {
  const existing = ['에이 페이지', '비 페이지']

  it('duplicate 는 두 페이지 경로를 rel·rel2 로 받고, 하나뿐이거나 같은 경로면 버린다', () => {
    const text = [
      '---LINT: duplicate|medium|같은 개념|wiki/a.md + wiki/concepts/a2.md---',
      '둘 다 같은 개념을 설명한다',
      '---END LINT---',
      '---LINT: duplicate|medium|하나뿐|wiki/a.md---',
      '경로가 하나다',
      '---END LINT---',
      '---LINT: duplicate|medium|같은 경로|wiki/a.md + wiki/a.md---',
      '같은 페이지다',
      '---END LINT---',
      '---LINT: duplicate|medium|위키 밖|wiki/a.md + raw/a.md---',
      '위키 밖 파일이다',
      '---END LINT---',
      '---LINT: duplicate|medium|올라감|wiki/a.md + wiki/../VAULT_RULES.md---',
      '위키 밖으로 올라간다',
      '---END LINT---',
      '---LINT: duplicate|medium|대소문자|wiki/a.md + wiki/A.md---',
      '대소문자만 다르다',
      '---END LINT---'
    ].join('\n')
    const result = parseSemanticLint(text, existing)
    expect(result.status === 'found' && result.findings).toEqual([
      {
        kind: 'duplicate',
        severity: 'medium',
        title: '같은 개념',
        rel: 'wiki/a.md',
        rel2: 'wiki/concepts/a2.md',
        detail: '둘 다 같은 개념을 설명한다'
      }
    ])
  })

  it('블록을 파싱한다 — type|severity|title|rel + 본문', () => {
    const text = [
      '서문 산문은 버린다.',
      '---LINT: contradiction|high|상반된 정의|wiki/a.md---',
      '두 페이지의 정의가 다르다',
      '---END LINT---',
      '---LINT: suggestion|low|링크 추가 제안|wiki/b.md---',
      '비 페이지에서 에이 페이지로 링크를 걸어라',
      '---END LINT---'
    ].join('\n')
    const result = parseSemanticLint(text, existing)
    expect(result).toEqual({
      status: 'found',
      findings: [
        {
          kind: 'contradiction',
          severity: 'high',
          title: '상반된 정의',
          rel: 'wiki/a.md',
          detail: '두 페이지의 정의가 다르다'
        },
        {
          kind: 'suggestion',
          severity: 'low',
          title: '링크 추가 제안',
          rel: 'wiki/b.md',
          detail: '비 페이지에서 에이 페이지로 링크를 걸어라'
        }
      ]
    })
  })

  it('알 수 없는 type 블록은 버린다', () => {
    const text = [
      '---LINT: typo|low|오탈자|wiki/a.md---',
      '알 수 없는 종류',
      '---END LINT---',
      '---LINT: outdated|low|오래됨|wiki/a.md---',
      '내용이 오래됐다',
      '---END LINT---'
    ].join('\n')
    const result = parseSemanticLint(text, existing)
    expect(result.status).toBe('found')
    if (result.status === 'found') {
      expect(result.findings.map((f) => f.kind)).toEqual(['outdated'])
    }
  })

  it('알 수 없는 severity 블록은 버린다', () => {
    const text = [
      '---LINT: outdated|critical|심각도 오탈|wiki/a.md---',
      '심각도가 잘못됐다',
      '---END LINT---',
      '---LINT: outdated|low|오래됨|wiki/a.md---',
      '내용이 오래됐다',
      '---END LINT---'
    ].join('\n')
    const result = parseSemanticLint(text, existing)
    expect(result.status).toBe('found')
    if (result.status === 'found') {
      expect(result.findings.map((f) => f.title)).toEqual(['오래됨'])
    }
  })

  it('missing-page인데 이미 있는 제목(정규화 비교)이면 버린다', () => {
    const text = [
      '---LINT: missing-page|medium|에이페이지|---',
      '이미 존재하는 페이지',
      '---END LINT---',
      '---LINT: missing-page|medium|새 페이지|---',
      '실제로 없는 페이지',
      '---END LINT---'
    ].join('\n')
    const result = parseSemanticLint(text, existing)
    expect(result.status).toBe('found')
    if (result.status === 'found') {
      expect(result.findings.map((f) => f.title)).toEqual(['새 페이지'])
    }
  })

  it('자모가 풀린 제목(NFD)도 이미 있는 제목으로 본다', () => {
    const text = [
      `---LINT: missing-page|medium|${'에이페이지'.normalize('NFD')}|---`,
      '이미 존재하는 페이지',
      '---END LINT---',
      '---LINT: missing-page|medium|새 페이지|---',
      '실제로 없는 페이지',
      '---END LINT---'
    ].join('\n')
    const result = parseSemanticLint(text, existing)
    expect(result.status === 'found' && result.findings.map((f) => f.title)).toEqual(['새 페이지'])
  })

  it('블록이 0개 + "문제 없음" 명시면 clean, 아니면 해석 실패', () => {
    expect(parseSemanticLint('발견된 결함이 없다. 문제 없음', existing)).toEqual({
      status: 'clean'
    })
    const fail = parseSemanticLint('그냥 산문만 있다', existing)
    expect(fail).toEqual({
      status: 'unparsed',
      reason: 'AI 점검 결과를 알아볼 수 없어요 — 다시 점검해 주세요'
    })
  })

  it('닫히지 않은 블록은 해석 실패다', () => {
    const text = ['---LINT: outdated|low|오래됨|wiki/a.md---', 'END 가 없다'].join('\n')
    const result = parseSemanticLint(text, existing)
    expect(result).toEqual({
      status: 'unparsed',
      reason: 'AI 점검 결과가 중간에 끊겨 알아볼 수 없어요 — 다시 점검해 주세요'
    })
  })
})
