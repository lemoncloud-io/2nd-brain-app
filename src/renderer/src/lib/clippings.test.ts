import { describe, expect, it } from 'vitest'
import type { VaultTreeEntry } from '../../../shared/ipc-contract'
import { waitingClippings } from './clippings'

const file = (rel: string, ext: string, mtimeMs: number): VaultTreeEntry => ({
  rel,
  kind: 'file' as const,
  ext,
  mtimeMs,
  size: 0
})

describe('waitingClippings', () => {
  it('Clippings 바로 아래만, 최근 것부터, md 는 확장자 없이 그 밖은 꼬리표로', () => {
    const list = waitingClippings([
      file('Clippings/회의록.md', '.md', 1),
      file('Clippings/보고서.pdf', '.pdf', 3),
      { rel: 'Clippings/묶음', kind: 'dir' as const, ext: '', mtimeMs: 2, size: 0 },
      file('Clippings/묶음/안쪽.md', '.md', 9),
      file('private/노트.md', '.md', 9)
    ])
    expect(list.map((c) => [c.name, c.tag])).toEqual([
      ['보고서', 'PDF'],
      ['묶음', null],
      ['회의록', null]
    ])
  })
})
