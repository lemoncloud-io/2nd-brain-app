import { describe, expect, it } from 'vitest'
import type { VaultTreeEntry } from '../../../shared/ipc-contract'
import {
  ancestorsOf,
  buildTree,
  changedFolders,
  changeLabel,
  treeLabel,
  visibleRows
} from './tree-model'
import { messages } from '../../../shared/i18n'

const file = (rel: string, mtimeMs = 0): VaultTreeEntry => ({
  rel,
  kind: 'file',
  ext: rel.includes('.') ? rel.slice(rel.lastIndexOf('.')).toLowerCase() : '',
  mtimeMs,
  size: 0
})
const dir = (rel: string): VaultTreeEntry => ({
  rel,
  kind: 'dir',
  ext: '',
  mtimeMs: 0,
  size: 0
})

const entries: VaultTreeEntry[] = [
  file('VAULT_RULES.md'),
  dir('wiki'),
  file('wiki/INDEX.md'),
  dir('private'),
  file('private/2026-09-17.md', 20),
  file('private/2026-09-16.md', 10),
  dir('Clippings'),
  file('Clippings/shot.png'),
  dir('areas'),
  dir('areas/daily'),
  file('areas/daily/노트.md'),
  file('base.base'),
  file('가나.md')
]

const rels = (rows: { node: { rel: string } }[]): string[] => rows.map((r) => r.node.rel)

describe('buildTree / visibleRows', () => {
  // 한국어 정렬(ICU ko)은 한글을 라틴 앞에 둔다 — 한국어 OS 의 Obsidian 과 같다
  it('폴더 먼저, 그다음 파일 — 각각 이름순(한국어 정렬)', () => {
    const rows = visibleRows(buildTree(entries), new Set())
    expect(rels(rows)).toEqual([
      'areas',
      'Clippings',
      'private',
      'wiki',
      '가나.md',
      'base.base',
      'VAULT_RULES.md'
    ])
  })

  it('펼친 폴더의 자식만 행이 된다 — 접힌 폴더의 자식은 그리지 않는다', () => {
    const rows = visibleRows(buildTree(entries), new Set(['areas', 'private']))
    expect(rels(rows)).toEqual([
      'areas',
      'areas/daily',
      'Clippings',
      'private',
      'private/2026-09-16.md',
      'private/2026-09-17.md',
      'wiki',
      '가나.md',
      'base.base',
      'VAULT_RULES.md'
    ])
    expect(rows.find((r) => r.node.rel === 'private/2026-09-16.md')?.depth).toBe(1)
  })

  it('최근 수정순이면 파일을 새것부터 — 폴더는 그대로 이름순', () => {
    const rows = visibleRows(buildTree(entries, 'recent'), new Set(['private']))
    const priv = rels(rows).filter((rel) => rel.startsWith('private/'))
    expect(priv).toEqual(['private/2026-09-17.md', 'private/2026-09-16.md'])
  })

  it('부모 폴더 항목이 목록에 없어도 경로로 폴더를 만든다', () => {
    const rows = visibleRows(buildTree([file('a/b/c.md')]), new Set(['a', 'a/b']))
    expect(rels(rows)).toEqual(['a', 'a/b', 'a/b/c.md'])
  })

  it('수백 개 파일이 든 폴더를 접으면 행은 그 폴더 하나뿐이다', () => {
    const many = [dir('big'), ...Array.from({ length: 500 }, (_, i) => file(`big/p${i}.md`))]
    expect(visibleRows(buildTree(many), new Set())).toHaveLength(1)
    expect(visibleRows(buildTree(many), new Set(['big']))).toHaveLength(501)
  })
})

describe('treeLabel', () => {
  it('md 는 확장자를 숨기고, 다른 형식은 꼬리표를 단다', () => {
    expect(treeLabel(file('private/2026-09-17.md'))).toEqual({ name: '2026-09-17', tag: null })
    expect(treeLabel(file('Clippings/shot.png'))).toEqual({ name: 'shot', tag: 'PNG' })
    expect(treeLabel(file('base.base'))).toEqual({ name: 'base', tag: 'BASE' })
    expect(treeLabel(file('Makefile'))).toEqual({ name: 'Makefile', tag: null })
    expect(treeLabel(dir('areas/daily'))).toEqual({ name: 'daily', tag: null })
  })

  it('확장자 표시를 켜면 적힌 이름 그대로 — 꼬리표는 달지 않는다', () => {
    expect(treeLabel(file('private/2026-09-17.md'), true)).toEqual({
      name: '2026-09-17.md',
      tag: null
    })
    expect(treeLabel(file('Clippings/shot.png'), true)).toEqual({ name: 'shot.png', tag: null })
    expect(treeLabel(file('Makefile'), true)).toEqual({ name: 'Makefile', tag: null })
    expect(treeLabel(dir('areas/daily'), true)).toEqual({ name: 'daily', tag: null })
  })

  it('인자를 안 주면 꺼진 쪽이다 — 클리핑 목록 같은 기존 호출부가 그대로 돈다', () => {
    expect(treeLabel(file('a.md'))).toEqual(treeLabel(file('a.md'), false))
  })
})

describe('ancestorsOf', () => {
  it('파일을 감싼 폴더를 위에서부터', () => {
    expect(ancestorsOf('areas/daily/노트.md')).toEqual(['areas', 'areas/daily'])
    expect(ancestorsOf('VAULT_RULES.md')).toEqual([])
  })
})

describe('changeLabel', () => {
  it('git 글자가 아니라 사람 말이다', () => {
    expect(changeLabel('new')).toBe('새 파일')
    expect(changeLabel('changed')).toBe('바뀐 파일')
    expect(messages('ko').library.folderChanged).toBe('안에 달라진 것이 있어요')
  })
})

describe('changedFolders', () => {
  it('달라진 파일을 감싼 폴더를 전부 모은다', () => {
    expect(changedFolders({ 'areas/daily/노트.md': 'changed', 'a.md': 'new' })).toEqual(
      new Set(['areas', 'areas/daily'])
    )
  })

  it('달라진 것이 없으면 빈 집합이다', () => {
    expect(changedFolders({})).toEqual(new Set())
  })
})
