import { describe, it, expect } from 'vitest'
import { evaluateBase, cellText, type BaseNote } from './evaluate'

const note = (rel: string, props: Record<string, unknown>, mtimeMs = 0): BaseNote => {
  const base = rel.slice(rel.lastIndexOf('/') + 1)
  return {
    rel,
    basename: base.replace(/\.md$/, ''),
    folder: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '',
    props,
    mtimeMs
  }
}

// 실제 보관함 모양 — projects.base 가 고르는 것이 무엇인지 그대로 옮겼다
const notes: BaseNote[] = [
  note('projects/hermes/README.md', { type: 'project', status: 'active', goal: '공용 AI' }),
  note('projects/lemon/README.md', { type: 'project', status: 'active', goal: '앱 하나로' }),
  note('projects/old/README.md', { type: 'project', status: 'done', goal: '끝난 일' }),
  note('templates/project.md', { type: 'project', status: 'active', goal: '양식' }),
  note('wiki/생각.md', { type: 'idea', 'first-seen': '2026-09-01' })
]

// 2nd-brain 볼트의 projects.base 를 그대로 옮긴 것
const PROJECTS_BASE = `filters:
  and:
    - type == "project"
    - '!file.inFolder("templates")'
views:
  - type: table
    name: Active
    filters:
      and:
        - status != "done"
    order:
      - file.name
      - status
      - goal
  - type: table
    name: All
    order:
      - file.name
      - status
`

describe('evaluateBase — 실제 보관함 샘플', () => {
  it('Active 뷰는 끝난 것과 양식을 뺀다', () => {
    const { views } = evaluateBase(PROJECTS_BASE, notes)
    const active = views[0]!
    expect(active.name).toBe('Active')
    expect(active.unsupported).toBeUndefined()
    expect(active.rows.map((row) => row.rel)).toEqual([
      'projects/hermes/README.md',
      'projects/lemon/README.md'
    ])
  })

  it('뷰마다 칸이 다르고, 이름 칸은 확장자를 뺀 이름이다', () => {
    const { views } = evaluateBase(PROJECTS_BASE, notes)
    expect(views[0]!.columns.map((c) => c.key)).toEqual(['file.name', 'status', 'goal'])
    expect(views[0]!.rows[0]!.cells).toEqual([
      { text: 'README', rel: 'projects/hermes/README.md' },
      { text: 'active' },
      { text: '공용 AI' }
    ])
    expect(views[1]!.columns.map((c) => c.key)).toEqual(['file.name', 'status'])
  })

  it('All 뷰는 전역 필터만 건다 — 끝난 것도 들어온다', () => {
    const { views } = evaluateBase(PROJECTS_BASE, notes)
    expect(views[1]!.rows.map((row) => row.rel)).toEqual([
      'projects/hermes/README.md',
      'projects/lemon/README.md',
      'projects/old/README.md'
    ])
  })

  it('필터가 없으면 모든 노트가 든다', () => {
    const { views } = evaluateBase('views:\n  - type: table\n    name: Table\n', notes)
    expect(views[0]!.rows).toHaveLength(notes.length)
    expect(views[0]!.columns).toEqual([{ key: 'file.name', label: '이름' }])
  })

  it('limit 은 행 수를 자른다', () => {
    const { views } = evaluateBase('views:\n  - type: table\n    name: T\n    limit: 2\n', notes)
    expect(views[0]!.rows).toHaveLength(2)
  })

  it('limit 음수·소수는 0 이상 정수로 읽는다', () => {
    const base = (limit: string): string =>
      `views:\n  - type: table\n    name: T\n    limit: ${limit}\n`
    expect(evaluateBase(base('-1'), notes).views[0]!.rows).toHaveLength(0)
    expect(evaluateBase(base('0'), notes).views[0]!.rows).toHaveLength(0)
    expect(evaluateBase(base('2.5'), notes).views[0]!.rows).toHaveLength(2)
    expect(evaluateBase(base('.nan'), notes).views[0]!.rows).toHaveLength(notes.length)
  })

  it('displayName 이 칸 제목이 된다', () => {
    const base = `properties:
  status:
    displayName: 상태
views:
  - type: table
    name: T
    order:
      - status
`
    expect(evaluateBase(base, notes).views[0]!.columns).toEqual([{ key: 'status', label: '상태' }])
  })
})

describe('evaluateBase 의 필터 갈래', () => {
  const viewOf = (filters: string): string =>
    ['views:', '  - type: table', '    name: T', '    filters:', filters].join('\n')

  it('or 는 하나만 맞아도 든다', () => {
    const base = viewOf(
      ['      or:', '        - type == "idea"', '        - status == "done"'].join('\n')
    )
    expect(evaluateBase(base, notes).views[0]!.rows.map((row) => row.rel)).toEqual([
      'projects/old/README.md',
      'wiki/생각.md'
    ])
  })

  it('not 은 맞는 것을 뺀다', () => {
    const base = viewOf(['      not:', '        - type == "project"'].join('\n'))
    expect(evaluateBase(base, notes).views[0]!.rows.map((row) => row.rel)).toEqual(['wiki/생각.md'])
  })

  it('빈 or 는 아무것도 들이지 않는다', () => {
    const base = viewOf('      or: []')
    expect(evaluateBase(base, notes).views[0]!.rows).toEqual([])
  })

  it('목록으로 쓴 필터는 전부 맞아야 한다', () => {
    const base = viewOf(['      - type == "project"', '      - status == "done"'].join('\n'))
    expect(evaluateBase(base, notes).views[0]!.rows.map((row) => row.rel)).toEqual([
      'projects/old/README.md'
    ])
  })
})

describe('evaluateBase 의 줄 세우기와 묶기', () => {
  const viewWith = (lines: string[]): string =>
    ['views:', '  - type: table', '    name: T', ...lines].join('\n')

  it('sort 는 property 와 direction 을 따른다 — 한글은 라틴 앞이라 DESC 에서 맨 뒤다', () => {
    const base = viewWith([
      '    order:',
      '      - file.name',
      '    sort:',
      '      - property: file.name',
      '        direction: DESC'
    ])
    expect(evaluateBase(base, notes).views[0]!.rows.map((row) => row.rel)).toEqual([
      'projects/hermes/README.md',
      'projects/lemon/README.md',
      'projects/old/README.md',
      'templates/project.md',
      'wiki/생각.md'
    ])
  })

  it('sort 키가 여럿이면 앞의 것이 이긴다', () => {
    const base = viewWith([
      '    sort:',
      '      - property: type',
      '        direction: ASC',
      '      - property: file.name',
      '        direction: DESC'
    ])
    expect(evaluateBase(base, notes).views[0]!.rows.map((row) => row.rel)).toEqual([
      'wiki/생각.md',
      'projects/hermes/README.md',
      'projects/lemon/README.md',
      'projects/old/README.md',
      'templates/project.md'
    ])
  })

  it('file.mtime 으로도 센다', () => {
    const dated = [note('a.md', {}, 100), note('b.md', {}, 300), note('c.md', {}, 200)]
    const base = viewWith(['    sort:', '      - property: file.mtime', '        direction: DESC'])
    expect(evaluateBase(base, dated).views[0]!.rows.map((row) => row.rel)).toEqual([
      'b.md',
      'c.md',
      'a.md'
    ])
  })

  it('빈 값은 방향을 뒤집어도 뒤에 남는다', () => {
    const base = viewWith(['    sort:', '      - property: goal', '        direction: DESC'])
    const rows = evaluateBase(base, notes).views[0]!.rows
    expect(rows[rows.length - 1]!.rel).toBe('wiki/생각.md')
  })

  it('groupBy 는 줄마다 묶음 이름을 단다', () => {
    const base = viewWith(['    groupBy:', '      property: type', '      direction: DESC'])
    expect(evaluateBase(base, notes).views[0]!.rows.map((row) => [row.rel, row.group])).toEqual([
      ['projects/hermes/README.md', 'project'],
      ['projects/lemon/README.md', 'project'],
      ['projects/old/README.md', 'project'],
      ['templates/project.md', 'project'],
      ['wiki/생각.md', 'idea']
    ])
  })

  it('모르는 방향은 그 뷰를 멈춘다 — 엉뚱한 순서를 맞는 것처럼 보이면 안 된다', () => {
    const base = viewWith(['    sort:', '      - property: status', '        direction: 위로'])
    expect(evaluateBase(base, notes).views[0]!.unsupported).toContain('위로')
  })
})

describe('evaluateBase 의 수식', () => {
  const WITH_FORMULA = `formulas:
  project: link(file.path, file.folder.replace(/^.*\\//, ""))
properties:
  formula.project:
    displayName: Project
  note.goal:
    displayName: 목표
views:
  - type: table
    name: T
    filters:
      and:
        - type == "project"
    order:
      - formula.project
      - goal
`

  it('수식 칸은 계산해서 갈 곳까지 단다', () => {
    const view = evaluateBase(WITH_FORMULA, notes).views[0]!
    expect(view.unsupported).toBeUndefined()
    expect(view.columns).toEqual([
      { key: 'formula.project', label: 'Project' },
      { key: 'goal', label: '목표' }
    ])
    expect(view.rows[0]!.cells[0]).toEqual({ text: 'hermes', rel: 'projects/hermes/README.md' })
  })

  it('수식은 필터와 sort 에서도 쓴다', () => {
    const base = `formulas:
  bucket: file.folder.replace(/^.*\\//, "")
views:
  - type: table
    name: T
    filters:
      and:
        - 'formula.bucket == "lemon"'
`
    expect(evaluateBase(base, notes).views[0]!.rows.map((row) => row.rel)).toEqual([
      'projects/lemon/README.md'
    ])
  })
})

describe('evaluateBase 가 계산하지 않는 것', () => {
  it('모양만 바꾸는 키(columnSize)는 표를 막지 않는다 — Obsidian 에서 칸 너비를 끌면 붙는다', () => {
    const base = [
      'views:',
      '  - type: table',
      '    name: T',
      '    columnSize:',
      '      file.name: 260'
    ].join('\n')
    const view = evaluateBase(base, notes).views[0]!
    expect(view.unsupported).toBeUndefined()
    expect(view.rows).toHaveLength(notes.length)
  })

  it('table 아닌 보기는 행 대신 이유를 준다', () => {
    const { views } = evaluateBase('views:\n  - type: cards\n    name: 카드\n', notes)
    expect(views[0]!.rows).toEqual([])
    expect(views[0]!.unsupported).toContain('Obsidian')
  })

  it('이 앱이 모르는 수식이 칸에 쓰이면 그 뷰만 멈춘다', () => {
    const base = `formulas:
  ppu: price.toFixed(2)
views:
  - type: table
    name: T
    order:
      - formula.ppu
`
    expect(evaluateBase(base, notes).views[0]!.unsupported).toContain('toFixed')
  })

  it('모르는 함수가 든 조건은 그 뷰만 멈춘다', () => {
    const base = `views:
  - type: table
    name: T
    filters:
      and:
        - 'file.hasLink("어디")'
`
    expect(evaluateBase(base, notes).views[0]!.unsupported).toContain('file.hasLink')
  })

  it('깨진 YAML 은 안내로 떨어진다', () => {
    const { views, error } = evaluateBase('views: [\n  - broken', notes)
    expect(views).toEqual([])
    expect(error).toContain('읽지 못했어요')
  })

  it('표가 없는 파일도 안내로', () => {
    expect(evaluateBase('filters:\n  and: []\n', notes).error).toContain('표가 없어요')
  })
})

describe('cellText', () => {
  it('배열은 쉼표로, 위키링크는 글자만', () => {
    expect(cellText(['가', '나'])).toBe('가, 나')
    expect(cellText('[[wiki/페이지|보이는 글]]')).toBe('보이는 글')
    expect(cellText('[[페이지]]')).toBe('페이지')
    expect(cellText(null)).toBe('')
  })
})

describe('evaluateBase 가 멈추는 모양들', () => {
  const viewWith = (lines: string[]): string =>
    ['views:', '  - type: table', '    name: T', ...lines].join('\n')
  const stopped = (base: string): string | undefined =>
    evaluateBase(base, notes).views[0]!.unsupported

  it('모양이 어긋난 필터는 그 뷰를 멈춘다', () => {
    // 비객체 필터
    expect(stopped(viewWith(['    filters: 3']))).toContain('필터 모양')
    // 모르는 필터 키
    expect(
      stopped(viewWith(['    filters:', '      bogus:', '        - type == "project"']))
    ).toContain('bogus')
    // and/or/not 아래 비목록
    expect(stopped(viewWith(['    filters:', '      and:', '        type: project']))).toContain(
      'and 아래에는 목록'
    )
    expect(stopped(viewWith(['    filters:', '      or: type == "project"']))).toContain(
      'or 아래에는 목록'
    )
    expect(stopped(viewWith(['    filters:', '      not: type == "project"']))).toContain(
      'not 아래에는 목록'
    )
  })

  it('모양이 어긋난 sort·groupBy 는 그 뷰를 멈춘다', () => {
    // sort 비목록
    expect(stopped(viewWith(['    sort:', '      property: file.name']))).toContain(
      'sort 아래에는 목록'
    )
    // sort 모르는 키
    expect(
      stopped(viewWith(['    sort:', '      - property: file.name', '        foo: 1']))
    ).toContain('sort 설정')
    // sort property 누락
    expect(stopped(viewWith(['    sort:', '      - direction: DESC']))).toContain(
      'sort에는 property'
    )
    // groupBy 모르는 키·property 누락
    expect(stopped(viewWith(['    groupBy:', '      property: type', '      foo: 1']))).toContain(
      'groupBy 설정'
    )
    expect(stopped(viewWith(['    groupBy:', '      direction: DESC']))).toContain(
      'groupBy에는 property'
    )
  })

  it('모르는 표 설정 키는 그 뷰를 멈춘다', () => {
    expect(stopped(viewWith(['    futureKey: 1']))).toContain('futureKey')
  })

  it('limit 문자열·무한대는 전체 행을 그린다', () => {
    expect(evaluateBase(viewWith(['    limit: "2"']), notes).views[0]!.rows).toHaveLength(
      notes.length
    )
    expect(evaluateBase(viewWith(['    limit: .inf']), notes).views[0]!.rows).toHaveLength(
      notes.length
    )
  })

  it('cellText 는 날짜·객체·수를 글자로 바꾼다', () => {
    expect(cellText(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02')
    expect(cellText({ a: 1 })).toBe('{"a":1}')
    expect(cellText(3)).toBe('3')
  })
})
