import { describe, expect, it } from 'vitest'
import { closedRanges, outlineOf, toggleCheckbox } from './plan-outline'

const NOTE = [
  '# 2026-09-18',
  '',
  '## 어제에서 넘어온 것',
  '- [ ] 계약서 검토',
  '- [x] 회의록 정리',
  '',
  '## 오늘 할 일',
  '1. [x] 견적 보내기',
  '2. [ ] 일정 확인',
  '- 메모는 체크박스가 아니다',
  '',
  '### 오후',
  '- [ ] 통화'
].join('\n')

describe('outlineOf', () => {
  it('헤딩마다 줄 번호와 그 절의 체크박스 수를 센다', () => {
    const outline = outlineOf(NOTE)
    expect(outline.sections).toEqual([
      { text: '2026-09-18', id: '2026-09-18', level: 1, line: 1, done: 0, total: 0 },
      {
        text: '어제에서 넘어온 것',
        id: '어제에서-넘어온-것',
        level: 2,
        line: 3,
        done: 1,
        total: 2
      },
      { text: '오늘 할 일', id: '오늘-할-일', level: 2, line: 7, done: 1, total: 2 },
      { text: '오후', id: '오후', level: 3, line: 12, done: 0, total: 1 }
    ])
  })

  it('문서 전체의 n/m 은 절들의 합이다', () => {
    expect(outlineOf(NOTE)).toMatchObject({ done: 2, total: 5 })
  })

  it('헤딩 앞의 체크박스도 문서 수에는 들어간다', () => {
    const outline = outlineOf('- [ ] 머리글 없는 할 일\n\n# 제목\n- [x] 끝난 것')
    expect(outline).toMatchObject({ done: 1, total: 2 })
    expect(outline.sections).toEqual([
      { text: '제목', id: '제목', level: 1, line: 3, done: 1, total: 1 }
    ])
  })

  // 계획 문서에는 명령·YAML 예시가 같이 산다 — 그 안의 글자를 세면 진행률이 거짓말을 한다
  it('코드 블록 안의 - [ ] 와 # 는 세지 않는다', () => {
    const text = [
      '# 계획',
      '- [ ] 진짜 할 일',
      '',
      '```md',
      '# 예시 제목',
      '- [ ] 예시 할 일',
      '- [x] 예시 끝난 일',
      '```',
      '',
      '~~~',
      '## 물결 울타리 안',
      '~~~',
      '',
      '- [x] 진짜 끝난 일'
    ].join('\n')
    const outline = outlineOf(text)
    expect(outline.sections).toEqual([
      { text: '계획', id: '계획', level: 1, line: 1, done: 1, total: 2 }
    ])
    expect(outline).toMatchObject({ done: 1, total: 2 })
  })

  it('닫히지 않은 코드 블록은 끝까지 코드다 — 열린 울타리 뒤를 헤딩으로 읽지 않는다', () => {
    expect(outlineOf('# 제목\n\n```\n# 안 닫힌 예시\n- [ ] 예시').sections).toEqual([
      { text: '제목', id: '제목', level: 1, line: 1, done: 0, total: 0 }
    ])
  })

  it('체크박스 모양이 아닌 줄은 세지 않는다', () => {
    const outline = outlineOf('# 제목\n- [ ]붙은 것\n-[ ] 공백 없는 것\n- [?] 다른 표식')
    expect(outline).toMatchObject({ done: 0, total: 0 })
  })

  it('빈 문서는 절도 수도 없다', () => {
    expect(outlineOf('')).toEqual({ sections: [], done: 0, total: 0 })
  })

  // 목차가 그 절로 보내려면 리더가 그린 헤딩과 같은 이름표를 써야 한다
  it('같은 이름의 절에는 다른 이름표를 준다 — 뒤엣것이 -2, -3', () => {
    const outline = outlineOf('## 할 일\n## 할 일\n### 할 일')
    expect(outline.sections.map((s) => s.id)).toEqual(['할-일', '할-일-2', '할-일-3'])
  })

  it('이름표에 쓸 글자가 없는 절도 이름표를 갖는다', () => {
    expect(outlineOf('# ?!\n## ?!').sections.map((s) => s.id)).toEqual(['절', '절-2'])
  })
})

describe('toggleCheckbox', () => {
  const NOTE = ['# 오늘', '- [ ] 가', '- [x] 나', '보통 줄'].join('\n')

  it('그 줄의 표식만 뒤집는다 — 나머지 줄은 글자 하나도 바뀌지 않는다', () => {
    expect(toggleCheckbox(NOTE, 2)).toBe(['# 오늘', '- [x] 가', '- [x] 나', '보통 줄'].join('\n'))
    expect(toggleCheckbox(NOTE, 3)).toBe(['# 오늘', '- [ ] 가', '- [ ] 나', '보통 줄'].join('\n'))
  })

  it('들여쓴 번호 항목도 뒤집는다', () => {
    expect(toggleCheckbox('  1. [ ] 가', 1)).toBe('  1. [x] 가')
  })

  // 리더가 준 줄 번호가 어긋나면 엉뚱한 줄을 고치느니 아무것도 쓰지 않는다
  it('체크박스 줄이 아니면 null 이다', () => {
    expect(toggleCheckbox(NOTE, 1)).toBeNull()
    expect(toggleCheckbox(NOTE, 4)).toBeNull()
    expect(toggleCheckbox(NOTE, 0)).toBeNull()
    expect(toggleCheckbox(NOTE, 99)).toBeNull()
  })

  it('표식 뒤에 공백이 없는 줄은 체크박스가 아니다 — 세는 규칙과 같다', () => {
    expect(toggleCheckbox('- [ ]붙은 것', 1)).toBeNull()
  })

  it('줄 끝 표식도 뒤집는다 — 글자 없는 항목', () => {
    expect(toggleCheckbox('- [ ]', 1)).toBe('- [x]')
  })
})

describe('closedRanges', () => {
  const RANGES = (text: string): { from: number; to: number }[] =>
    closedRanges(outlineOf(text), text.split('\n').length)

  // 헤딩은 남긴다 — 목차가 그 절을 계속 보여 주므로 지우면 눌러도 갈 데가 없다
  it('체크박스가 전부 끝난 절의 줄 범위를 준다 — 헤딩 다음 줄부터 다음 헤딩 앞까지', () => {
    const text = ['## 끝난 절', '- [x] 가', '', '## 남은 절', '- [ ] 나'].join('\n')
    expect(RANGES(text)).toEqual([{ from: 2, to: 3 }])
  })

  it('마지막 절은 문서 끝까지다', () => {
    expect(RANGES('## 끝난 절\n- [x] 가\n- [x] 나')).toEqual([{ from: 2, to: 3 }])
  })

  // 하위 절에 남은 것이 있으면 그 절은 제 범위만 접힌다 — 부모가 자식을 덮지 않는다
  it('체크박스가 없는 절과 남은 절은 접지 않는다', () => {
    const text = ['# 오늘', '## 끝난 절', '- [x] 가', '### 남은 하위', '- [ ] 나'].join('\n')
    expect(RANGES(text)).toEqual([{ from: 3, to: 3 }])
  })
})
