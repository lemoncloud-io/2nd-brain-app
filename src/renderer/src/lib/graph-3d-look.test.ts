import { describe, expect, it } from 'vitest'
import type { GraphNode, WikiGraph } from '../../../shared/wiki/graph'
import {
  STAGE,
  STELLAR_ENDS,
  bloomFor,
  maxLabels,
  stellarMost,
  stellarScale,
  degreeByKey,
  glowBoost,
  node3DRadius,
  stellarColor,
  fogRange
} from './graph-3d-look'

describe('stellarColor', () => {
  // 구간 문턱은 레퍼런스 src/ui/layout3d.c stellar_color 에서, 색은 앱의 Spark 띠다
  it.each([
    [0, '#c2531a'],
    [1, '#c2531a'],
    [2, '#e06c24'],
    [3, '#e06c24'],
    [5, '#ff8b3d'],
    [8, '#ffa55c'],
    [12, '#ffbe7d'],
    [18, '#ffd5a3'],
    [25, '#ffe7c8'],
    [35, '#f8efe2'],
    [50, '#fff9f1'],
    [51, '#ffffff'],
    [4000, '#ffffff']
  ])('이어진 수 %i 은 %s', (degree, color) => {
    expect(stellarColor(degree)).toBe(color)
  })
})

describe('stellarScale', () => {
  const steps = [1, 3, 5, 8, 12, 18, 25, 35, 50, 51]

  // 범례가 색표와 갈라지면 화면이 거짓말을 한다 — 띠의 색이 실제 등급 색과 같은 줄에 서야 한다.
  // 열린 끝(Infinity) 표는 거멈토막이 없어 큰 수는 끝 색으로 읽는다
  it.each(['dark', 'light'] as const)('%s 무대의 띠가 등급 색 순서 그대로다', (stage) => {
    const degrees = stage === 'light' ? steps.slice(0, -1) : steps
    expect(stellarScale(stage)).toEqual(degrees.map((degree) => stellarColor(degree, stage)))
  })

  it('띠 양끝 라벨이 실제 구간의 끝과 같다', () => {
    expect(STELLAR_ENDS.least).toBe('1개 이하')
    expect(STELLAR_ENDS.most).toBe('51개 이상')
    const scale = stellarScale()
    expect(stellarColor(1)).toBe(scale[0])
    expect(stellarColor(51)).toBe(scale[scale.length - 1])
  })

  it('가장 많이 이어진 수가 상한을 넘으면 실제 수를 적는다 — test: stellar most', () => {
    expect(stellarMost(12)).toBe('51개 이상')
    expect(stellarMost(51)).toBe('51개 이상')
    expect(stellarMost(200)).toBe('200개')
  })

  it('두 무대가 같은 문턱을 쓴다 — 같은 그래프가 같은 등급으로 갈린다', () => {
    // 색만 다르고 어느 점이 어느 칸에 드는지는 같아야 한다. 끝 칸은 무대마다 열린/닫힘이
    // 달라 50까지만 견준다 — 그 위는 양쪽 다 끝 색이다
    const bucket = (stage: 'dark' | 'light'): number[] =>
      steps.slice(0, -1).map((degree) => stellarScale(stage).indexOf(stellarColor(degree, stage)))
    expect(bucket('light')).toEqual(bucket('dark'))
  })

  it('낮 팔레트는 흰 종이에서 뭉치지 않는다 — 닿는 등급이 모두 다른 색이다', () => {
    expect(new Set(stellarScale('light')).size).toBe(9)
  })
})

describe('glowBoost', () => {
  it('붉은 기가 셀수록 더 탄다', () => {
    expect(glowBoost(1, 0.4, 0.3)).toBeCloseTo(0.95 + 0.6 * 0.5, 5)
  })

  it('무채색과 푸른 색은 밑값만 받는다', () => {
    expect(glowBoost(0.7, 0.7, 0.7)).toBeCloseTo(0.95, 5)
    expect(glowBoost(0.5, 0.6, 1)).toBeCloseTo(0.95, 5)
  })

  it('가장 붉은 점도 타 버릴 만큼은 아니다', () => {
    // 가장 붉은 등급(불씨 #c2531a) 이 받는 값 — 2 를 넘기면 화면이 흰 구름이 된다
    expect(glowBoost(0.76, 0.33, 0.1)).toBeLessThan(2)
  })
})

describe('STAGE', () => {
  it('밤 무대만 번짐과 발광을 쓴다', () => {
    expect(STAGE.dark.bloom).toBe(true)
    expect(STAGE.dark.glow).toBe(true)
    expect(STAGE.light.bloom).toBe(false)
    expect(STAGE.light.glow).toBe(false)
  })

  it('낮 무대는 선을 더 진하게 깐다 — 가산 합성이 아니라 겹쳐도 안 밝아진다', () => {
    expect(STAGE.light.linkAlpha.direct).toBeGreaterThan(STAGE.dark.linkAlpha.direct)
    expect(STAGE.light.linkAlpha.inferred).toBeGreaterThan(STAGE.dark.linkAlpha.inferred)
  })

  it('번짐이 없는 낮 무대는 보이는 색과 캔버스 색이 같다', () => {
    expect(STAGE.light.canvas).toBe(STAGE.light.color)
    // 밤 무대는 합성기가 sRGB 를 한 번 더 먹이므로 다른 값을 준다
    expect(STAGE.dark.canvas).not.toBe(STAGE.dark.color)
  })

  it('성장 연출의 빛 번짐은 밤 무대만 더해 그린다 — 흰 바탕에 빛을 더하면 묻힌다', () => {
    expect(STAGE.dark.growth.additive).toBe(true)
    expect(STAGE.light.growth.additive).toBe(false)
  })

  it('낮 무대의 링은 밤보다 진하게 깐다 — 보통 합성은 겹쳐도 밝아지지 않는다', () => {
    expect(STAGE.light.growth.ringAlpha).toBeGreaterThan(STAGE.dark.growth.ringAlpha)
  })

  it('낮 무대의 로고·링은 바탕(흰 종이)과 다른 색이다', () => {
    const { mark, markSpark, rings, bead } = STAGE.light.growth
    for (const color of [mark, markSpark, ...rings, bead])
      expect(color.toLowerCase()).not.toBe('#ffffff')
  })

  it('중앙 로고는 세 조각과 우하단 한 조각의 색이 다르다 — BrandMark 규칙', () => {
    for (const stage of [STAGE.dark, STAGE.light])
      expect(stage.growth.mark.toLowerCase()).not.toBe(stage.growth.markSpark.toLowerCase())
  })
})

describe('fogRange', () => {
  it('앞면·가운데는 온전하고 뒷면은 8할쯤 옅다 — 껍질이 원판처럼 보이지 않는다', () => {
    // 카메라가 덩어리 반지름의 몇 배 뒤로 물러난 전체 보기 상황
    for (const [distance, radius] of [
      [300, 100],
      [1000, 300],
      [3000, 500]
    ]) {
      const { near, far } = fogRange(distance, radius)
      expect(near).toBe(distance)
      // 뒷면(distance + radius)은 near~far 의 8할 — 깊게 흐려지되 사라지지는 않는다
      expect((distance + radius - near) / (far - near)).toBeCloseTo(0.8)
    }
  })

  it('점 하나짜리 그래프(반지름 0)에서도 앞뒤 경계가 같지 않다', () => {
    const { near, far } = fogRange(500, 0)
    expect(far).toBeGreaterThan(near)
  })

  it('카메라가 덩어리 안에 있어도 앞 경계는 카메라 자리다 — 뒤에 있는 카메라는 그리지 않는다', () => {
    expect(fogRange(50, 200).near).toBe(50)
  })

  it('낮 무대만 안개를 쓴다 — 밤은 번짐이 깊이를 만든다', () => {
    expect(STAGE.light.fog).toBe(true)
    expect(STAGE.dark.fog).toBe(false)
  })
})

describe('bloomFor', () => {
  it('점이 많아질수록 세기가 낮아지고 문턱이 오른다', () => {
    const few = bloomFor(30)
    const some = bloomFor(200)
    const many = bloomFor(2000)
    expect(few.strength).toBeGreaterThan(some.strength)
    expect(some.strength).toBeGreaterThan(many.strength)
    expect(few.threshold).toBeLessThan(some.threshold)
    expect(some.threshold).toBeLessThan(many.threshold)
  })

  it('번짐 반경도 같이 좁아진다', () => {
    expect(bloomFor(30).radius).toBeGreaterThan(bloomFor(2000).radius)
  })
})

describe('maxLabels', () => {
  it('빽빽할수록 이름표를 적게 띄운다', () => {
    expect(maxLabels(2000)).toBeLessThan(maxLabels(30))
  })
})

const graph = (edges: [string, string][]): WikiGraph => ({
  nodes: [],
  edges: edges.map(([source, target]) => ({
    source,
    target,
    weight: 1,
    direct: 1,
    sourceOverlap: 0,
    adamicAdar: 0,
    typeAffinity: 0
  })),
  communities: []
})

describe('degreeByKey', () => {
  it('선 하나가 양쪽 점을 하나씩 올린다', () => {
    const degrees = degreeByKey(
      graph([
        ['a', 'b'],
        ['b', 'c'],
        ['b', 'd']
      ])
    )
    expect(degrees.get('b')).toBe(3)
    expect(degrees.get('a')).toBe(1)
    expect(degrees.get('d')).toBe(1)
  })

  it('아무 데도 안 이어진 점은 표에 없다', () => {
    expect(degreeByKey(graph([])).get('a')).toBeUndefined()
  })
})

describe('node3DRadius', () => {
  const page: GraphNode = { key: 'a', rel: 'a', label: 'A', ghost: false, community: 0 }

  it('적게 이어진 페이지는 종류 크기 그대로다', () => {
    // 페이지 기본 크기 7 → 반지름 3.15
    expect(node3DRadius(page, 5)).toBeCloseTo(3.15, 5)
  })

  it('많이 이어질수록 커진다', () => {
    expect(node3DRadius(page, 10)).toBeCloseTo((7 + 3) * 0.45, 5)
  })

  it('아무리 이어져도 더해지는 양은 10 에서 멈춘다', () => {
    expect(node3DRadius(page, 900)).toBeCloseTo((7 + 10) * 0.45, 5)
  })

  it('낮에는 거멈토막(50 초과)이 3할 더 커진다 — 허브가 묻히지 않게', () => {
    expect(node3DRadius(page, 900, 'light')).toBeCloseTo((7 + 10) * 0.45 * 1.3, 5)
    expect(node3DRadius(page, 10, 'light')).toBeCloseTo((7 + 3) * 0.45, 5)
  })
})
