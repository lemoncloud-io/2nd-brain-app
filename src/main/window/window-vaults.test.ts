// 창↔보관함 바인딩 — 창마다 자기 보관함을 본다. electron 없이 도는 순수 매핑이다.
import { describe, expect, it } from 'vitest'
import {
  VaultBindings,
  isVaultShown,
  orderedVaultDirs,
  resolveTargets,
  vaultTitle
} from './window-vaults'

describe('VaultBindings', () => {
  it('묶은 창은 자기 보관함을 돌려준다 — test: window-vaults.test.ts', () => {
    const bindings = new VaultBindings()
    bindings.bind(3, '/vaults/a')
    expect(bindings.dirFor(3)).toBe('/vaults/a')
  })

  it('묶지 않은 창은 null — 전역 폴백은 호출부가 한다', () => {
    const bindings = new VaultBindings()
    expect(bindings.dirFor(9)).toBeNull()
  })

  it('묶으면 덮어쓰고 풀면 잊는다', () => {
    const bindings = new VaultBindings()
    bindings.bind(3, '/vaults/a')
    bindings.bind(3, '/vaults/b')
    expect(bindings.dirFor(3)).toBe('/vaults/b')
    bindings.unbind(3)
    expect(bindings.dirFor(3)).toBeNull()
  })

  it('보관함을 연 창 id들을 돌려준다', () => {
    const bindings = new VaultBindings()
    bindings.bind(1, '/vaults/a')
    bindings.bind(2, '/vaults/b')
    bindings.bind(3, '/vaults/a')
    expect(bindings.idsFor('/vaults/a')).toEqual([1, 3])
    expect(bindings.idsFor('/vaults/nope')).toEqual([])
  })
})

describe('resolveTargets', () => {
  it('묶였어도 파괴된 창에는 보내지 않는다 — test: window-vaults.test.ts', () => {
    expect(
      resolveTargets(
        [1, 2],
        [
          { id: 1, destroyed: false },
          { id: 2, destroyed: true },
          { id: 3, destroyed: false }
        ]
      )
    ).toEqual([1])
  })
})

describe('isVaultShown', () => {
  it('열린 창·전역 설정 중 하나라도 맞으면 열린 보관함이다 — test: window-vaults vault scope', () => {
    expect(isVaultShown('/a', ['/a', '/b'], null)).toBe(true)
    expect(isVaultShown('/c', ['/a'], '/c')).toBe(true)
    expect(isVaultShown('/c', ['/a'], '/b')).toBe(false)
    expect(isVaultShown('/c', [], null)).toBe(false)
  })
})

describe('orderedVaultDirs', () => {
  it('앞 창·전역·나머지 순으로 중복 없이 — test: window-vaults vault scope', () => {
    expect(orderedVaultDirs('/b', '/a', ['/a', '/b', '/c'])).toEqual(['/b', '/a', '/c'])
    expect(orderedVaultDirs(null, null, [])).toEqual([])
  })
})

describe('vaultTitle', () => {
  it('폴더 이름만 보인다 — test: window-vaults.test.ts', () => {
    expect(vaultTitle(['/vaults/knowledge'], '/vaults/knowledge')).toBe('knowledge')
  })

  it('같은 이름이 두 개 열리면 부모를 덧붙인다', () => {
    const open = ['/docs/2nd-brain', '/dropbox/2nd-brain']
    expect(vaultTitle(open, '/docs/2nd-brain')).toBe('2nd-brain — docs')
    expect(vaultTitle(open, '/dropbox/2nd-brain')).toBe('2nd-brain — dropbox')
  })

  it('대소문자만 다른 이름도 충돌로 본다', () => {
    expect(vaultTitle(['/x/Knowledge', '/y/knowledge'], '/x/Knowledge')).toBe('Knowledge — x')
  })
})
