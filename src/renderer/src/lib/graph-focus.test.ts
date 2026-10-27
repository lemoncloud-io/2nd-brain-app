import { describe, expect, it } from 'vitest'
import {
  fitDistance,
  flyTo,
  focusLabels,
  isDimmed,
  isLinkKept,
  neighbourMap,
  sparkAt,
  sparkLinks
} from './graph-focus'

const links = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' }
]

describe('neighbourMap', () => {
  it('선 하나가 양쪽을 서로의 이웃으로 만든다', () => {
    const map = neighbourMap(links)
    expect([...(map.get('a') ?? [])]).toEqual(['b'])
    expect([...(map.get('b') ?? [])].sort()).toEqual(['a', 'c'])
  })

  it('아무 선도 없으면 이웃도 없다', () => {
    expect(neighbourMap([]).size).toBe(0)
  })
})

describe('isDimmed', () => {
  const map = neighbourMap(links)

  it('아무 데도 마음을 두지 않으면 아무도 안 죽는다', () => {
    expect(isDimmed('a', null, map)).toBe(false)
    expect(isDimmed('c', null, map)).toBe(false)
  })

  it('짚은 점과 그 이웃은 산다', () => {
    expect(isDimmed('b', 'b', map)).toBe(false)
    expect(isDimmed('a', 'b', map)).toBe(false)
    expect(isDimmed('c', 'b', map)).toBe(false)
  })

  it('이웃이 아니면 죽는다', () => {
    expect(isDimmed('c', 'a', map)).toBe(true)
  })

  // 아무 데도 안 이어진 점을 짚으면 그 점만 남는다
  it('이웃이 없는 점을 짚으면 나머지는 전부 죽는다', () => {
    expect(isDimmed('a', 'lonely', map)).toBe(true)
    expect(isDimmed('lonely', 'lonely', map)).toBe(false)
  })
})

describe('isLinkKept', () => {
  it('마음을 두지 않았으면 선은 다 남는다', () => {
    expect(isLinkKept('a', 'b', null)).toBe(true)
  })

  it('짚은 점에 닿은 선만 남는다', () => {
    expect(isLinkKept('a', 'b', 'a')).toBe(true)
    expect(isLinkKept('a', 'b', 'b')).toBe(true)
    expect(isLinkKept('a', 'b', 'c')).toBe(false)
  })
})

describe('focusLabels', () => {
  const star = neighbourMap(
    Array.from({ length: 12 }, (_, i) => ({ source: 'hub', target: `n${i}` }))
  )
  const degree = (id: string): number => (id === 'hub' ? 12 : Number(id.slice(1)))

  it('아무 데도 마음을 두지 않았으면 이름표를 더하지 않는다', () => {
    expect(focusLabels(null, star, degree).size).toBe(0)
  })

  it('고른 점과 그 이웃 전부 — 이어진 수 내림차순', () => {
    const labels = focusLabels('hub', star, degree)
    expect(labels.has('hub')).toBe(true)
    expect(labels.size).toBe(13)
    expect(labels.has('n11')).toBe(true)
    expect(labels.has('n2')).toBe(true)
  })
})

describe('sparkLinks', () => {
  it('고른 점에 닿은 선 중 보이는 것만, 24개까지', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ source: 'f', target: `x${i}` }))
    const kept = sparkLinks('f', [...many, { source: 'a', target: 'b' }], () => true)
    expect(kept).toHaveLength(24)
    expect(kept.every(([a]) => a === 'f')).toBe(true)
    expect(sparkLinks('f', many, (id) => id !== 'x0')).toHaveLength(24)
    expect(sparkLinks(null, many, () => true)).toEqual([])
  })
})

describe('sparkAt', () => {
  it('선 위를 고른 점에서 이웃 쪽으로 흐르고 한 바퀴 돌면 처음 자리', () => {
    const a = { x: 0, y: 0, z: 0 }
    const b = { x: 10, y: 0, z: 0 }
    expect(sparkAt(a, b, 0)).toEqual({ x: 0, y: 0, z: 0 })
    expect(sparkAt(a, b, 0.25).x).toBeCloseTo(2.5)
    expect(sparkAt(a, b, 1.25).x).toBeCloseTo(2.5)
  })
})

describe('fitDistance', () => {
  it('구가 클수록 멀리 — 맞춤 단추와 같은 거리다 — test: graph fit distance', () => {
    const near = fitDistance(100)
    const far = fitDistance(200)
    expect(far).toBeCloseTo(near * 2, 8)
    expect(near).toBeGreaterThan(100 * 1.3)
  })

  it('세로로 긴 칸에서는 더 멀리 — 가로로 긴 칸은 세로 화각이 정한다', () => {
    expect(fitDistance(100, 0.5)).toBeGreaterThan(fitDistance(100))
    expect(fitDistance(100, 2)).toBeCloseTo(fitDistance(100), 8)
  })
})

describe('flyTo', () => {
  const eye = { x: 0, y: 0, z: 500 }

  it('구 바깥쪽에서 그 점을 본다 — 이어진 수가 많을수록 멀리', () => {
    const near = flyTo({ x: 100, y: 0, z: 0 }, 2, 1, 400, eye)
    const far = flyTo({ x: 100, y: 0, z: 0 }, 2, 200, 400, eye)
    expect(near.lookAt).toEqual({ x: 100, y: 0, z: 0 })
    expect(near.position.x).toBeGreaterThan(100)
    expect(far.position.x).toBeGreaterThan(near.position.x)
  })

  it('원점 가까운 점은 지금 보는 방향에서 다가간다', () => {
    const at = flyTo({ x: 0, y: 0, z: 0 }, 2, 1, 400, eye)
    expect(at.position.z).toBeGreaterThan(0)
    expect(at.position.x).toBeCloseTo(0)
  })

  it('작은 구는 그만큼 가까이 — 거리는 구 반지름에 맞춘다', () => {
    const small = flyTo({ x: 40, y: 0, z: 0 }, 2, 1, 80, eye)
    const big = flyTo({ x: 400, y: 0, z: 0 }, 2, 1, 400, eye)
    expect(small.position.x - 40).toBeLessThan(big.position.x - 400)
  })

  it('작은 구에서도 점에 붙지 않는다 — 점 반지름의 30배 밖', () => {
    const at = flyTo({ x: 80, y: 0, z: 0 }, 4, 1, 80, eye)
    expect(at.position.x - 80).toBeGreaterThanOrEqual(120)
  })
})
