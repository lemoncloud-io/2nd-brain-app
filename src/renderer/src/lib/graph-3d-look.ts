// 3D 그래프의 생김새 — DeusData/codebase-memory-mcp 의 graph-ui 를 그대로 옮긴 값들이다.
// 색은 묶음이 아니라 이어진 수(degree)로 준다 — 그림이 말하는 것은 "무엇이 중심인가" 다.
// 묶음은 툴바의 고르기로 본다.
import type { WikiGraph, GraphNode } from '../../../shared/wiki/graph'
import { nodeLook } from './graph-node-look'
import { getT } from './i18n'

/**
 * 무대는 테마를 따른다. 밤 무대는 레퍼런스의 별빛 그림 방식 — 가산 합성한 선과 번짐이
 * 어두운 바탕 위에서만 읽힌다. 낮 무대는 그 방식을 그대로 쓸 수 없다: 흰 바탕에 빛을
 * 더하면 선이 바탕에 묻히고 번진 점은 종이에 번진 물감이 된다. 그래서 낮에는 번짐을 끄고
 * 선을 보통 합성으로 깔고 점 색을 잉크 쪽으로 당긴다 — 같은 자료의 낮 그림이다.
 * 점 색도 밤 색을 어둡게 한 것이 아니라 낮 전용 등급표(STELLAR_DAY)를 쓴다.
 * 낮 그림은 앱의 종이·잉크·Spark 로만 그린다(main.css `:root`) — 흰 종이 위에 잉크 농도로
 * 등급을 말하고, 가장 많이 이어진 점만 Spark 로 탄다. 무대에 제 색을 따로 주면 흰 화면
 * 한가운데에 색 판이 박힌다.
 */
export type Stage = 'dark' | 'light'

export type StageLook = {
  /** 눈에 보여야 할 바탕색 — 문서·스크린샷에서 말하는 그 색 */
  color: string
  /**
   * 캔버스에 실제로 줄 바탕색. 번짐 합성기를 거치면 sRGB 변환이 한 번 더 먹으므로
   * 밤 무대는 color 를 그대로 주면 회색으로 뜬다 — 그보다 조금 더 검은 값을 준다.
   * 합성기가 없는 낮 무대는 보이는 색과 같다.
   */
  canvas: string
  /** 번짐을 걸지 말지 */
  bloom: boolean
  /** 점 심을 밝기 문턱 위로 태울지 — 번짐이 없는 낮 무대는 등급표 색 그대로 칠한다 */
  glow: boolean
  /**
   * 선 색과 진하기 — 페이지가 직접 건 링크는 진하게, 출처·이웃이 겹쳐 추론한 연결은 흐리게.
   * 추론한 연결이 훨씬 많아(실제 보관함에서 선 대부분) 같은 진하기로 깔면 가운데가 덩어리가 된다
   */
  link: string
  linkAlpha: { direct: number; inferred: number }
  /** 이름표 글자색과 테두리 — 바탕과 반대쪽으로 */
  label: string
  labelStroke: string
  /** 거리 안개를 걸지 — 먼 점이 바탕색으로 옅어진다. 범위는 `fogRange` 가 카메라 거리로 매번 정한다 */
  fog: boolean
  /**
   * 바탕 가장자리 색 — 가운데(`color`)에서 이 색으로 둥글게 가라앉는다. 없으면 `canvas` 한 색이다.
   * 밤 무대는 번짐이 이 일을 하므로 두지 않는다
   */
  backdropEdge?: string
  /** 성장 연출에만 뜨는 중앙 로고·궤도 링 — `lib/graph-growth-scene` 이 그린다 */
  growth: GrowthLook
}

/**
 * 성장 연출 무대 색. 밤은 가운데 빛무리를 더해(가산 합성) 번짐과 함께 태운다. 낮은 흰 종이라 빛을
 * 더하면 묻힌다 — 잉크 로고를 깔고, 빛무리 대신 옅은 Spark 물든 자리를 둔다.
 * 중앙 로고는 BrandMark 규칙 그대로 — 세 조각은 글자색, 오른쪽 아래 하나만 primary.
 * 링은 두 무대 모두 무채색이다 — 링이 옆으로 누우면 곧은 선이 되는데, 색이 있으면 가장 진한
 * 그래프 선으로 읽힌다(없는 연결을 보이는 셈이다). 색은 링 위 구슬에만 둔다
 */
export type GrowthLook = {
  /** 빛무리를 가산 합성할지 — 낮 무대는 늘 거짓. 로고·링은 두 무대 모두 보통 합성이다 */
  additive: boolean
  /** 중앙 로고(사분원 네 조각 압출) — 세 조각 색과 오른쪽 아래 한 조각 색 */
  mark: string
  markSpark: string
  /** 두 궤도 링의 색과 진하기, 링 위를 도는 구슬 색 */
  rings: [string, string]
  ringAlpha: number
  bead: string
  /** 로고 둘레의 빛무리(밤) · 물든 자리(낮) */
  halo: string
  haloAlpha: number
}

export const STAGE: Record<Stage, StageLook> = {
  dark: {
    color: '#181b21',
    canvas: '#000001',
    bloom: true,
    glow: true,
    link: '#a85c26',
    linkAlpha: { direct: 0.25, inferred: 0.06 },
    label: '#ddd7ce',
    labelStroke: 'rgba(0,0,0,0.9)',
    fog: false,
    backdropEdge: '#0d0f12',
    // Spark 와 Paper — 앱의 빛 두 가지로만. 로고는 BrandMark 규칙(세 조각 글자색 + 우하단 primary)
    growth: {
      additive: true,
      mark: '#ddd7ce',
      markSpark: '#ff8b3d',
      rings: ['#f6efe2', '#ddd7ce'],
      ringAlpha: 0.14,
      bead: '#ffd5a3',
      halo: '#ff8b3d',
      haloAlpha: 0.32
    }
  },
  light: {
    color: '#ffffff',
    canvas: '#ffffff',
    bloom: false,
    glow: false,
    // 잉크를 옅게 탄 회색 — 보통 합성은 겹칠수록 선 색으로 수렴하므로, 잉크 그대로 깔면
    // 선이 몰린 가운데가 검은 덩어리가 된다. 옅은 색이면 아무리 겹쳐도 이 회색에서 멈춘다.
    // 점이 읽히게 낮 등급을 진하게 한 뒤라 선도 한 단 진하게 맞춘다
    link: '#7f8694',
    linkAlpha: { direct: 0.28, inferred: 0.08 },
    label: '#20242c',
    labelStroke: 'rgba(255,255,255,0.92)',
    fog: true,
    backdropEdge: '#f0f1f3',
    // 잉크 로고, 옅은 잉크 링과 primary-ink(밝은 면 위 Spark 글자색) 구슬, 옅은 Spark 물든 자리
    growth: {
      additive: false,
      mark: '#20242c',
      markSpark: '#f2671a',
      rings: ['#717886', '#9da3ae'],
      ringAlpha: 0.42,
      bead: '#b34b0f',
      halo: '#ff8b3d',
      haloAlpha: 0.14
    }
  }
}

/**
 * 거리 안개의 앞·뒤 경계 — 카메라에서 덩어리 중심까지 거리와 덩어리 반지름으로 매번 잰다.
 * 농도를 고정값으로 두면 안 된다: 안개는 카메라 거리로 지우는데, 전체 보기는 점이 많을수록
 * 카메라를 멀리 물리므로 수백 점 보관함에서는 점 전부가 바탕색이 됐다(DEBUG-09-13-00).
 * 앞면·가운데(엠블럼)는 온전하고 뒷면은 8할쯤 옅다 — 앞뒤가 같은 진하기면 껍질이 납작한
 * 원판처럼 보인다. 어느 점도 완전히 사라지지는 않는 비율이다. 반지름은 1 이상으로 —
 * 점 하나짜리 그래프에서 앞뒤 경계가 같으면 셰이더의 smoothstep 이 정의되지 않는다.
 */
export const fogRange = (distance: number, radius: number): { near: number; far: number } => {
  const r = Math.max(radius, 1)
  return { near: distance, far: distance + 1.25 * r }
}

/**
 * 빛 번짐 — UnrealBloomPass(strength, radius, threshold).
 * 레퍼런스 값은 1.45/0.6/0.3 이지만 그쪽은 노드가 2만 개라 점 하나가 화면에서 아주 작다.
 * 점이 많아질수록 번짐이 서로 겹쳐 흰 구름이 된다(수백 개 금고에서 실측) — 그래서 한 값이
 * 아니라 점 수로 고른다. 많을수록 세기를 낮추고 문턱을 올려 점의 심만 타게 한다.
 */
export type Bloom = { strength: number; radius: number; threshold: number }

export const bloomFor = (count: number): Bloom =>
  count <= 60
    ? { strength: 0.85, radius: 0.5, threshold: 0.55 }
    : count <= 300
      ? { strength: 0.38, radius: 0.35, threshold: 0.8 }
      : { strength: 0.22, radius: 0.3, threshold: 0.9 }

/** 화각 — 레퍼런스와 같다. 기본값보다 좁아 같은 거리에서 대상이 크게 잡힌다 */
export const CAMERA_FOV = 50

/** 시점 조작 — 레퍼런스(3d-brain app.js)와 같은 감속·속도, 손을 떼면 5초 뒤 저 혼자 돈다 */
export const CONTROLS = {
  dampingFactor: 0.08,
  rotateSpeed: 0.5,
  zoomSpeed: 1.5,
  minDistance: 10,
  maxDistance: 50000,
  autoRotateSpeed: 0.45,
  idleMs: 5000
}

/** 점을 깎는 면 수 — 점이 많아질수록 거칠게. 작은 점에 면을 많이 쓰면 그릴 것만 늘어난다 */
export const sphereDetail = (count: number): [number, number] =>
  count <= 800 ? [32, 24] : count <= 4000 ? [16, 12] : [10, 7]

/**
 * 호버했을 때 이웃이 아닌 것을 얼마나 남길지 — 0 이면 사라지고 1 이면 그대로다.
 * 점은 제 색을 이만큼만 남기고 바탕색에 섞고, 이름표는 이 값을 불투명도로 쓴다
 */
export const DIM_FACTOR = 0.12

/** 이름표는 큰 점부터 이만큼만 — 전부 띄우면 글자가 그래프를 덮는다. 빽빽할수록 적게 */
export const maxLabels = (count: number): number => (count <= 60 ? 60 : count <= 150 ? 30 : 16)

/**
 * 별 등급 색 — 이어진 수가 많을수록 희고 크게 빛난다. 불씨(짙은 Spark) → Spark → 금빛 →
 * 흰빛으로 달궈지는 한 색상의 띠다: 앱의 색은 Spark 하나라 푸른 별을 두면 무대만 딴 색이 된다.
 * 구간 문턱은 레퍼런스(codebase-memory-mcp `src/ui/layout3d.c` 의 `stellar_color`)에서 옮겼다 —
 * 인용으로 받은 표라 원본과 직접 대조하지는 못했다(미검증). 색은 우리 것이다.
 */
const STELLAR: { upTo: number; color: string }[] = [
  { upTo: 1, color: '#c2531a' },
  { upTo: 3, color: '#e06c24' },
  { upTo: 5, color: '#ff8b3d' },
  { upTo: 8, color: '#ffa55c' },
  { upTo: 12, color: '#ffbe7d' },
  { upTo: 18, color: '#ffd5a3' },
  { upTo: 25, color: '#ffe7c8' },
  { upTo: 35, color: '#f8efe2' },
  { upTo: 50, color: '#fff9f1' }
]
const WHITE_GIANT = '#ffffff'

/**
 * 낮 무대의 등급 색 — 밤 색을 어둡게 당기는 것으로는 안 된다. 밤 팔레트는 위로 갈수록
 * 흰색에 가까워지는데(흰 별이 가장 세다), 흰 종이에서는 그 위쪽 네 등급이 한 색으로 뭉친다.
 * 그래서 낮은 밝기 대신 하나의 웜톤 family로 등급을 말한다 — 형광펜에서 Spark를 거쳐
 * deep 오렌지까지 단조롭게 진해진다. 회색 덩이와 주황 덩이를 붙이면 중간에 탁한 띠가
 * 생긴다(2026-10-12) — 밤이 불씨에서 흰빛까지 한 색상인 것과 같은 이치다. 잉크 원색까지
 * 가면 큰 점이 검은 덩어리로 화면을 누른다 — 가장 짙은 칸도 한 단 옅은 먹색에서 멈춘다. 색상을
 * 등급마다 돌리면 점 색이 중심이 아니라 종류로 읽힌다. 구간 문턱은 밤과 같아 같은 그래프가
 * 같은 이야기를 한다.
 */
const STELLAR_DAY: { upTo: number; color: string }[] = [
  { upTo: 1, color: '#dbd5cc' },
  { upTo: 3, color: '#e9cba6' },
  { upTo: 5, color: '#f4bd8b' },
  { upTo: 8, color: '#ffab70' },
  { upTo: 12, color: '#FF9C5D' },
  { upTo: 18, color: '#FF8A3D' },
  { upTo: 25, color: '#F4792D' },
  { upTo: 35, color: '#E9691F' },
  { upTo: Infinity, color: '#DF590C' }
]
const DAY_GIANT = '#b93f06'

const table = (stage: Stage): { steps: { upTo: number; color: string }[]; giant: string } =>
  stage === 'light'
    ? { steps: STELLAR_DAY, giant: DAY_GIANT }
    : { steps: STELLAR, giant: WHITE_GIANT }

export const stellarColor = (degree: number, stage: Stage = 'dark'): string => {
  const { steps, giant } = table(stage)
  return steps.find((step) => degree <= step.upTo)?.color ?? giant
}

/**
 * 범례 — 색만으로는 무엇인지 알 수 없다. 구간을 손으로 옮겨 적으면 색표와 갈라지므로
 * 같은 표에서 뽑는다. 화면에는 이 색들을 순서대로 이은 띠와 양끝·중간 라벨로 보인다.
 * 열린 끝(Infinity) 표는 거멈토막이 없어 닿는 색만 둔다 — 닿지 않는 색을 띠에 두면 거짓말이다.
 */
export const stellarScale = (stage: Stage = 'dark'): string[] => {
  const { steps, giant } = table(stage)
  const colors = steps.map((step) => step.color)
  return Number.isFinite(steps[steps.length - 1]!.upTo) ? [...colors, giant] : colors
}

/** 띠 양끝·가운데에 적는 말 — 색만으로는 등급을 알 수 없어 구간 문턱을 숫자로 적는다 */
export const STELLAR_ENDS = {
  get least() {
    return getT().library.linksAtMost(STELLAR[0].upTo)
  },
  get mid() {
    return getT().library.linksAbout(STELLAR[Math.floor(STELLAR.length / 2)].upTo)
  },
  get most() {
    return getT().library.linksAtLeast(STELLAR[STELLAR.length - 1].upTo + 1)
  }
}

/**
 * 띠 오른쪽 끝 말 — 가장 많이 이어진 점이 상한(50)을 넘으면 실제 수를 적는다.
 * 상한 안에 있으면 기본 말 그대로라 작은 볼트의 말은 그대로다.
 */
export const stellarMost = (maxDegree: number): string =>
  maxDegree > 51 ? getT().library.links(maxDegree) : STELLAR_ENDS.most

/**
 * 점을 얼마나 더 밝게 태울지 — 붉은 기가 셀수록 더.
 * 번짐(bloom)은 밝기 문턱을 넘은 곳만 먹는다. 흰 점은 제 밝기로 이미 문턱을 넘지만
 * 불씨·Spark 색 점은 그대로면 못 넘어 저 혼자 안 빛난다 — 붉은 만큼 밀어 올린다.
 * (레퍼런스 density.ts nodeGlowBoost 의 red 항 0.9 — 우리 점은 화면에서 훨씬 크게 잡혀
 * 그 값이면 전부 타 버려 낮췄다)
 */
const GLOW = { base: 0.95, red: 0.5 }

export const glowBoost = (r: number, g: number, b: number): number =>
  GLOW.base + Math.max(0, r - Math.max(g, b)) * GLOW.red

/** 점마다 몇 개와 이어져 있나 — 별 등급과 크기가 이 수로 정해진다 */
export const degreeByKey = (graph: WikiGraph): Map<string, number> => {
  const degrees = new Map<string, number>()
  const bump = (key: string): void => {
    degrees.set(key, (degrees.get(key) ?? 0) + 1)
  }
  for (const edge of graph.edges) {
    bump(edge.source)
    bump(edge.target)
  }
  return degrees
}

/**
 * 3D 점의 반지름 — 종류가 기본 크기를 주고(nodeLook), 많이 이어진 점이 더 커진다.
 * 더해지는 양: 5개까지는 0, 그 위로는 이어진 수의 0.3배를 10 까지만 센다.
 * 5개→0, 6개→1.8 로 한 번 튀는 것까지 레퍼런스를 따랐다 — 다만 원본(`layout3d.c`)은
 * 인용으로 받은 것이고 이 기계에 소스가 없어 직접 대조하지 못했다(미검증).
 * 낮에는 거멈토막(50 초과)이 3할 더 커진다 — 진한 주황이 껍질에 고르게 흩어지면
 * 강조점이 없어 허브가 묻힌다. 밤은 손대지 않는다.
 */
export const node3DRadius = (node: GraphNode, degree: number, stage: Stage = 'dark'): number => {
  const boost = degree > 5 ? Math.min(degree * 0.3, 10) : 0
  // 레퍼런스는 자리 계산을 서버에서 해 점 사이가 훨씬 넓다 — 우리 배치의 점 간격에
  // 맞춘 비율이다. 더 키우면 점끼리 번짐이 겹쳐 덩어리로 보인다
  const radius = (nodeLook(node).size + boost) * 0.45
  return stage === 'light' && degree > 50 ? radius * 1.3 : radius
}
