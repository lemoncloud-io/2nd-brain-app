import { describe, expect, it } from 'vitest'
import { lintStructure, LINT_EXEMPT } from './lint'
import { parseWikiPage } from './parse'

describe('lintStructure — test: lint.ts', () => {
  const pages = [
    'wiki/INDEX.md',
    'wiki/TOPIC_MAP.md',
    'wiki/VAULT_MEMORY.md',
    'wiki/a.md',
    'wiki/b.md',
    'wiki/orphan.md',
    'wiki/no-out.md'
  ].map((rel) => parseWikiPage(rel, bodyOf(rel)))

  function bodyOf(rel: string): string {
    if (rel === 'wiki/INDEX.md') return '# INDEX\n\n[[a]] [[b]]\n'
    if (rel === 'wiki/a.md') return '# A\n\n[[b]] [[missing-page]]\n'
    if (rel === 'wiki/b.md') return '# B\n\n[[a]]\n'
    if (rel === 'wiki/no-out.md') return '# NO\n'
    if (rel === 'wiki/orphan.md') return '# O\n\n[[b]]\n'
    return ''
  }

  it('orphan — 들어오는 링크 0이면 orphan, 면제 페이지는 제외', () => {
    const orphans = lintStructure(pages).filter((f) => f.kind === 'orphan')
    expect(orphans.map((f) => f.rel)).toEqual(['wiki/orphan.md', 'wiki/no-out.md'])
    expect(orphans.some((f) => f.rel === 'wiki/VAULT_MEMORY.md')).toBe(false)
  })

  it('broken-link — 해석 실패 대상과 줄 번호(1-based)', () => {
    const broken = lintStructure(pages).filter((f) => f.kind === 'broken-link')
    expect(broken).toEqual([
      { kind: 'broken-link', rel: 'wiki/a.md', line: 3, target: 'missing-page' }
    ])
  })

  it('no-outlinks — 링크 없는 페이지', () => {
    const noOut = lintStructure(pages).filter((f) => f.kind === 'no-outlinks')
    // 면제 페이지는 no-outlinks에서도 제외 — 시스템 페이지라 링크 없는 게 정상
    expect(noOut.map((f) => f.rel)).toEqual(['wiki/no-out.md'])
  })

  it('면제 목록은 INDEX·TOPIC_MAP·VAULT_MEMORY 세 가지', () => {
    expect(LINT_EXEMPT).toEqual(['wiki/INDEX.md', 'wiki/TOPIC_MAP.md', 'wiki/VAULT_MEMORY.md'])
  })

  it('코드펜스 안 링크는 broken-link로 세지 않는다', () => {
    const fenced = [
      parseWikiPage('wiki/x.md', '# X\n\n```\n[[ghost]]\n```\n'),
      parseWikiPage('wiki/INDEX.md', '[[x]]\n')
    ]
    expect(lintStructure(fenced).filter((f) => f.kind === 'broken-link')).toEqual([])
  })

  it('볼트 파일로 이어진 링크(vaultFile)는 깨진 링크가 아니고 나가는 링크로 센다', () => {
    const page = parseWikiPage('wiki/p.md', '# P\n\n[[projects/demo/README]]\n')
    const marked = { ...page, links: page.links.map((link) => ({ ...link, vaultFile: true })) }
    const findings = lintStructure([marked])
    expect(findings.filter((f) => f.kind === 'broken-link')).toEqual([])
    expect(findings.filter((f) => f.kind === 'no-outlinks')).toEqual([])
  })

  it('충돌 사본(충돌-내것·팀것)은 orphan·no-outlinks에서 제외한다', () => {
    const kept = [
      parseWikiPage('wiki/x-충돌-내것-2024-01-01.md', '# X\n'),
      parseWikiPage('wiki/y-충돌-팀것-2024-01-02-2.md', '# Y\n')
    ]
    const rels = lintStructure(kept).map((f) => f.rel)
    expect(rels).not.toContain('wiki/x-충돌-내것-2024-01-01.md')
    expect(rels).not.toContain('wiki/y-충돌-팀것-2024-01-02-2.md')
  })
})
