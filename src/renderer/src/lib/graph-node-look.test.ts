import { describe, expect, it } from 'vitest'
import type { GraphNode } from '../../../shared/wiki/graph'
import { globeSector, nodeLook, openableRel } from './graph-node-look'

const node = (rel: string | null, label: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  key: rel ?? label,
  rel,
  label,
  ghost: false,
  community: 2,
  ...extra
})

describe('nodeLook', () => {
  it('볼트 루트의 시스템 페이지는 작은 점에 (보관함 관리 문서) 표시가 붙는다', () => {
    const page = nodeLook(node('wiki/a.md', 'a'))
    for (const [rel, label] of [
      ['wiki/INDEX.md', 'INDEX'],
      ['wiki/TOPIC_MAP.md', 'TOPIC_MAP'],
      ['wiki/VAULT_MEMORY.md', 'VAULT_MEMORY']
    ] as const) {
      const look = nodeLook(node(rel, label))
      expect(look.label).toBe(`${label} (보관함 관리 문서)`)
      expect(look.size).toBeLessThan(page.size)
    }
  })

  it('하위 폴더의 INDEX 는 일반 페이지와 같다', () => {
    const nested = nodeLook(node('wiki/topics/INDEX.md', 'topics/INDEX'))
    expect(nested).toEqual(nodeLook(node('wiki/a.md', 'topics/INDEX')))
  })

  it('유령 노드는 페이지보다 작고 이름만 보인다', () => {
    const ghost = nodeLook(node(null, 'missing', { ghost: true }))
    expect(ghost.label).toBe('missing')
    expect(ghost.size).toBeLessThan(nodeLook(node('wiki/a.md', 'a')).size)
  })
})

describe('openableRel', () => {
  const page = (over: Partial<GraphNode> = {}): GraphNode => ({
    key: 'wiki/a.md',
    rel: 'wiki/a.md',
    label: 'A',
    ghost: false,
    community: 0,
    ...over
  })

  it('쓴 페이지는 그 경로를 연다', () => {
    expect(openableRel(page())).toBe('wiki/a.md')
  })

  // 유령에 경로가 실려 와도 여는 것은 유령 여부가 정한다 — 링크만 있고 파일은 없는 자리다
  it('유령은 아직 없는 페이지라 열 것이 없다', () => {
    expect(openableRel(page({ key: 'ghost:b', rel: 'wiki/b.md', ghost: true }))).toBeNull()
  })

  it('경로가 없는 점은 열지 않는다', () => {
    expect(openableRel(page({ rel: null }))).toBeNull()
  })
})

describe('globeSector', () => {
  it('종류가 먼저 — 없는 페이지·보관함 관리 문서는 각자 한 구획', () => {
    expect(globeSector(node(null, 'x', { ghost: true }))).toBe('ghost')
    expect(globeSector(node('wiki/INDEX.md', 'INDEX'))).toBe('system')
  })

  it('페이지는 위키 안 첫 폴더로, 위키 바로 아래 파일은 위키 한 구획', () => {
    expect(globeSector(node('wiki/topics/a.md', 'a'))).toBe('page:topics')
    expect(globeSector(node('wiki/topics/deep/b.md', 'b'))).toBe('page:topics')
    expect(globeSector(node('wiki/a.md', 'a'))).toBe('page:')
    expect(globeSector(node('projects/x/c.md', 'c'))).toBe('page:projects')
  })
})
