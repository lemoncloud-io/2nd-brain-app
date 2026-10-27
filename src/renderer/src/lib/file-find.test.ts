import { describe, expect, it } from 'vitest'
import type { VaultTreeEntry } from '../../../shared/ipc-contract'
import { fileEntries, findByKind, findKindOf } from './file-find'

const file = (rel: string): VaultTreeEntry => ({
  rel,
  kind: 'file',
  ext: rel.slice(rel.lastIndexOf('.')).toLowerCase(),
  mtimeMs: 0,
  size: 0
})

const tree = [
  file('raw/2026 예산 보고서.pdf'),
  file('raw/계약서.PDF'),
  file('raw/shot.png'),
  file('raw/회의.hwpx'),
  file('wiki/a.md'),
  { rel: 'raw', kind: 'dir', ext: '', mtimeMs: 0, size: 0 } as VaultTreeEntry
]

describe('findKindOf', () => {
  it('md 는 문서, pdf·그림·html 은 제 종류, 나머지는 그 밖 — 확장자 대소문자를 가리지 않는다', () => {
    expect(findKindOf('wiki/a.md')).toBe('doc')
    expect(findKindOf('raw/계약서.PDF')).toBe('pdf')
    expect(findKindOf('raw/shot.png')).toBe('image')
    expect(findKindOf('raw/page.html')).toBe('html')
    expect(findKindOf('raw/page.HTM')).toBe('html')
    expect(findKindOf('raw/회의.hwpx')).toBe('other')
    expect(findKindOf('raw/확장자없음')).toBe('other')
  })
})

describe('fileEntries', () => {
  it('md·폴더는 빼고, 이름은 확장자 없이 꼬리표와 함께', () => {
    expect(fileEntries(tree)).toEqual([
      { rel: 'raw/2026 예산 보고서.pdf', title: '2026 예산 보고서', tag: 'PDF' },
      { rel: 'raw/계약서.PDF', title: '계약서', tag: 'PDF' },
      { rel: 'raw/shot.png', title: 'shot', tag: 'PNG' },
      { rel: 'raw/회의.hwpx', title: '회의', tag: 'HWPX' }
    ])
  })
})

describe('findByKind', () => {
  const entries = fileEntries(tree)
  const rels = (kind: Parameters<typeof findByKind>[1], text: string): string[] =>
    findByKind(entries, kind, text).map((e) => e.rel)

  it('`.pdf`·`pdf` 를 치면 종류를 고르지 않아도 그 형식이 나온다', () => {
    expect(rels(null, '.pdf')).toEqual(['raw/계약서.PDF', 'raw/2026 예산 보고서.pdf'])
    expect(rels(null, '보고서 pdf')).toEqual(['raw/2026 예산 보고서.pdf'])
  })

  it('종류를 고르면 그 안에서만 찾는다', () => {
    expect(rels('pdf', '계약')).toEqual(['raw/계약서.PDF'])
    expect(rels('image', '계약')).toEqual([])
  })

  it('낱말 없이 종류만 고르면 그 종류 전부(이름순), 종류도 없으면 빈 목록', () => {
    expect(rels('pdf', '')).toEqual(['raw/2026 예산 보고서.pdf', 'raw/계약서.PDF'])
    expect(rels(null, ' ')).toEqual([])
  })
})
