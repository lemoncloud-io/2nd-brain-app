import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readBase } from './base-service'

let vault: string

const note = (rel: string, frontmatter: string): void => {
  const full = join(vault, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, `---\n${frontmatter}\n---\n\n# ${rel}\n`)
}

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'base-service-'))
  note('projects/hermes/README.md', 'type: project\nstatus: active\ngoal: 공용 AI')
  note('projects/old/README.md', 'type: project\nstatus: done\ngoal: 끝난 일')
  note('templates/project.md', 'type: project\nstatus: active\ngoal: 양식')
  note('wiki/생각.md', 'type: idea')
  // frontmatter 가 없는 문서도 볼트에 있다 — 빈 속성으로 들어와야 한다
  mkdirSync(join(vault, 'raw'), { recursive: true })
  writeFileSync(join(vault, 'raw', '원본.md'), '# 그냥 글\n')
  writeFileSync(
    join(vault, 'meet.md'),
    '---\ntype: note\n---\n\n# 모임\n\n매주 #회의 에서 정한다.\n'
  )
  writeFileSync(
    join(vault, 'tagview.base'),
    `filters:
  and:
    - file.hasTag("회의")
views:
  - type: table
    name: ByTag
    order:
      - file.name
`
  )
  writeFileSync(
    join(vault, 'projects.base'),
    `filters:
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
`
  )
  writeFileSync(join(vault, 'broken.base'), 'views: [\n  - nope')
})

afterAll(() => {
  rmSync(vault, { recursive: true, force: true })
})

describe('readBase', () => {
  it('보관함 md 의 frontmatter 로 표를 만든다', async () => {
    const table = await readBase(vault, 'projects.base')
    expect(table.error).toBeUndefined()
    const active = table.views[0]!
    expect(active.name).toBe('Active')
    expect(active.columns.map((column) => column.key)).toEqual(['file.name', 'status', 'goal'])
    expect(active.rows).toEqual([
      {
        rel: 'projects/hermes/README.md',
        cells: [
          { text: 'README', rel: 'projects/hermes/README.md' },
          { text: 'active' },
          { text: '공용 AI' }
        ]
      }
    ])
  })

  it('.base 가 아닌 경로·볼트 밖은 거절한다', async () => {
    expect((await readBase(vault, 'wiki/생각.md')).error).toBeTruthy()
    expect((await readBase(vault, '../secrets.base')).error).toBeTruthy()
  })

  it('없는 파일은 안내로', async () => {
    expect((await readBase(vault, '없다.base')).error).toContain('찾지 못했어요')
  })

  it('문서를 고치면 다시 읽는다 — 캐시가 옛 값을 붙들지 않는다', async () => {
    // 이 테스트만 쓰는 노트다 — 중간에 실패해도 다른 테스트의 보관함을 흔들지 않는다
    note('projects/cached/README.md', 'type: project\nstatus: active\ngoal: 캐시')
    const before = await readBase(vault, 'projects.base')
    expect(before.views[0]!.rows.map((row) => row.rel)).toContain('projects/cached/README.md')

    note('projects/cached/README.md', 'type: project\nstatus: done\ngoal: 캐시')
    const after = await readBase(vault, 'projects.base')
    expect(after.views[0]!.rows.map((row) => row.rel)).not.toContain('projects/cached/README.md')

    rmSync(join(vault, 'projects', 'cached'), { recursive: true, force: true })
  })

  it('깨진 파일은 안내로 — 화면이 죽지 않는다', async () => {
    const table = await readBase(vault, 'broken.base')
    expect(table.views).toEqual([])
    expect(table.error).toContain('읽지 못했어요')
  })
})

describe('readBase hasTag 본문 합산', () => {
  it('본문에만 있는 #태그로 뷰가 잡힌다', async () => {
    const table = await readBase(vault, 'tagview.base')
    expect(table.error).toBeUndefined()
    expect(table.views[0]!.rows.map((r) => r.rel)).toEqual(['meet.md'])
  })
})
