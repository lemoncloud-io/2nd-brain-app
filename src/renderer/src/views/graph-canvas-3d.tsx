// 3D 렌더러 — react-force-graph-3d(three.js). 자리는 힘으로 계산하지 않는다: 모든 점을 결정적 구면
// (lib/graph-growth globeLayout)에 고정하고, 가운데 오브·궤도 링을 늘 띄운다 — 성장 재생이 끝난 모습이 기본 화면이다.
// 생김새(무대 색·별 등급 색·번짐·선 합성·시점)는 lib/graph-3d-look 이 정본이다.
// 무거운 청크라 GraphView 가 lazy 로 불러온다 — 앱 첫 화면 묶음에 싣지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject
} from 'react-force-graph-3d'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LineBasicMaterial,
  Mesh,
  Fog,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  Points,
  PointsMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  type Line,
  type PerspectiveCamera
} from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { globeSector, nodeLook, openableRel } from '../lib/graph-node-look'
import { useStage } from '../lib/use-stage'
import { matchesFilter, type GraphFilter } from '../lib/graph-filter'
import {
  fitDistance,
  flyTo,
  focusLabels,
  isDimmed,
  isLinkKept,
  neighbourMap,
  SPARK_LINKS,
  sparkAt,
  sparkLinks
} from '../lib/graph-focus'
import {
  bloomFor,
  CAMERA_FOV,
  DIM_FACTOR,
  CONTROLS,
  fogRange,
  maxLabels,
  STAGE,
  type StageLook,
  degreeByKey,
  glowBoost,
  node3DRadius,
  sphereDetail,
  stellarColor
} from '../lib/graph-3d-look'
import {
  GROWTH,
  globeLayout,
  globeRadius,
  growthPosition,
  isLinkGrown,
  isNodeGrown,
  overviewLinks,
  pairKey,
  planGrowth,
  type GrowthPlan,
  type GrowthState,
  type Vec3
} from '../lib/graph-growth'
import { makeGrowthStage, type GrowthFrame } from '../lib/graph-growth-scene'
import type { GraphNode, WikiGraph } from '../../../shared/wiki/graph'
import { GraphLoading } from './graph-loading'
import { getT, useT } from '../lib/i18n'

/** 그래프 노드 + 3D 가 그릴 때 쓰는 값 */
type Node3D = GraphNode & { id: string; degree: number; radius: number; labelled: boolean }

/** 그린 것을 놓아줄 때 부를 것들 — three 는 스스로 GPU 자원을 놓지 않는다 */
type Disposable = { dispose: () => void }

/** 호버가 만질 손잡이 — 점의 재질과 원래 색, 그리고 있으면 이름표 재질 */
type LitNode = { material: MeshBasicMaterial; base: Color; label?: SpriteMaterial }
type Link3D = LinkObject<Node3D, { direct: boolean }>
/** 엔진이 자리를 물체에 옮기는 점 — 라이브러리는 그린 물체를 `__threeObj` 에 단다 */
type SimNode = NodeObject<Node3D> & { __threeObj?: Object3D }

/** 재생 한 번의 상태 — 매 프레임 바뀌므로 React state 가 아니라 ref 에 둔다 */
type Playback = {
  plan: GrowthPlan
  /** 태어날 때 부모가 있던 자리 — 가지가 거기서 뻗는다 */
  origins: Map<string, Vec3>
  /** 연출 중 카메라 거리 — 구가 다 들어오는 거리 */
  distance: number
  camera: { position: Vec3; target: Vec3; autoRotate: boolean }
  /** 계획에 든 점 객체 — 그래프가 바뀌면 재생을 버리므로 재생 동안 그대로다 */
  nodes: Map<string, SimNode>
  /** 재생 중 사용자가 시점을 만졌나 — 만졌으면 카메라를 더 끌고 다니지 않고, 끝나도 되돌리지 않는다 */
  manual: boolean
  started: number
  t: number
  frame: number
  lastReveal: number
  /** 끝 처리 중 — 엔진이 구면 자리를 물체에 한 번 더 옮기고 멎기를 기다린다 */
  ending: boolean
  /** 움직임 줄이기 설정이 아니면 — 꺼져 있으면 카메라·점이 움직이지 않고 점이 제자리에 나타나기만 한다 */
  motion: boolean
}

/**
 * 엔진 수명(three-forcegraph cooldownTicks·cooldownTime). 자리는 늘 구면에 고정이라 평소엔 0 — 첫 틱이 힘 계산 없이
 * 멎으며 고정 자리만 물체에 옮긴다(layoutTick). 재생 중에만 무한히 돌려 매 틱 움직인 자리를 옮긴다
 */
const ENGINE_IDLE = { ticks: 0, time: 15000 }

/** 선 끝의 점 id — 엔진이 돌기 시작하면 라이브러리가 id 문자열을 점 객체로 바꿔 끼운다 */
const endId = (end: Link3D['source']): string =>
  typeof end === 'object' && end !== null ? String(end.id) : String(end)

/** 고른 점에 닿은 선의 진하기 */
const FOCUS_LINK_ALPHA = 0.55

/**
 * 선 — 밤 무대는 가산 합성이라 겹친 만큼 밝아지고, 낮 무대는 보통 합성이다.
 * 흰 바탕에 빛을 더하면 선이 바탕에 묻혀 아무것도 안 보인다
 */
const linkMaterials = (
  look: StageLook
): { direct: LineBasicMaterial; inferred: LineBasicMaterial; focus: LineBasicMaterial } => {
  const make = (opacity: number): LineBasicMaterial =>
    new LineBasicMaterial({
      color: look.link,
      transparent: true,
      opacity,
      blending: look.bloom ? AdditiveBlending : NormalBlending,
      depthWrite: false,
      toneMapped: false
    })
  // 고른 점의 선 — 그 점의 색으로 진하게(원본 linkColor 0.48). 색은 고를 때 입힌다
  return {
    direct: make(look.linkAlpha.direct),
    inferred: make(look.linkAlpha.inferred),
    focus: make(FOCUS_LINK_ALPHA)
  }
}

/**
 * 낮 무대의 바탕 — 가운데가 밝은 둥근 빛. 화면에 붙는 그림이라 시점을 돌려도 따라 돌지 않는다.
 * 라이브러리의 backgroundColor 는 지우는 색(setClearColor)이라 scene.background 와 겹치지 않는다
 * (three-render-objects dist)
 */
const backdropTexture = (center: string, edge: string): CanvasTexture | null => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return null
  const glow = context.createRadialGradient(256, 256, 0, 256, 256, 362)
  glow.addColorStop(0, center)
  glow.addColorStop(1, edge)
  context.fillStyle = glow
  context.fillRect(0, 0, 512, 512)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * 점에 제 색이나 흐린 색을 입힌다. 흐린 점은 바탕색 쪽으로 물린다 — 검정 쪽으로 죽이면
 * 흰 종이에서는 흐린 점이 가장 진한 점이 된다
 */
const paint = (material: MeshBasicMaterial, base: Color, dim: boolean, paper: Color): void => {
  material.color.copy(base)
  if (dim) material.color.lerp(paper, 1 - DIM_FACTOR)
}

/**
 * 밤 무대의 별 — 레퍼런스(3d-brain makeStarfield)처럼 구 바깥에 900개를 둔다.
 * 낮 무대에서는 흰 바탕에 묻혀 안 보이므로 깔지 않는다.
 * 껍질은 맞춤 거리(`fit`)의 1.5배부터 둔다 — 카메라가 껍질 안에 서면 바로 옆의 별이
 * 크게 부풀어 자동 회전을 따라 화면을 가로질러 스쳐 간다
 */
const starfield = (radius: number, fit: number): Points | null => {
  const count = 900
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    const r = fit * 1.5 + Math.random() * radius * 4
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const material = new PointsMaterial({
    color: 0x9fb8ff,
    size: Math.max(1.2, radius * 0.004),
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    toneMapped: false
  })
  return new Points(geometry, material)
}

/** 툴바 버튼이 three 를 모른 채 카메라를 조작하고 성장 연출을 켜고 끈다 */
export type GraphCamera = {
  fit: () => void
  toggleGrowth: () => void
}

/** 숨긴 물체가 가는 층 — 카메라와 광선은 0 층만 본다 */
const HIDDEN_LAYER = 31

/**
 * 그린 물체를 켜고 끈다. `visible` 이 아니라 층을 옮긴다 — three 의 Raycaster 는 `visible` 을
 * 보지 않고 층만 봐서(three/src/core/Raycaster.js intersect), 안 보이는 점이 호버·클릭에 걸린다.
 * 층은 자식마다 따로 검사되므로 이름표까지 같이 옮긴다.
 * 라이브러리 물체는 렌더 밖에서 바뀌는 것이 정상이라 컴포넌트 밖에서 만진다
 */
const show = (object: Object3D, visible: boolean): void => {
  object.traverse((part) => part.layers.set(visible ? 0 : HIDDEN_LAYER))
}

/** 선에 재질을 입힌다 — show 와 같은 까닭으로 컴포넌트 밖에서 만진다 */
const wear = (object: Object3D, material: LineBasicMaterial): void => {
  const line = object as Line
  if (line.material !== material) line.material = material
}

/** 이름표 — 캔버스에 글자를 찍어 스프라이트로 세운다. 화면을 어떻게 돌려도 읽히는 쪽을 본다 */
const labelSprite = (text: string, look: StageLook, worldSize: number): Sprite | null => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null
  const font = '600 64px "Pretendard Variable", system-ui, sans-serif'
  context.font = font
  const width = Math.ceil(context.measureText(text).width) + 32
  canvas.width = width
  canvas.height = 96
  // 크기를 바꾸면 컨텍스트가 초기화된다 — 글꼴을 다시 건다
  context.font = font
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineWidth = 8
  context.strokeStyle = look.labelStroke
  context.strokeText(text, width / 2, 48)
  context.fillStyle = look.label
  context.fillText(text, width / 2, 48)

  const texture = new CanvasTexture(canvas)
  const sprite = new Sprite(
    new SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  )
  sprite.scale.set((worldSize * width) / 96, worldSize, 1)
  return sprite
}

/** 지금 시각의 소품 모습 — 오브는 늘, 링은 재생 중반부터 펼쳐져 끝나면 다 펼친 채로 남는다 */
const stageFrame = (p: Playback | null, spin: number, motion: boolean, eye: Vec3): GrowthFrame => ({
  t: spin,
  reveal: p ? (p.t - GROWTH.duration * 0.28) / (GROWTH.duration * 0.69) : 1,
  fade: 1,
  motion,
  eye
})

/** 움직임 줄이기 설정 — 켜져 있으면 소품이 돌지 않고 재생 중 카메라·점도 움직이지 않는다 */
const reducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * 재생 시각의 자막 — 원본 updateDemo 의 staged 타이틀을 연출 길이에 비례해 쓴다.
 * 끝까지 가면 전체가 선 모습을 말한다
 */
const demoTitle = (t: number, done: boolean): string => {
  const d = GROWTH.duration
  const title = getT().graph.demo
  if (done) return title.done
  if (t < d * 0.04) return title.seed
  if (t < d * 0.14) return title.link
  if (t < d * 0.41) return title.branch
  if (t < d * 0.76) return title.compound
  return title.shape
}

export const GraphCanvas3D = ({
  graph,
  filter,
  onCamera,
  onSelect,
  onGrowth,
  focusRel,
  onClear
}: {
  graph: WikiGraph
  filter: GraphFilter
  /** 카메라 조작을 위로 넘긴다 — 렌더러 인스턴스는 이 안에 갇혀 있고 툴바는 밖에 있다 */
  onCamera: (camera: GraphCamera | null) => void
  onSelect: (rel: string) => void
  /** 성장 연출 상태를 툴바에 알린다 */
  onGrowth: (state: GrowthState) => void
  /** 옆 칸에서 읽는 페이지 — 그 점을 고른 채로 날아간다. 없으면 고르기를 푼다 */
  focusRel: string | null
  /** 빈 곳을 눌러 고르기를 풀었다 — 옆 칸도 닫는다 */
  onClear: () => void
}): React.JSX.Element => {
  const t = useT()
  const stage = useStage()
  const look = STAGE[stage]
  // 흐린 점이 물러날 바탕색과 바탕 그림 — 무대가 바뀔 때만 다시 만든다(크기·호버와 무관하다)
  const paper = useMemo(() => new Color(look.color), [look])
  const backdrop = useMemo(
    () => (look.backdropEdge ? backdropTexture(look.color, look.backdropEdge) : null),
    [look]
  )
  useEffect(() => () => backdrop?.dispose(), [backdrop])
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<Node3D, { direct: boolean }> | undefined>(undefined)
  // ForceGraph3D 는 크기를 숫자로 받는다 — 탭은 숨긴 채(0×0) 마운트되므로 실제로 재서 넘긴다
  const [size, setSize] = useState({ width: 0, height: 0 })
  // 청크를 받은 뒤에도 크기를 재고 엔진이 첫 자리를 옮길 때까지는 빈 화면이다 — 그 사이를 메운다
  const [drawing, setDrawing] = useState(true)
  // 점마다 만든 지오메트리·재질·텍스처 — 어느 그래프로 그린 것인지를 열쇠로 모아 둔다.
  // 열쇠를 두는 이유: 라이브러리가 새 graphData 의 점을 언제 만드는지는 우리 정리 시점과
  // 순서가 보장되지 않는다. 열쇠가 있으면 순서와 무관하게 "지난 그래프 것만" 놓을 수 있다
  const drawn = useRef(new Map<object, Disposable[]>())
  // 점의 재질과 원래 색 — 호버로 흐리게 했다가 되돌리려면 손잡이가 있어야 한다.
  // drawn 과 같은 열쇠(그래프 정체성)로 묶는다 — 놓아 버린 재질을 계속 만지지 않으려면
  const lit = useRef(new Map<object, Map<string, LitNode>>())
  // 필터·호버는 매 프레임 읽힌다 — state 로 받으면 accessor 가 바뀌어 그린 것을 다시 만든다
  const filterRef = useRef(filter)
  const hovered = useRef<string | null>(null)
  // 고른(누른) 점 — 고른 점이 있으면 강조는 그 점이 쥐고, 호버는 이름만 띄운다(원본 selectNode)
  const selected = useRef<string | null>(null)
  // 고르거나 짚어서 더 단 이름표 — 큰 점 말고는 이름표가 없어서 그때그때 만들고 치운다
  const extraLabels = useRef(new Map<string, Sprite>())
  // 흐르는 점을 태울 선 [고른 점, 이웃] — 소품 루프가 매 프레임 읽는다
  const sparks = useRef<[string, string][]>([])
  // 성장 연출 — 재생 중일 때만 값이 있다
  const playback = useRef<Playback | null>(null)
  // 멈춰 둔 연출을 깨울 보였다 신호 해제권 — 연출마다 하나, 끝날 때 거둔다(쌓이지 않게)
  const playVisible = useRef<(() => void) | null>(null)
  // 끝난 뒤 카메라가 다 돌아온 자리를 탐침에 적을 타이머 — 그래프가 바뀌거나 떠나면 거둔다
  const settleProbe = useRef<number | undefined>(undefined)
  const [playing, setPlaying] = useState(false)
  // 자막 카드에 적을 재생 스냅샷 — 프레임 루프가 0.12초에 한 번만 갱신한다(원본 updateDemo 의 paint throttle)
  const [demo, setDemo] = useState<{
    born: number
    total: number
    t: number
    groups: number
  } | null>(null)
  // 평소엔 첫 틱에 멎고, 연출 중에는 끝까지 돈다 — 기본 수명(15초)이면 성장이 중간에 굳는다
  const [engine, setEngine] = useState(ENGINE_IDLE)

  const data = useMemo(() => {
    const degrees = degreeByKey(graph)
    const nodes: Node3D[] = graph.nodes.map((node) => {
      const degree = degrees.get(node.key) ?? 0
      return {
        ...node,
        id: node.key,
        degree,
        radius: node3DRadius(node, degree, stage),
        labelled: false
      }
    })
    // 이름표는 큰 점부터 — 전부 띄우면 글자가 그래프를 덮는다
    for (const node of [...nodes]
      .sort((a, b) => b.radius - a.radius)
      .slice(0, maxLabels(nodes.length)))
      node.labelled = true
    const keys = new Set(nodes.map((n) => n.id))
    const links = graph.edges
      .filter((edge) => keys.has(edge.source) && keys.has(edge.target))
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        direct: edge.direct === 1
      }))
    // 자리는 전부 구면에 고정 — 필터와 무관하게 모든 점으로 잡는다(필터는 숨기기만 하고 자리를 옮기지 않는다)
    const globe = globeLayout(
      nodes.map((n) => ({ id: n.id, community: n.community, sector: globeSector(n) }))
    )
    for (const node of nodes as SimNode[]) {
      const at = globe.get(node.id)!
      Object.assign(node, at, { fx: at.x, fy: at.y, fz: at.z })
    }
    const radius = globeRadius(nodes.length)
    // 개요에 그릴 선 — 다 그리면 구를 가로지르는 현이 엉킨다.
    // 낮에는 먼 선 표본까지 버린다 — 빈 가운데를 관통하는 긴 현이 노이즈라서(밤은 살린다)
    const quiet = overviewLinks(links, globe, radius, stage === 'dark')
    return { nodes, links, globe, radius, quiet }
  }, [graph, stage])

  // 그린 것을 어느 세대 것으로 묶을지 — 그래프가 바뀌어도, 무대가 밤낮을 바꿔도 다시 그린다
  const gen = useMemo(() => ({ data, look }), [data, look])

  // 필터·호버 때 그린 것을 제자리에서 켜고 끄려면 라이브러리가 자료에 단 물체를 손에 쥐어야 한다
  // (점은 `__threeObj`, 선은 `__lineObj`)
  const drawnData = useRef<{
    nodes: (Node3D & { __threeObj?: Object3D })[]
    links: (Link3D & { __lineObj?: Object3D })[]
    globe: Map<string, Vec3>
    radius: number
    quiet: Set<string>
  }>(data)
  // 새 그래프의 선은 라이브러리가 만든다 — 첫 틱에 필터·호버를 한 번 입힌다
  const revealed = useRef(false)
  useEffect(() => {
    drawnData.current = data
    revealed.current = false
  }, [data])

  /** 점마다 이웃 — 호버했을 때 누구를 남길지 */
  const neighbours = useMemo(() => neighbourMap(data.links), [data])
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n as SimNode])), [data])
  const materials = useMemo(() => linkMaterials(look), [look])
  /** 지금 마음을 둔 점 — 고른 점이 있으면 그것, 없으면 짚은 점 */
  const focusOf = useCallback((): string | null => selected.current ?? hovered.current, [])

  /** 이 점을 보일까 — 규칙은 lib/graph-filter */
  const shown = useCallback((node: Node3D): boolean => matchesFilter(node, filterRef.current), [])
  /** 연출 중이면 이미 태어난 점만 — 연출 밖이면 늘 참 */
  const grown = useCallback((id: string): boolean => {
    const p = playback.current
    return !p || isNodeGrown(p.plan, id, p.t)
  }, [])

  /**
   * 고르거나 짚은 점이 있으면 그 점과 이웃만 제 색, 나머지는 흐리게. 원본(applyNodeStyle)처럼 고른 점은 1.5배,
   * 이웃은 1.15배로 키우고, 고른 점의 이웃에는 전부 이름표를 단다
   */
  const relight = useCallback((): void => {
    const focus = focusOf()
    const labelled = focusLabels(focus, neighbours, (id) => byId.get(id)?.degree ?? 0)
    // 재생 중 점 크기는 연출이 쥔다
    const sizing = playback.current === null
    for (const [key, { material, base, label }] of lit.current.get(gen) ?? []) {
      const dim = isDimmed(key, focus, neighbours)
      paint(material, base, dim, paper)
      // 흐린 점의 이름표는 지운다 — 남으면 흐려진 점 위에 글자만 뜬다
      if (label) label.opacity = dim ? 0 : 1
      if (sizing)
        byId
          .get(key)
          ?.__threeObj?.scale.setScalar(
            key === selected.current ? 1.5 : focus !== null && !dim ? 1.15 : 1
          )
    }
    // 이름표가 없는 이웃에 이름표를 달고, 더 이상 아닌 점에서는 뗀다
    const extra = extraLabels.current
    for (const [id, sprite] of extra) {
      if (labelled.has(id)) continue
      sprite.removeFromParent()
      sprite.material.map?.dispose()
      sprite.material.dispose()
      extra.delete(id)
    }
    for (const id of labelled) {
      const node = byId.get(id)
      if (!node?.__threeObj || node.labelled || extra.has(id)) continue
      const sprite = labelSprite(node.label, look, Math.max(6, node.radius * 2))
      if (!sprite) continue
      sprite.position.set(0, node.radius + 4, 0)
      show(sprite, shown(node) && grown(id))
      node.__threeObj.add(sprite)
      extra.set(id, sprite)
    }
    // 고른 점의 선은 그 점의 색으로
    const lead = focus === null ? undefined : lit.current.get(gen)?.get(focus)
    if (lead) materials.focus.color.copy(lead.base)
    sparks.current = sparkLinks(
      focus,
      drawnData.current.links.map((l) => ({ source: endId(l.source), target: endId(l.target) })),
      (id) => {
        const node = byId.get(id)
        return node !== undefined && shown(node) && grown(id)
      }
    )
  }, [gen, paper, neighbours, byId, focusOf, look, materials, shown, grown])

  // 구면 자리가 화면에 오르면 한 번 전체를 맞추고 손을 뗀다 — 그 전에 사용자가 화면을 만지면 맞추지 않는다
  const framing = useRef(true)
  const lastFit = useRef(0)
  const stopFraming = useCallback((): void => {
    framing.current = false
  }, [])
  /**
   * 구 전체를 담는다 — 지금 보는 방향 그대로 맞춤 거리에서 원점을 본다. 자리는 결정적 구면이라 거리를
   * 셈으로 안다: 라이브러리 전체 보기(zoomToFit)는 그려진 물체의 세계 행렬로 상자를 재서, 행렬이 아직
   * 옛것이면 원점의 이름표만 재고 구 안으로 들어간다
   */
  const frameGlobe = useCallback((ms: number): void => {
    const instance = graphRef.current
    if (!instance) return
    const camera = instance.camera() as PerspectiveCamera
    const at = camera.position
      .clone()
      .setLength(fitDistance(drawnData.current.radius, camera.aspect))
    instance.cameraPosition({ x: at.x, y: at.y, z: at.z }, { x: 0, y: 0, z: 0 }, ms)
  }, [])
  const keepInFrame = useCallback(
    (throttleMs: number): void => {
      if (!framing.current) return
      const now = Date.now()
      if (now - lastFit.current < throttleMs) return
      lastFit.current = now
      frameGlobe(400)
    },
    [frameGlobe]
  )

  // 엔진이 멎었나, 멎은 뒤 다시 돈 적이 있나 — 필터가 자리를 다시 계산하지 않는다는 약속을
  // 밖에서 볼 수 있게 화면에 적는다(e2e/graph-3d.spec.ts 가 이 둘을 읽는다).
  // 그래프 자체가 바뀌면 자리를 다시 잡는 게 맞으므로 어느 그래프의 셈인지를 같이 들고,
  // 바뀌면 렌더 중에 처음으로 되돌린다(effect 로 미루면 한 프레임 동안 거짓을 적는다)
  const [layout, setLayout] = useState({ gen: data, settled: false, reheats: 0 })
  const stopped = useRef(false)
  if (layout.gen !== data) setLayout({ gen: data, settled: false, reheats: 0 })

  const detail = useMemo(() => sphereDetail(data.nodes.length), [data.nodes.length])

  // 그래프가 통째로 바뀌면(볼트 교체·페이지 추가) 새 배치를 다시 화면에 담는다
  useEffect(() => {
    framing.current = true
    lastFit.current = 0
    stopped.current = false
    // 고른 점은 옛 그래프의 것이다 — 옆 칸 페이지가 있으면 새 그래프에서 다시 고른다
    selected.current = null
    // 그래프가 바뀌거나 화면을 떠나면 재생을 버린다 — 계획은 옛 그래프의 것이다
    return () => {
      window.clearTimeout(settleProbe.current)
      const p = playback.current
      if (!p) return
      cancelAnimationFrame(p.frame)
      playback.current = null
      setEngine(ENGINE_IDLE)
      setPlaying(false)
      setDemo(null)
    }
  }, [data])

  // 이전 세대에 쓰던 GPU 자원을 놓는다 — 놓지 않으면 다시 그릴 때마다 텍스처가 쌓인다
  useEffect(() => {
    for (const [key, items] of drawn.current) {
      if (key === gen) continue
      for (const item of items) item.dispose()
      drawn.current.delete(key)
    }
    for (const key of lit.current.keys()) if (key !== gen) lit.current.delete(key)
    // 더 단 이름표는 옛 세대 점에 붙어 있다 — 떼고 새 점에 다시 단다
    for (const sprite of extraLabels.current.values()) {
      sprite.removeFromParent()
      sprite.material.map?.dispose()
      sprite.material.dispose()
    }
    extraLabels.current.clear()
    // 이미 만들어진 점이 있으면 흐림을 다시 입힌다 — 아직 없는 점은 태어날 때 제가 입는다
    relight()
  }, [gen, relight])

  // 탭을 숨기면 안쪽 ForceGraph 가 언마운트된다(size 0 조건) — 같은 세대 물건은 이때 놓는다.
  // 놓지 않으면 돌아올 때마다 같은 gen 배열에 쌓여 GPU 가 불어난다. 보이는 시점에서는
  // 새 물건이 이미 생겼을 수 있어 건드리지 않는다(보이는 쪽은 플래그만 되돌린다)
  useEffect(() => {
    if (size.width !== 0 || size.height !== 0) return
    const stale = drawn.current.get(gen)
    if (stale) {
      for (const item of stale) item.dispose()
      drawn.current.delete(gen)
    }
    lit.current.delete(gen)
    for (const sprite of extraLabels.current.values()) {
      sprite.removeFromParent()
      sprite.material.map?.dispose()
      sprite.material.dispose()
    }
    extraLabels.current.clear()
  }, [size.width, size.height, gen])

  // 숨겼다가 다시 보이면 ForceGraph 가 같은 data 로 새로 마운트된다 — 첫 틱에 개요 선만
  // 남기도록(reveal) 플래그를 되돌린다. 안 되돌리면 전체 선이 다 보여 "선이 많아져" 보인다
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return
    revealed.current = false
    stopped.current = false
  }, [size.width, size.height])

  // 화면을 떠나면 세대를 가리지 않고 전부 놓는다
  useEffect(() => {
    const all = drawn.current
    const handles = lit.current
    return () => {
      for (const [, items] of all) for (const item of items) item.dispose()
      all.clear()
      handles.clear()
    }
  }, [])

  useEffect(() => {
    const kept = materials
    return () => {
      kept.direct.dispose()
      kept.inferred.dispose()
      kept.focus.dispose()
    }
  }, [materials])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = (): void =>
      setSize({ width: container.clientWidth, height: container.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // 덩어리의 중심과 반지름 — 안개 범위를 카메라 거리로 잴 때 쓴다. 점이 움직이는 틱마다 다시 잰다
  const sphere = useRef({ x: 0, y: 0, z: 0, r: 0 })
  const measureSphere = useCallback((): void => {
    // 라이브러리가 graphData 의 점 객체에 x·y·z 를 직접 써 넣는다
    const nodes = data.nodes as NodeObject<Node3D>[]
    if (nodes.length === 0) return
    let x = 0
    let y = 0
    let z = 0
    for (const node of nodes) {
      x += node.x ?? 0
      y += node.y ?? 0
      z += node.z ?? 0
    }
    x /= nodes.length
    y /= nodes.length
    z /= nodes.length
    let r = 0
    for (const node of nodes) {
      r = Math.max(r, Math.hypot((node.x ?? 0) - x, (node.y ?? 0) - y, (node.z ?? 0) - z))
    }
    sphere.current = { x, y, z, r }
  }, [data])
  // 안개는 농도가 아니라 범위다 — 카메라가 움직일 때마다 덩어리 앞면·뒷면에 다시 맞춘다
  const updateFog = useCallback((): void => {
    const instance = graphRef.current
    const fog = instance?.scene().fog
    if (!instance || !(fog instanceof Fog)) return
    const { x, y, z } = instance.camera().position
    const s = sphere.current
    const range = fogRange(Math.hypot(x - s.x, y - s.y, z - s.z), s.r)
    fog.near = range.near
    fog.far = range.far
  }, [])
  // 가장 큰 점이 지금 화면 어디에 있나 — e2e 가 마우스를 그 점에 올려 호버를 재현한다
  // (e2e/graph-3d.spec.ts). 점은 몇 픽셀이라 화면을 훑어서는 맞히지 못한다
  const markProbe = useCallback((): void => {
    const instance = graphRef.current
    const container = containerRef.current
    const nodes = data.nodes as NodeObject<Node3D>[]
    if (!instance || !container || nodes.length === 0) return
    const big = nodes.reduce((a, b) => (b.radius > a.radius ? b : a))
    const at = instance.graph2ScreenCoords(big.x ?? 0, big.y ?? 0, big.z ?? 0)
    container.dataset['probe'] = `${Math.round(at.x)},${Math.round(at.y)}`
  }, [data])
  /** 시점이나 자리가 바뀌었다 — 안개 범위와 탐침 좌표를 다시 맞춘다 */
  const onView = useCallback((): void => {
    updateFog()
    markProbe()
  }, [updateFog, markProbe])
  // 번짐·화각·힘·조작감은 인스턴스가 생긴 뒤에만 걸 수 있다
  useEffect(() => {
    const instance = graphRef.current
    if (!instance || size.width === 0) return
    const composer = instance.postProcessingComposer()
    // 점이 많을수록 번짐이 서로 겹쳐 흰 구름이 된다 — 세기는 점 수가 정한다.
    // 낮 무대는 번짐을 아예 걸지 않는다 — 흰 바탕에 번진 점은 물감 자국이 된다
    const burn = bloomFor(data.nodes.length)
    const bloom = look.bloom
      ? new UnrealBloomPass(
          new Vector2(size.width, size.height),
          burn.strength,
          burn.radius,
          burn.threshold
        )
      : null
    if (bloom) composer.addPass(bloom)

    // 먼 점을 바탕색으로 지운다 — 앞뒤가 같은 진하기면 덩어리가 납작해 보인다.
    // 경계는 자리 표시다 — 카메라가 움직일 때마다 updateFog 가 덩어리에 다시 맞춘다
    const scene = instance.scene()
    scene.fog = look.fog ? new Fog(look.color, 0, 1) : null
    scene.background = backdrop
    measureSphere()
    onView()

    const camera = instance.camera() as { fov: number; updateProjectionMatrix: () => void }
    camera.fov = CAMERA_FOV
    camera.updateProjectionMatrix()

    // 자리는 구면에 고정이라 힘이 할 일이 없다 — 재생 중 매 틱 도는 n-body 계산을 아예 뺀다
    instance.d3Force('charge', null)
    instance.d3Force('center', null)
    instance.d3Force('link')?.['strength']?.(0)

    const controls = instance.controls() as {
      enableDamping: boolean
      dampingFactor: number
      rotateSpeed: number
      zoomSpeed: number
      minDistance: number
      maxDistance: number
      autoRotate: boolean
      autoRotateSpeed: number
      addEventListener: (type: 'change', listener: () => void) => void
      removeEventListener: (type: 'change', listener: () => void) => void
    }
    // 시점이 바뀌면(손·전체 보기·자동 회전 모두) 안개 범위를 새 거리에 맞춘다
    controls.addEventListener('change', onView)
    controls.enableDamping = true
    controls.dampingFactor = CONTROLS.dampingFactor
    controls.rotateSpeed = CONTROLS.rotateSpeed
    controls.zoomSpeed = CONTROLS.zoomSpeed
    controls.minDistance = CONTROLS.minDistance
    controls.maxDistance = CONTROLS.maxDistance
    controls.autoRotateSpeed = CONTROLS.autoRotateSpeed

    // 첫 화면부터 맞춤 화면이다 — 엔진이 멎은 뒤 맞추기만 믿으면 그 사이 어긋난 시점이 기본값으로 남는다
    const fit = fitDistance(data.radius, size.width / size.height)
    instance.cameraPosition({ x: 0, y: 0, z: fit }, { x: 0, y: 0, z: 0 }, 0)

    let idle: ReturnType<typeof setTimeout>
    const container = containerRef.current
    // 레퍼런스(3d-brain scheduleAutoRotate)처럼: 만지는 순간 멈추고, 손을 떼면 idleMs 뒤 저 혼자 돈다.
    // 고른 점이 있으면 돌지 않는다 — 시점이 그 점을 겨누고 있다
    const scheduleAutoRotate = (): void => {
      clearTimeout(idle)
      if (reducedMotion()) return
      idle = setTimeout(() => {
        if (selected.current === null && !playback.current) {
          const instance = graphRef.current
          if (instance) (instance.controls() as { autoRotate: boolean }).autoRotate = true
        }
      }, CONTROLS.idleMs)
    }
    // 사용자가 시점을 잡기 시작하면 자동 맞춤에서 손을 뗀다 — 맞춘 화면을 빼앗지 않는다
    const touched = (): void => {
      stopFraming()
      controls.autoRotate = false
      scheduleAutoRotate()
      // 성장 연출은 멈추지 않는다 — 카메라를 더 끌고 다니지 않을 뿐이다
      if (playback.current) playback.current.manual = true
    }
    // 첫 화면부터 지구처럼 돈다 — 움직임 줄이기 설정이거나 이미 고른 점이 있을 때만 멈춘 채로
    controls.autoRotate = !reducedMotion() && selected.current === null
    scheduleAutoRotate()
    container?.addEventListener('pointerdown', touched)
    container?.addEventListener('wheel', touched)

    // 밤 무대에만 별을 깐다 — 낮 무대 흰 바탕에서는 묻혀 안 보인다
    const stars = look.bloom ? starfield(data.radius, fit) : null
    if (stars) scene.add(stars)

    return () => {
      clearTimeout(idle)
      controls.removeEventListener('change', onView)
      container?.removeEventListener('pointerdown', touched)
      container?.removeEventListener('wheel', touched)
      if (stars) {
        stars.removeFromParent()
        stars.geometry.dispose()
        ;(stars.material as PointsMaterial).dispose()
      }
      if (bloom) {
        composer.removePass(bloom)
        bloom.dispose()
      }
      scene.fog = null
      scene.background = null
    }
  }, [size.width, size.height, stopFraming, data, look, backdrop, measureSphere, onView])

  // 화면을 떠나면 시뮬레이션·렌더 루프를 멈춘다 — 안 보이는 화면이 계속 돌면 안 된다
  useEffect(() => () => void graphRef.current?.pauseAnimation(), [])
  // 캔버스가 내려가면(오류 경계 포함) 툴바가 "재생 중" 에 남지 않게 한다 — 다시 뜨면 캔버스가 다시 알린다
  useEffect(() => () => onGrowth('unready'), [onGrowth])

  // accessor 가 매 렌더 새 함수면 라이브러리가 그린 것을 통째로 다시 만든다 — 정체성을 고정한다
  const remember = useCallback(
    (...items: Disposable[]): void => {
      const kept = drawn.current.get(gen) ?? []
      kept.push(...items)
      drawn.current.set(gen, kept)
    },
    [gen]
  )
  const nodeObject = useCallback(
    (node: Node3D): Object3D => {
      // 점을 몇 번 새로 만들었나 — 호버가 그린 것을 다시 만들지 않는다는 약속을 밖에서 본다
      // (e2e/graph-3d.spec.ts). 렌더를 거치지 않게 속성을 바로 적는다
      const container = containerRef.current
      if (container)
        container.dataset['builds'] = String(Number(container.dataset['builds'] ?? 0) + 1)
      // 색은 무대가 정한다 — 자료에 굳혀 두면 테마를 바꿀 때 그래프를 처음부터 다시 그린다
      const color = new Color(stellarColor(node.degree, stage))
      // 밤에는 문턱 위로 태운다(번짐이 그 위만 먹는다)
      if (look.glow) color.multiplyScalar(glowBoost(color.r, color.g, color.b))
      const geometry = new SphereGeometry(node.radius, detail[0], detail[1])
      const material = new MeshBasicMaterial({ color, toneMapped: false })
      remember(geometry, material)
      const litOfGraph = lit.current.get(gen) ?? new Map<string, LitNode>()
      const handle: LitNode = { material, base: color }
      litOfGraph.set(node.id, handle)
      lit.current.set(gen, litOfGraph)
      // 짚고 있는 점이 있는 채로 그래프가 바뀔 수 있다 — 태어나는 자리에서 바로 흐림을 입힌다.
      // 나중에 relight() 로 훑으면 라이브러리가 언제 점을 만드는지에 기대게 된다
      const dim = isDimmed(node.id, focusOf(), neighbours)
      paint(material, color, dim, paper)
      const mesh = new Mesh(geometry, material)
      // 태어날 때 필터를 입는다 — 무대가 바뀌어 다시 만들어진 점도 숨긴 채로 남는다.
      // 연출 중에 다시 만들어진 점도 아직 안 태어났으면 숨긴다
      const visible = shown(node) && grown(node.id)
      show(mesh, visible)
      if (!node.labelled) return mesh
      const sprite = labelSprite(node.label, look, Math.max(6, node.radius * 2))
      if (!sprite) return mesh
      handle.label = sprite.material
      if (dim) sprite.material.opacity = 0
      remember(sprite.material, sprite.material.map as CanvasTexture)
      sprite.position.set(0, node.radius + 4, 0)
      const group = new Object3D()
      group.add(mesh, sprite)
      show(group, visible)
      return group
    },
    [gen, look, paper, stage, detail, neighbours, remember, shown, grown, focusOf]
  )
  const nodeValue = useCallback((node: Node3D): number => node.radius ** 3, [])
  /**
   * 이미 그린 점·선을 필터와 호버에 맞춰 켜고 끈다. 필터·호버는 refresh() 를 부르지 않는다 —
   * refresh 는 점·선 물체를 전부 버리고 새로 만든다(three-forcegraph refresh → _flushObjects →
   * nodeDataMapper.clear). 점마다 구·재질·이름표 텍스처를 다시 만들어 화면이 멎었다
   */
  const reveal = useCallback((): void => {
    const { nodes, links, quiet } = drawnData.current
    const p = playback.current
    const visible = new Set<string>()
    for (const node of nodes) {
      const on = shown(node) && grown(node.id)
      if (on) visible.add(node.id)
      if (node.__threeObj) show(node.__threeObj, on)
    }
    const focus = focusOf()
    for (const link of links) {
      if (!link.__lineObj) continue
      const [a, b] = [endId(link.source), endId(link.target)]
      const key = pairKey(a, b)
      // 호버 중에는 그 점에 닿은 선을 전부(lib/graph-focus), 아니면 개요 선만. 연출 중에는 자라난 가지 선과,
      // 13초부터 개요 선(isLinkGrown 이 가지 아닌 선을 그때부터 들인다 — 원본 displayLink 와 같다)
      const plain = focus !== null ? isLinkKept(a, b, focus) : quiet.has(key)
      // 호버는 연출 중에도 이긴다 — 짚은 점의 선만 남긴다
      const grownLine = p ? isLinkGrown(p.plan, a, b, p.t) : true
      const on = grownLine && (p && focus === null ? p.plan.tree.has(key) || plain : plain)
      show(link.__lineObj, visible.has(a) && visible.has(b) && on)
      // 고른 점에 닿은 선은 그 점의 색으로 진하게, 나머지는 제 재질로
      wear(
        link.__lineObj,
        focus !== null && (a === focus || b === focus)
          ? materials.focus
          : link.direct
            ? materials.direct
            : materials.inferred
      )
    }
  }, [shown, grown, focusOf, materials])
  // 필터가 바뀌면 보일지 말지만 다시 묻는다 — 자료를 다시 먹이면 그래프를 처음부터 다시 그린다
  useEffect(() => {
    filterRef.current = filter
    reveal()
  }, [filter, reveal])

  const onHover = useCallback(
    (node: NodeObject<Node3D> | null): void => {
      const next = node ? node.id : null
      if (next === hovered.current) return
      hovered.current = next
      if (containerRef.current) containerRef.current.dataset['hovered'] = next ?? ''
      relight()
      reveal()
    },
    [relight, reveal]
  )
  /**
   * 점을 고른다(null 이면 푼다). 강조를 다시 입히고, fly 면 원본 flyTo 처럼 1.1초에 걸쳐 그 점 앞으로 날아간다
   * (움직임 줄이기면 바로). 재생 중에는 연출이 강조를 쥐고 있어 고르지 않는다
   */
  const select = useCallback(
    (id: string | null, fly: boolean): void => {
      if (playback.current) return
      if (id !== selected.current) {
        selected.current = id
        if (containerRef.current) containerRef.current.dataset['selected'] = id ?? ''
        relight()
        reveal()
      }
      const instance = graphRef.current
      // 고르기를 풀면 5초 뒤 다시 돈다(레퍼런스 scheduleAutoRotate) — 고른 채로는 겨눈 시점을 지킨다
      if (id === null) {
        if (instance && !reducedMotion()) {
          window.clearTimeout(settleProbe.current)
          settleProbe.current = window.setTimeout(() => {
            if (selected.current === null)
              (instance.controls() as { autoRotate: boolean }).autoRotate = true
          }, CONTROLS.idleMs)
        }
        return
      }
      const node = byId.get(id)
      if (!instance || !node || !fly) return
      stopFraming()
      ;(instance.controls() as { autoRotate: boolean }).autoRotate = false
      const motion = !reducedMotion()
      const to = flyTo(
        { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 },
        node.radius,
        node.degree,
        drawnData.current.radius,
        instance.camera().position
      )
      instance.cameraPosition(to.position, to.lookAt, motion ? 1100 : 0)
      // 다 날아간 뒤의 자리를 탐침에 적는다
      window.clearTimeout(settleProbe.current)
      settleProbe.current = window.setTimeout(() => onView(), motion ? 1150 : 0)
    },
    [relight, reveal, byId, stopFraming, onView]
  )
  // 옆 칸에서 읽는 페이지가 바뀌면 그 점을 고른다 — 옆 칸의 "이어진 페이지" 를 눌러도 그래프가 따라간다
  useEffect(() => {
    if (!layout.settled) return
    const node = focusRel === null ? undefined : data.nodes.find((n) => openableRel(n) === focusRel)
    const id = node?.id ?? null
    if (id !== selected.current) select(id, true)
  }, [focusRel, layout.settled, data, select])
  const nodeText = useCallback((node: Node3D): string => nodeLook(node).label, [])
  const linkMaterial = useCallback(
    (link: { direct: boolean }): LineBasicMaterial =>
      link.direct ? materials.direct : materials.inferred,
    [materials]
  )
  // 재생 중에만 돈다 — 매 틱 맞추면 카메라가 떨린다, 0.4초에 한 번만 따라간다
  const onTick = useCallback((): void => {
    keepInFrame(400)
    measureSphere()
    onView()
  }, [keepInFrame, measureSphere, onView])
  // 점 자리의 지문 — 시점과 무관하게 "점이 재생 전 자리(구면)에 그대로 있나" 를 밖에서 본다
  // (e2e/graph-growth.spec.ts). 화면 좌표(탐침)는 60초 뒤 자동 회전이 돌면 같은 자리여도 바뀐다
  const markLayout = useCallback((): void => {
    const container = containerRef.current
    if (!container) return
    let sum = 0
    for (const node of drawnData.current.nodes as SimNode[])
      sum += (node.x ?? 0) + 3 * (node.y ?? 0) + 7 * (node.z ?? 0)
    container.dataset['layout'] = sum.toFixed(3)
  }, [])
  const onStop = useCallback((): void => {
    setDrawing((was) => (was ? false : was))
    // 성장 연출의 끝 — 엔진이 구면 자리를 물체에 다 옮기고 멎었다
    const p = playback.current
    if (p?.ending) {
      playback.current = null
      setPlaying(false)
      setDemo(null)
      if (containerRef.current) containerRef.current.dataset['growthBorn'] = '0'
      markLayout()
      reveal()
      // 카메라는 600ms 에 걸쳐 돌아온다(움직임 줄이기면 바로) — 다 온 뒤의 자리를 탐침에 적는다
      settleProbe.current = window.setTimeout(() => onView(), p.motion ? 700 : 0)
      return
    }
    // 평소 엔진은 첫 틱에 멎는다 — 멎은 뒤 또 멎었으면 누군가 엔진을 다시 돌렸다는 뜻이다
    if (stopped.current) setLayout((was) => ({ ...was, reheats: was.reheats + 1 }))
    if (!revealed.current) {
      revealed.current = true
      reveal()
    }
    measureSphere()
    stopped.current = true
    markLayout()
    keepInFrame(0)
    stopFraming()
    // 엔진은 멎은 "뒤에" 자리를 물체에 옮긴다(layoutTick) — 탐침은 옮긴 자리로 적어야 하니 한 프레임 뒤에
    requestAnimationFrame(() => {
      onView()
      // 전체 보기는 400ms 에 걸쳐 다가간다 — 다 온 뒤의 자리를 탐침에 다시 적는다
      window.clearTimeout(settleProbe.current)
      settleProbe.current = window.setTimeout(() => onView(), 450)
    })
    setLayout((was) => ({ ...was, settled: true }))
  }, [keepInFrame, stopFraming, reveal, onView, markLayout, measureSphere])
  /**
   * 성장 연출을 끝낸다(끝까지 갔거나 멈췄다). 계획에 든 점을 구면 제자리에 고정한 채 엔진 수명을 0 으로 —
   * 다음 프레임에 엔진이 힘을 쓰지 않고 멎으며(three-forcegraph layoutTick) 자리를 물체에 옮긴다
   */
  const finish = useCallback((): void => {
    const p = playback.current
    if (!p || p.ending) return
    cancelAnimationFrame(p.frame)
    playVisible.current?.()
    playVisible.current = null
    p.ending = true
    const { globe } = drawnData.current
    for (const node of drawnData.current.nodes as SimNode[]) {
      node.__threeObj?.scale.setScalar(1)
      const at = globe.get(node.id)
      if (at) Object.assign(node, at, { fx: at.x, fy: at.y, fz: at.z, vx: 0, vy: 0, vz: 0 })
    }
    setEngine(ENGINE_IDLE)
    const instance = graphRef.current
    if (!instance) return
    const controls = instance.controls() as { autoRotate: boolean; autoRotateSpeed: number }
    controls.autoRotate = p.camera.autoRotate
    // 연출 중에는 천천히 돌렸다 — 평소 속도로 되돌린다(원본 stopDemo)
    controls.autoRotateSpeed = CONTROLS.autoRotateSpeed
    // 재생 중 시점을 만졌으면 그 시점을 존중한다 — 안 만졌으면 재생 전 시점으로
    if (!p.manual) instance.cameraPosition(p.camera.position, p.camera.target, p.motion ? 600 : 0)
  }, [])

  /**
   * 성장 연출을 처음부터 — 지금 보이는 점만 실제 선을 따라 하나에서 전체로 자라 제 구면 자리에 선다.
   * 첫 자리가 화면에 오른 뒤에만(엔진이 한 번 멎은 뒤)
   */
  const start = useCallback((): void => {
    const instance = graphRef.current
    if (!instance || playback.current || !stopped.current) return
    const { nodes: all, links, globe, radius } = drawnData.current
    const nodes = all as SimNode[]
    const planned = nodes.filter(shown)
    if (planned.length === 0) return
    // 연출이 강조를 쥔다 — 고른 점을 풀고 키운 점을 제 크기로
    select(null, false)
    for (const node of nodes) node.__threeObj?.scale.setScalar(1)
    const plan = planGrowth(
      planned.map((n) => ({ id: n.id, community: n.community })),
      links.map((l) => ({ source: endId(l.source), target: endId(l.target) }))
    )
    // 계획에 든 점은 원점에서 태어난다. 계획 밖(필터로 숨은) 점은 숨긴 채 제 구면 자리에 남는다
    for (const node of planned)
      Object.assign(node, { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, vx: 0, vy: 0, vz: 0 })
    const controls = instance.controls() as {
      target: Vec3
      autoRotate: boolean
      autoRotateSpeed: number
    }
    const eye = instance.camera().position
    // 구가 화면에 다 들어오는 거리 — 마운트 첫 화면과 같은 식이다
    const distance = fitDistance(radius, (instance.camera() as PerspectiveCamera).aspect)
    const p: Playback = {
      plan,
      origins: new Map(),
      nodes: new Map(planned.map((n) => [n.id, n])),
      distance,
      camera: {
        position: { x: eye.x, y: eye.y, z: eye.z },
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
        autoRotate: controls.autoRotate
      },
      manual: false,
      started: performance.now(),
      t: 0,
      frame: 0,
      lastReveal: 0,
      ending: false,
      motion: !reducedMotion()
    }
    playback.current = p

    // 구는 원점 둘레에 선다 — 지금 보는 방향 그대로 원점을 본다
    const dir = {
      x: eye.x - controls.target.x,
      y: eye.y - controls.target.y,
      z: eye.z - controls.target.z
    }
    const length = Math.hypot(dir.x, dir.y, dir.z) || 1
    // 움직임 줄이기면 처음부터 다 들어오는 거리에 두고 다가가지 않는다
    const near = p.motion ? distance * 0.56 : distance
    instance.cameraPosition(
      { x: (dir.x / length) * near, y: (dir.y / length) * near, z: (dir.z / length) * near },
      { x: 0, y: 0, z: 0 },
      0
    )
    controls.autoRotate = p.motion
    // 연출 중에는 평소보다 천천히 돈다 — 자막을 읽는 속도(원본 toggleDemo 의 .18)
    controls.autoRotateSpeed = 0.18
    // 고정한 점을 엔진이 매 틱 물체에 옮겨야 화면이 따라온다 — 연출 동안 엔진을 멈추지 않는다
    setEngine({ ticks: Infinity, time: Infinity })
    instance.d3ReheatSimulation()
    setPlaying(true)
    setDemo({ born: 0, total: plan.records.length, t: 0, groups: 0 })
    reveal()

    // 시계는 벽시계다 — 드래그·휠·클릭이 프레임을 늦춰도 성장은 제 시각에 있다
    // 세워 둔 채로 안 보이면 멈춘다 — 벽시계라 따라잡을 일이 없어 60Hz 빈손 장난을 치지 않는다.
    // parked 는 클로저 표시다 — 보였다는 신호가 오면 같은 자리에서 이어간다
    let parked = false
    const frame = (now: number): void => {
      if (playback.current !== p || p.ending) return
      // 안 보이는 화면에서는 손을 놓고 다음 프레임에 다시 본다 — 시각은 벽시계라 따라잡는다
      if (document.hidden) {
        parked = true
        p.frame = 0
        return
      }
      parked = false
      const t = Math.min(GROWTH.duration, (now - p.started) / 1000)
      p.t = t
      let born = 0
      // 기록은 태어난 차례라 시각도 오름차순이다 — 아직 안 태어난 첫 점에서 멈춘다
      for (const record of plan.records) {
        if (record.born > t) break
        born += 1
        const node = p.nodes.get(record.id)
        const home = globe.get(record.id)
        if (!node || !home) continue
        let origin = p.origins.get(record.id)
        if (!origin) {
          const parent = record.parent ? p.nodes.get(record.parent) : undefined
          origin = { x: parent?.fx ?? 0, y: parent?.fy ?? 0, z: parent?.fz ?? 0 }
          p.origins.set(record.id, origin)
        }
        const at = p.motion ? growthPosition(record, t, origin, home) : home
        node.x = node.fx = at.x
        node.y = node.fy = at.y
        node.z = node.fz = at.z
        const appear = p.motion ? Math.min(1, Math.max(0.05, (t - record.born) / 0.6)) : 1
        node.__threeObj?.scale.setScalar(0.3 + 0.7 * appear)
      }
      if (!p.manual && p.motion)
        instance
          .camera()
          .position.setLength(distance * (0.56 + 0.44 * Math.min(1, t / GROWTH.lastBorn)))
      // 보일지 말지는 매 프레임 다시 묻지 않는다 — 점·선 전부를 훑는 일이라 0.12초에 한 번.
      // 자막 카드도 같은 박자로 갱신한다(원본 updateDemo 의 growthLastPaint)
      if (now - p.lastReveal > 120 || t >= GROWTH.duration) {
        p.lastReveal = now
        reveal()
        if (containerRef.current) containerRef.current.dataset['growthBorn'] = String(born)
        const groups = new Set<number>()
        for (const record of plan.records) {
          if (record.born > t) break
          const group = p.nodes.get(record.id)?.community
          if (group !== undefined) groups.add(group)
        }
        setDemo({ born, total: plan.records.length, t, groups: groups.size })
      }
      if (t >= GROWTH.duration) finish()
      else p.frame = requestAnimationFrame(frame)
    }
    p.frame = requestAnimationFrame(frame)
    // 멈춰 둔 연출은 보였다는 신호에 이어간다 — 끝났거나 갈아엎힌 연출에는 손대지 않는다.
    // start 는 효과를 안 거쳐서 해제권을 ref 에 둔다 — finish 가 거둔다
    playVisible.current?.()
    const onVisible = (): void => {
      if (document.hidden || !parked || playback.current !== p || p.ending) return
      parked = false
      p.frame = requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', onVisible)
    playVisible.current = () => document.removeEventListener('visibilitychange', onVisible)
  }, [shown, reveal, finish, select])

  // 가운데 오브·궤도 링 — 늘 장면에 있다. 무대(밤낮)나 그래프(구 크기)가 바뀌면 새로 세운다.
  // 매 프레임 돌리고, 재생 중이면 링을 그 시각만큼 펼친다. 움직임 줄이기면 돌지 않는다
  // 소품 회전의 기준 시각 — 크기가 바뀌어 소품을 다시 세워도 회전이 0 으로 튀지 않는다
  const spinFrom = useRef<number | null>(null)
  useEffect(() => {
    const instance = graphRef.current
    if (!instance || size.width === 0 || size.height === 0) return
    const stage = makeGrowthStage(look.growth, data.radius)
    instance.scene().add(stage.group)
    // 고른 점의 선을 따라 흐르는 점(원본 linkDirectionalParticles 2개씩). 라이브러리 입자는 켤 때마다
    // 엔진을 다시 돌리므로(three-forcegraph update → engineRunning) 따로 그린다
    const sparkSpots = new Float32Array(SPARK_LINKS * 2 * 3)
    const sparkShape = new BufferGeometry()
    sparkShape.setAttribute('position', new BufferAttribute(sparkSpots, 3))
    sparkShape.setDrawRange(0, 0)
    const sparkPaint = new PointsMaterial({
      color: look.label,
      size: Math.max(2.5, (4 * data.radius) / 400),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: look.bloom ? AdditiveBlending : NormalBlending,
      toneMapped: false
    })
    const sparkCloud = new Points(sparkShape, sparkPaint)
    sparkCloud.frustumCulled = false
    instance.scene().add(sparkCloud)
    // 소품이 장면에 있다는 표시 — e2e 가 기본 화면에 오브·링이 떠 있는지 읽는다
    const container = containerRef.current
    if (container) container.dataset['stage'] = '1'
    spinFrom.current ??= performance.now()
    const from = spinFrom.current
    let frame = 0
    const tick = (now: number): void => {
      // 안 보이는 화면의 소품·불씨는 세우지 않는다 — 다음 프레임에 다시 본다
      if (document.hidden) {
        frame = requestAnimationFrame(tick)
        return
      }
      // 설정은 화면이 떠 있는 동안에도 바뀔 수 있다 — 매 프레임 다시 본다
      const motion = !reducedMotion()
      const spin = motion ? (now - from) / 1000 : 0
      stage.update(stageFrame(playback.current, spin, motion, instance.camera().position))
      // 흐르는 점 — 선 길이의 0.36 을 1초에(원본 0.006/프레임). 움직임 줄이기면 띄우지 않는다
      let count = 0
      if (motion)
        sparks.current.forEach(([a, b], k) => {
          const from = data.globe.get(a)
          const to = data.globe.get(b)
          if (!from || !to) return
          for (const half of [0, 0.5]) {
            const at = sparkAt(from, to, spin * 0.36 + half + k * 0.137)
            sparkSpots.set([at.x, at.y, at.z], count * 3)
            count += 1
          }
        })
      sparkShape.setDrawRange(0, count)
      sparkShape.attributes['position']!.needsUpdate = true
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      stage.dispose()
      sparkCloud.removeFromParent()
      sparkShape.dispose()
      sparkPaint.dispose()
      if (container) delete container.dataset['stage']
    }
  }, [look, data, size.width, size.height])

  useEffect(() => {
    const instance = graphRef.current
    if (!instance) {
      // 인스턴스가 없으면 툴바가 쥔 카메라는 죽은 것이다 — 손에서 놓게 한다
      onCamera(null)
      return
    }
    onCamera({
      fit: () => frameGlobe(200),
      // 재생 중이면 멈추고, 아니면 처음부터
      toggleGrowth: () => (playback.current ? finish() : start())
    })
    return () => onCamera(null)
  }, [onCamera, size.width, size.height, finish, start, frameGlobe])

  const growthState: GrowthState = playing ? 'playing' : layout.settled ? 'idle' : 'unready'
  useEffect(() => onGrowth(growthState), [onGrowth, growthState])

  // 점을 누르면 고르고 날아간 뒤 옆 칸에서 그 페이지를 연다(페이지가 없는 이름만 있는 점은 고르기만)
  const onClick = useCallback(
    (node: NodeObject<Node3D>): void => {
      select(String(node.id), true)
      const rel = openableRel(node)
      if (rel) onSelect(rel)
    },
    [onSelect, select]
  )
  // 빈 곳을 누르면 고르기를 풀고 옆 칸도 닫는다
  const onBackground = useCallback((): void => {
    if (selected.current === null) return
    select(null, false)
    onClear()
  }, [select, onClear])

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1"
      role="img"
      aria-label={t.graph.canvas}
      data-testid="graph-canvas"
      data-node-count={data.nodes.length}
      data-settled={layout.settled ? '1' : '0'}
      data-reheats={layout.reheats}
      data-growth={growthState}
      style={{ backgroundColor: look.color }}
    >
      {drawing && <GraphLoading />}
      {/* 성장 재생 자막 — 재생 중에만 오른쪽 아래에 뜬다 */}
      {demo !== null && (
        <div
          data-testid="graph-demo-caption"
          className="absolute right-4 bottom-4 z-10 w-72 rounded-xl border border-hairline bg-elevated/95 px-5 py-4 shadow-raised backdrop-blur-md"
        >
          <p className="text-caption font-medium text-muted-foreground">{t.graph.demo.heading}</p>
          <p className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
            <span className="text-display">{demo.born}</span>
            <span className="text-caption text-muted-foreground">{t.graph.demo.pages}</span>
          </p>
          <p className="mt-1.5 text-title">{demoTitle(demo.t, demo.t >= GROWTH.duration)}</p>
          <p className="mt-1 text-caption text-muted-foreground tabular-nums">
            {t.graph.demo.tally(demo.groups, demo.born, demo.total)}
          </p>
          <div
            role="progressbar"
            aria-label={t.graph.demo.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((demo.t / GROWTH.duration) * 100)}
            data-testid="graph-demo-progress"
            className="mt-3 h-[3px] overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${(demo.t / GROWTH.duration) * 100}%` }}
            />
          </div>
        </div>
      )}
      <div className="absolute inset-0">
        {size.width > 0 && size.height > 0 && (
          <ForceGraph3D<Node3D, { direct: boolean }>
            ref={graphRef}
            width={size.width}
            height={size.height}
            graphData={data}
            // 번짐 합성기를 거치면 색이 화면으로 나갈 때 sRGB 변환을 한 번 더 받는다 —
            // 무대 색을 그대로 넣으면 회색으로 뜬다
            backgroundColor={look.canvas}
            controlType="orbit"
            rendererConfig={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
            // 점은 직접 만든다 — 조명을 받지 않는 재질이라야 별처럼 타고 번짐이 먹는다
            nodeThreeObject={nodeObject}
            // 집는 범위는 그린 점과 같아야 한다 — nodeRelSize 1 + 반지름의 세제곱
            nodeRelSize={1}
            nodeVal={nodeValue}
            nodeLabel={nodeText}
            onNodeHover={onHover}
            linkMaterial={linkMaterial}
            enableNodeDrag={false}
            // 라이브러리 기본 안내문은 영어다 — 조작법은 우리 화면 말로 따로 적는다
            showNavInfo={false}
            cooldownTicks={engine.ticks}
            cooldownTime={engine.time}
            onEngineTick={onTick}
            onEngineStop={onStop}
            onNodeClick={onClick}
            onBackgroundClick={onBackground}
          />
        )}
      </div>
    </div>
  )
}
