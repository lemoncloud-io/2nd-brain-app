import { describe, expect, it } from 'vitest'
import { createVaultActivity } from './vault-activity'
import type { BeginResult } from './vault-activity'

const endOf = (r: BeginResult): (() => void) => {
  if (typeof r !== 'function') throw new Error(`busy: ${r.busy}`)
  return r
}

describe('VaultActivity', () => {
  it('위키화·확정 중 editLock이 사유를 돌려준다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('ingest', '/vault'))
    expect(a.editLock('/vault')).toMatch(/위키 초안 만들기/)
    end()
    const end2 = endOf(a.begin('finalize', '/vault'))
    expect(a.editLock('/vault')).toMatch(/위키에 넣는/)
    end2()
    expect(a.editLock('/vault')).toBeNull()
  })

  it('chat·lint는 편집을 막지 않는다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('lint', 'heavy'))
    const endChat = endOf(a.begin('chat', 'c1'))
    expect(a.editLock('/vault')).toBeNull()
    end()
    endChat()
  })

  it('위키화 진행 중 clipLock이 사유를 돌려준다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('ingest', '/vault'))
    expect(a.clipLock('/vault')).toMatch(/위키 초안 만들기/)
    end()
    expect(a.clipLock('/vault')).toBeNull()
  })

  it('승인 확정 중에도 클립이 막힌다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('finalize', '/vault'))
    expect(a.clipLock('/vault')).toBeTruthy()
    end()
    expect(a.clipLock('/vault')).toBeNull()
  })

  it('같은 볼트에 begin이 겹치면 busy 사유를 돌려준다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('ingest', '/vault'))
    const second = a.begin('ingest', '/vault')
    expect('busy' in second).toBe(true)
    end()
    const again = endOf(a.begin('ingest', '/vault'))
    expect(typeof again).toBe('function')
    if (typeof again === 'function') again()
  })

  it('노트 쓰기는 위키화·확정과 같은 볼트에서 서로 배타다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('ingest', '/vault'))
    const note = a.begin('note', '/vault')
    expect(note).toEqual({ busy: '위키 초안 만들기가 이미 진행 중이에요' })
    end()
    const endNote = endOf(a.begin('note', '/vault'))
    expect(a.begin('finalize', '/vault')).toEqual({ busy: '채팅이 노트를 쓰고 있어요' })
    expect(a.begin('note', '/vault')).toEqual({ busy: '채팅이 노트를 쓰고 있어요' })
    expect(a.holder('/vault')).toBe('note')
    expect(a.clipLock('/vault')).toMatch(/노트/)
    expect(a.editLock('/vault')).toMatch(/노트/)
    endNote()
    expect(a.holder('/vault')).toBeNull()
    expect(a.editLock('/vault')).toBeNull()
  })

  it('같은 보관함의 점검은 노트 쓰기·위키화 잠금을 덮지 않는다', () => {
    const a = createVaultActivity()
    const endNote = endOf(a.begin('note', '/vault'))
    const endFirstLint = endOf(a.begin('lint', '/vault'))
    expect(a.holder('/vault')).toBe('note')
    expect(a.editLock('/vault')).toMatch(/노트/)
    endFirstLint()
    expect(a.holder('/vault')).toBe('note')
    endNote()
    const endLint = endOf(a.begin('lint', '/vault'))
    const endIngest = endOf(a.begin('ingest', '/vault'))
    expect(a.holder('/vault')).toBe('ingest')
    endLint()
    expect(a.clipLock('/vault')).toMatch(/위키 초안 만들기/)
    endIngest()
  })

  it('holder 는 보관함을 쓰는 활동만 돌려준다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('lint', '/vault'))
    expect(a.holder('/vault')).toBeNull()
    end()
    const endIngest = endOf(a.begin('ingest', '/vault'))
    expect(a.holder('/vault')).toBe('ingest')
    endIngest()
  })

  it('다른 볼트는 서로 막지 않는다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('ingest', '/vault-a'))
    expect(a.clipLock('/vault-b')).toBeNull()
    end()
  })

  it('begin·end에서 onChange가 불린다', () => {
    const a = createVaultActivity()
    const seen: string[] = []
    a.onChange(() => seen.push('change'))
    const end = endOf(a.begin('ingest', '/vault'))
    end()
    expect(seen).toEqual(['change', 'change'])
  })

  it('end를 두 번 불러도 안전하다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('ingest', '/vault'))
    end()
    expect(() => end()).not.toThrow()
    expect(a.clipLock('/vault')).toBeNull()
  })
})

describe('동시 실행 규칙', () => {
  it('lint 는 한 번에 하나만 돈다 — 다른 보관함이어도 거절되고, 끝나면 허용된다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('lint', '/vault'))
    expect(a.begin('lint', '/vault')).toEqual({ busy: 'AI 점검이 진행 중이에요' })
    expect('busy' in a.begin('lint', '/other')).toBe(true)
    end()
    const lint2 = a.begin('lint', '/other')
    expect(typeof lint2).toBe('function')
    if (typeof lint2 === 'function') lint2()
  })

  it('chat은 위키화 중에도 허용되고 대화당 1개다', () => {
    const a = createVaultActivity()
    const endIngest = endOf(a.begin('ingest', '/vault'))
    const chat = a.begin('chat', 'conv-1')
    expect(typeof chat).toBe('function')
    expect('busy' in a.begin('chat', 'conv-1')).toBe(true)
    const other = a.begin('chat', 'conv-2')
    expect(typeof other).toBe('function')
    if (typeof other === 'function') other()
    if (typeof chat === 'function') chat()
    endIngest()
  })

  it('chat은 lint와 슬롯을 나누지 않는다', () => {
    const a = createVaultActivity()
    const end = endOf(a.begin('lint', '/vault'))
    const chat = a.begin('chat', 'conv-1')
    expect(typeof chat).toBe('function')
    if (typeof chat === 'function') chat()
    end()
  })
})
