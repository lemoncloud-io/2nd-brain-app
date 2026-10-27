// 점 하나에 마음을 두면 나머지는 물러난다 — 호버가 무엇을 남기고 무엇을 죽이는지의 규칙.
// 렌더러는 이 규칙을 재질 색과 가시성으로 그린다. 고르기(클릭)의 이름표·흐르는 점·카메라 비행은
// 3d-brain(MIT © 2026 Nate Herk) app.js computeHighlight·flyTo 의 규칙을 옮겼다.
import { CAMERA_FOV } from './graph-3d-look'

/** 점마다 이웃 — 선 하나가 양쪽을 서로의 이웃으로 만든다 */
export const neighbourMap = (
  links: { source: string; target: string }[]
): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>()
  const link = (a: string, b: string): void => {
    const set = map.get(a) ?? new Set<string>()
    set.add(b)
    map.set(a, set)
  }
  for (const edge of links) {
    link(edge.source, edge.target)
    link(edge.target, edge.source)
  }
  return map
}

/** 이 점을 죽일까 — 아무 데도 마음을 두지 않았으면 아무도 죽이지 않는다 */
export const isDimmed = (
  key: string,
  focus: string | null,
  neighbours: Map<string, Set<string>>
): boolean => {
  if (focus === null || key === focus) return false
  return !neighbours.get(focus)?.has(key)
}

/** 이 선을 남길까 — 마음을 둔 점에 닿은 선만 남는다 */
export const isLinkKept = (a: string, b: string, focus: string | null): boolean =>
  focus === null || a === focus || b === focus

type Vec3 = { x: number; y: number; z: number }

/** 이름표를 더 달 점 — 마음을 둔 점과, 그 이웃 전부. 이어진 수 내림차순이라 겹칠 때 큰 점이 먼저 자리를 잡는다.
 * 예전에는 상위 9개만 달았더니(원본 label budget) 선은 보여도 이름이 안 보여 무엇과 이어졌는지 알 수 없었다.
 * 포커스 때만 다는 값이라 허브라도 감당된다 */
export const focusLabels = (
  focus: string | null,
  neighbours: Map<string, Set<string>>,
  degree: (id: string) => number
): Set<string> => {
  if (focus === null) return new Set()
  const top = [...(neighbours.get(focus) ?? [])].sort((a, b) => degree(b) - degree(a))
  return new Set([focus, ...top])
}
/** 흐르는 점을 태울 선 수 — 허브의 선 수백 개에 다 태우면 점이 구름이 된다(원본 particleLinks) */
export const SPARK_LINKS = 24

/** 흐르는 점을 태울 선 — 마음을 둔 점에서 보이는 이웃으로, [그 점, 이웃] 순서 */
export const sparkLinks = (
  focus: string | null,
  links: { source: string; target: string }[],
  visible: (id: string) => boolean
): [string, string][] => {
  if (focus === null) return []
  const out: [string, string][] = []
  for (const { source, target } of links) {
    if (out.length >= SPARK_LINKS) break
    const other = source === focus ? target : target === focus ? source : null
    if (other !== null && visible(other)) out.push([focus, other])
  }
  return out
}

/** 선 위 흐르는 점의 자리 — progress 는 0→1 이 한 바퀴, 넘치면 처음부터 */
export const sparkAt = (a: Vec3, b: Vec3, progress: number): Vec3 => {
  const f = progress - Math.floor(progress)
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }
}

/** 원본 구 반지름 — 비행 거리(200 + 이어진 수)는 이 크기의 구에 맞춘 값이라 우리 구 크기로 늘이고 줄인다 */
const REFERENCE_RADIUS = 400

/**
 * 구가 화면에 다 들어오는 거리 — 바깥 반지름(1.3R)을 화각 절반의 사인으로 나눈다.
 * 마운트 첫 화면과 맞춤 단추·성장 연출이 같은 거리를 쓴다 — 기본 화면 = 맞춤 화면이다.
 * 세로로 긴 칸(aspect < 1)은 가로 화각이 더 좁다 — 좁은 쪽에 맞춘다.
 */
export const fitDistance = (radius: number, aspect: number = 1): number => {
  const outer = radius * 1.3
  const half = ((CAMERA_FOV / 2) * Math.PI) / 180
  const narrow = Math.min(half, Math.atan(Math.tan(half) * aspect))
  return (outer / Math.sin(narrow)) * 1.15
}

/**
 * 고른 점으로 날아갈 카메라 자리 — 구 바깥에서 그 점을 본다. 이어진 수가 많을수록 멀리서 이웃까지 담는다.
 * 원점 가까운 점은 바깥 방향이 없으니 지금 보는 방향에서 다가간다
 */
export const flyTo = (
  at: Vec3,
  radius: number,
  degree: number,
  globe: number,
  eye: Vec3
): { position: Vec3; lookAt: Vec3 } => {
  const scale = globe / REFERENCE_RADIUS
  // 작은 구에서는 줄인 거리가 점보다 짧아 점이 화면을 덮는다 — 점 크기·구 크기로 바닥을 둔다
  const dist = Math.max(
    scale * (200 + Math.min(degree, 300) * 1.1) + radius * 10,
    radius * 30,
    globe * 0.5
  )
  const r = Math.hypot(at.x, at.y, at.z)
  const from = r > 40 * scale ? at : eye
  const length = Math.hypot(from.x, from.y, from.z) || 1
  const dir = { x: from.x / length, y: from.y / length, z: from.z / length }
  return {
    position: {
      x: at.x + dir.x * dist,
      y: at.y + dir.y * dist * 0.6 + 10 * scale,
      z: at.z + dir.z * dist
    },
    lookAt: { ...at }
  }
}
