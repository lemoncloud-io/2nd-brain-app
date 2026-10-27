import { describe, expect, it } from 'vitest'
import {
  GROWTH,
  globeLayout,
  globeRadius,
  growthPosition,
  overviewLinks,
  isLinkGrown,
  isNodeGrown,
  planGrowth,
  type GrowthNode,
  type Vec3
} from './graph-growth'

const node = (id: string, community = 0): GrowthNode => ({ id, community })
const pair = (a: string, b: string): string => [a, b].sort().join('|')

describe('planGrowth', () => {
  // a 가 가운데, b·c·d 가 a 에, e 가 b 에 붙고 z 는 아무 데도 안 붙었다
  const nodes = [node('a'), node('b'), node('c'), node('d'), node('e'), node('z')]
  const links = [
    { source: 'a', target: 'b' },
    { source: 'a', target: 'c' },
    { source: 'd', target: 'a' },
    { source: 'b', target: 'e' }
  ]

  it('가장 많이 이어진 점 하나에서 시작해 실제 연결로 첫 가지를 낸다', () => {
    const plan = planGrowth(nodes, links)
    expect(plan.records[0]).toMatchObject({ id: 'a', parent: null, born: 0 })
    expect(plan.records[1]).toMatchObject({ parent: 'a', born: 0.6 })
    expect(plan.records.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'z'])
  })

  it('가지는 그래프에 있는 선으로만 뻗는다', () => {
    const plan = planGrowth(nodes, links)
    const real = new Set(links.map((l) => pair(l.source, l.target)))
    for (const record of plan.records)
      if (record.parent !== null) expect(real.has(pair(record.parent, record.id))).toBe(true)
    expect(plan.tree.size).toBe(5 - 1 + 0) // 이어진 다섯 점 = 가지 넷
    for (const key of plan.tree) expect(real.has(key)).toBe(true)
  })

  it('부모는 자식보다 먼저 태어난다', () => {
    const plan = planGrowth(nodes, links)
    for (const record of plan.records) {
      if (record.parent === null) continue
      expect(plan.byId.get(record.parent)!.born).toBeLessThan(record.born)
    }
  })

  it('아무 데도 안 이어진 점은 부모·가지 없이 합류한다', () => {
    const plan = planGrowth(nodes, links)
    expect(plan.byId.get('z')).toMatchObject({ parent: null })
    expect([...plan.tree].some((key) => key.split('|').includes('z'))).toBe(false)
  })

  it('자기 고리·중복 선·계획 밖 점으로 가는 선은 가지가 되지 않는다', () => {
    const plan = planGrowth(
      [node('a'), node('b')],
      [
        { source: 'a', target: 'a' },
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
        { source: 'a', target: 'hidden' }
      ]
    )
    expect(plan.records.map((r) => r.id)).toEqual(['a', 'b'])
    expect([...plan.tree]).toEqual([pair('a', 'b')])
  })

  it('한 점에서 한 번에 세 가지까지만 뻗고 나머지는 다음 차례로 미룬다', () => {
    // p 는 h 의 가지 중 가장 많이 이어졌고 제 가지 p2 가 있다 — 제한이 없으면 h 의 다섯 가지가 먼저 다 뻗는다
    const leaves = ['p', 'q', 'r', 's', 't']
    const plan = planGrowth(
      [node('h'), node('p'), ...['q', 'r', 's', 't', 'p2'].map((id) => node(id))],
      [...leaves.map((id) => ({ source: 'h', target: id })), { source: 'p', target: 'p2' }]
    )
    const order = plan.records.map((r) => r.id)
    expect(order.slice(0, 4)).toEqual(['h', 'p', 'q', 'r'])
    expect(order.indexOf('p2')).toBeLessThan(order.indexOf('s'))
  })

  it('계획 밖 점으로 가는 선은 순위에도 안 센다 — 숨은 이웃만 많은 점이 첫 점이 되면 첫 연결이 없다', () => {
    // a 는 숨은 점 넷과 이어져 전체로는 가장 많이 이어졌고 이름순으로도 첫째지만, 계획 안에서는 외톨이다
    const plan = planGrowth(
      [node('a'), node('b'), node('c'), node('d')],
      [
        ...['h1', 'h2', 'h3', 'h4'].map((h) => ({ source: 'a', target: h })),
        { source: 'b', target: 'c' },
        { source: 'c', target: 'd' }
      ]
    )
    expect(plan.records[0].id).toBe('c')
    expect(plan.records[1]).toMatchObject({ parent: 'c', born: 0.6 })
  })

  it('아무 데도 안 이어진 점이 여럿이면 저마다 뿌리로 합류한다', () => {
    const plan = planGrowth(
      [node('a'), node('b'), node('y'), node('z')],
      [{ source: 'a', target: 'b' }]
    )
    for (const id of ['y', 'z']) expect(plan.byId.get(id)).toMatchObject({ parent: null })
    expect([...plan.tree]).toEqual([pair('a', 'b')])
  })

  it('점 0·1개에서도 계획이 선다', () => {
    expect(planGrowth([], []).records).toEqual([])
    expect(planGrowth([node('a')], []).records).toMatchObject([{ id: 'a', born: 0 }])
  })

  it('마지막 점은 연출 끝 전에 태어나고, 뒤로 갈수록 빨리 태어난다', () => {
    const many = Array.from({ length: 50 }, (_, i) => node(`n${String(i).padStart(2, '0')}`))
    const chain = many.slice(1).map((n, i) => ({ source: many[i].id, target: n.id }))
    const plan = planGrowth(many, chain)
    const born = plan.records.map((r) => r.born)
    expect(born.at(-1)).toBeCloseTo(GROWTH.lastBorn)
    expect(born.at(-1)!).toBeLessThan(GROWTH.duration)
    const early = born[5] - born[4]
    const late = born[49] - born[48]
    expect(late).toBeLessThan(early)
  })

  it('같은 입력이면 같은 순서다', () => {
    expect(planGrowth(nodes, links).records).toEqual(
      planGrowth([...nodes].reverse(), links).records
    )
  })
})

describe('isNodeGrown · isLinkGrown', () => {
  const plan = planGrowth(
    [node('a'), node('b'), node('c')],
    [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' }
    ]
  )
  const last = plan.records.at(-1)!

  it('태어나기 전 점은 안 보인다', () => {
    expect(isNodeGrown(plan, 'a', 0)).toBe(true)
    expect(isNodeGrown(plan, last.id, last.born - 0.01)).toBe(false)
    expect(isNodeGrown(plan, 'nope', 100)).toBe(false)
  })

  it('가지 선은 양끝이 태어나면 보이고, 가지 아닌 실제 선은 늦게 합류한다', () => {
    const [x, y] = plan.records
    expect(isLinkGrown(plan, x.id, y.id, y.born)).toBe(true)
    expect(isLinkGrown(plan, x.id, y.id, y.born - 0.01)).toBe(false)
    // 세 점 고리에서 가지는 둘 — 나머지 하나는 늦게
    const extra = [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a']
    ].find(([p, q]) => !plan.tree.has(pair(p, q)))!
    expect(isLinkGrown(plan, extra[0], extra[1], GROWTH.lateLinksAt - 0.01)).toBe(false)
    expect(isLinkGrown(plan, extra[0], extra[1], GROWTH.lateLinksAt)).toBe(true)
  })

  it('계획 밖 점에 닿은 선은 안 보인다', () => {
    expect(isLinkGrown(plan, 'a', 'hidden', 100)).toBe(false)
  })
})

describe('growthPosition', () => {
  const home = { x: 100, y: 0, z: 0 }
  const origin = { x: 0, y: 0, z: 0 }

  it('태어날 때는 부모 자리에서 시작한다', () => {
    const record = { id: 'b', parent: 'a', index: 1, born: 5 }
    expect(growthPosition(record, 5, origin, home)).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('첫 점은 스프링 없이 연출 60% 시점에 제자리에 선다', () => {
    const first = { id: 'a', parent: null, index: 0, born: 0 }
    const t = GROWTH.duration * 0.3
    const spread = 0.17 + 0.83 * (t / GROWTH.lastBorn)
    expect(growthPosition(first, t, origin, home).x).toBeCloseTo(100 * spread * 0.5)
  })

  it('다 자라면 퍼짐만큼 제 자리에 선다', () => {
    const record = { id: 'b', parent: 'a', index: 1, born: 1 }
    expect(growthPosition(record, GROWTH.lastBorn, origin, home).x).toBeCloseTo(100)
    expect(growthPosition(record, 4, origin, home).x).toBeLessThan(100)
  })
})

describe('overviewLinks', () => {
  const R = 100
  const at = new Map([
    ['a', { x: 0, y: 0, z: 100 }],
    ['b', { x: 0, y: 30, z: 100 }],
    ['c', { x: 0, y: 0, z: -100 }],
    ['d', { x: 100, y: 0, z: 0 }]
  ])

  it('구 위에서 가까운 쌍의 선은 남긴다', () => {
    const kept = overviewLinks(
      [
        { source: 'x', target: 'y' },
        { source: 'a', target: 'b' }
      ],
      at,
      R
    )
    expect(kept.has(pair('a', 'b'))).toBe(true)
  })

  it('먼 쌍의 선은 29개에 하나만 표본으로 남긴다', () => {
    const links = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? { source: 'a', target: 'c' } : { source: 'c', target: 'd' }
    )
    // 0번째(a–c)는 표본, 29번째(c–d)도 표본 — 나머지는 다 같은 두 쌍이라 둘만 남는다
    expect([...overviewLinks(links, at, R)].sort()).toEqual([pair('a', 'c'), pair('c', 'd')])
    const far = [
      { source: 'x', target: 'y' },
      { source: 'a', target: 'c' }
    ]
    expect(overviewLinks(far, at, R).has(pair('a', 'c'))).toBe(false)
  })

  it('낮 개요는 먼 선 표본을 버린다 — 가운데를 가로지르는 현이 노이즈라서', () => {
    const links = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? { source: 'a', target: 'c' } : { source: 'c', target: 'd' }
    )
    // 가까운 쌍(a–b)도 같이 있으면 그것만 남는다
    const kept = overviewLinks([...links, { source: 'a', target: 'b' }], at, R, false)
    expect([...kept].sort()).toEqual([pair('a', 'b')])
  })

  it('자리가 없는 점의 선은 버린다 — 없는 선을 만들지 않는다', () => {
    expect(overviewLinks([{ source: 'a', target: 'zz' }], at, R).size).toBe(0)
  })
})

describe('globeLayout', () => {
  // 구획 셋 — 큰 구획 하나(30)와 작은 둘(6·4). 묶음은 구획 안에서 셋으로 나뉜다
  const nodes = Array.from({ length: 40 }, (_, i) => ({
    ...node(`n${i}`, i % 3),
    sector: i < 30 ? 'big' : i < 36 ? 'mid' : 'small'
  }))
  // 경도(0~1 바퀴) — 원본처럼 sin 이 x, cos 가 z
  const turn = (id: string, at: Map<string, Vec3>): number => {
    const p = at.get(id)!
    const a = Math.atan2(p.x, p.z) / (Math.PI * 2)
    return a < 0 ? a + 1 : a
  }

  it('같은 입력이면 같은 좌표다 — 입력 순서와도 무관하다', () => {
    const a = globeLayout(nodes)
    const b = globeLayout([...nodes].reverse())
    for (const n of nodes) expect(b.get(n.id)).toEqual(a.get(n.id))
  })

  it('모든 점이 구 껍질(반지름 R~1.3R) 위에 놓인다', () => {
    const R = globeRadius(nodes.length)
    for (const p of globeLayout(nodes).values()) {
      const r = Math.hypot(p.x, p.y, p.z)
      expect(r).toBeGreaterThanOrEqual(R - 1e-6)
      expect(r).toBeLessThanOrEqual(R * 1.3 + 1e-6)
    }
  })

  it('구획마다 경도 한 구간 — 구획끼리 겹치지 않고, 큰 구획이 첫 구간', () => {
    const at = globeLayout(nodes)
    const span = (sector: string): [number, number] => {
      const ts = nodes.filter((n) => n.sector === sector).map((n) => turn(n.id, at))
      return [Math.min(...ts), Math.max(...ts)]
    }
    const [big, mid, small] = [span('big'), span('mid'), span('small')]
    expect(big[1]).toBeLessThan(1 / 3)
    expect(mid[0]).toBeGreaterThan(1 / 3)
    expect(mid[1]).toBeLessThan(2 / 3)
    expect(small[0]).toBeGreaterThan(2 / 3)
  })

  it('구획 안에서는 같은 묶음이 이웃한 위도에 모인다', () => {
    const at = globeLayout(nodes)
    const lat = (id: string): number => {
      const p = at.get(id)!
      return p.y / Math.hypot(p.x, p.y, p.z)
    }
    const bands = [0, 1, 2].map((c) => {
      const ys = nodes.filter((n) => n.sector === 'big' && n.community === c).map((n) => lat(n.id))
      return [Math.min(...ys), Math.max(...ys)]
    })
    expect(bands[0][0]).toBeGreaterThan(bands[1][1])
    expect(bands[1][0]).toBeGreaterThan(bands[2][1])
  })

  it('구획이 많으면 작은 구획을 마지막 구간에 모은다 — 구간이 가늘어지면 점이 기둥으로 선다', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...node(`m${i}`), sector: `s${i % 10}` }))
    const at = globeLayout(many)
    // 구간은 최대 6 — 크기가 같으면 이름순으로 앞 다섯이 제 구간, 나머지(s5~s9)는 마지막 구간을 나눠 쓴다
    for (const n of many) {
      const t = turn(n.id, at)
      if (n.sector === 's0') expect(t).toBeLessThan(1 / 6)
      if (Number(n.sector.slice(1)) >= 5) expect(t).toBeGreaterThan(5 / 6)
    }
  })

  it('점이 많을수록 구가 커진다', () => {
    expect(globeRadius(400)).toBeGreaterThan(globeRadius(40))
  })
})
