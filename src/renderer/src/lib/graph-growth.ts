// 3D 그래프 "성장 재생" 의 계획과 시간 곡선 — three·DOM 없이 수만 다룬다.
// 성장은 실제 연결을 다시 밟는 것이지 만든 날짜의 역사가 아니다: 모든 가지는 그래프에 있는 선이고,
// 아무 데도 안 이어진 점은 제 뿌리로 따로 합류한다.
//
// growth.js(planGrowth·growthPosition)·constellation.js(composeGlobe)를 TS 로 옮겼다(구면 배치는 나선으로 바꿨다) —
// 원본: AIS-OS `.claude/skills/3d-brain/assets/template/src/`
//
// MIT License
//
// Copyright (c) 2026 Nate Herk
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/** 성장 연출의 시각(초) — 15초 안에 다 보여 준다 */
export const GROWTH = {
  /** 연출 전체 길이 */
  duration: 15,
  /** 마지막 점이 태어나는 때 — 뒤로 갈수록 빨리 태어나 여기서 다 찬다 */
  lastBorn: 12,
  /** 가지가 아닌 실제 선이 합류하기 시작하는 때 — 그 전에는 뻗는 가지만 보인다 */
  lateLinksAt: 6
}

/** 한 점이 한 차례에 새로 뻗는 가지 수 — 큰 허브 하나에서 별 모양으로 터지지 않게 */
const BRANCHES_PER_TURN = 3

/** 툴바가 보는 재생 상태 — 구면 자리가 화면에 오르기 전(unready)에는 재생할 수 없다 */
export type GrowthState = 'unready' | 'idle' | 'playing'

export type GrowthNode = { id: string; community: number }
export type GrowthLink = { source: string; target: string }
export type Vec3 = { x: number; y: number; z: number }

export type GrowthRecord = {
  id: string
  /** 이 점을 낳은 점 — 없으면 새 뿌리(첫 점이거나 아무 데도 안 이어진 점) */
  parent: string | null
  /** 태어난 차례 */
  index: number
  /** 태어나는 시각(초) */
  born: number
}

export type GrowthPlan = {
  records: GrowthRecord[]
  byId: Map<string, GrowthRecord>
  /** 가지가 된 실제 선 — `pairKey` 로 */
  tree: Set<string>
}

/** 방향 없는 선의 열쇠 */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** i 번째 점이 태어나는 시각 — 하나, 첫 연결, 둘째 가지, 그다음부터 가속 */
const bornAt = (i: number, count: number): number =>
  i === 0
    ? 0
    : i === 1
      ? 0.6
      : i === 2
        ? 1.2
        : 1.5 + (GROWTH.lastBorn - 1.5) * Math.pow((i - 2) / Math.max(1, count - 3), 0.62)

/**
 * 실제 선만 쓰는 spanning forest — 계획 안에서 가장 많이 이어진 점에서 시작해 너비 우선으로 뻗는다.
 * 계획 밖 점으로 가는 선·자기 고리·중복 선은 무시한다
 */
export const planGrowth = (nodes: GrowthNode[], links: GrowthLink[]): GrowthPlan => {
  const byNode = new Map(nodes.map((n) => [n.id, n]))
  const adjacent = new Map<string, GrowthNode[]>(nodes.map((n) => [n.id, []]))
  const linked = new Set<string>()
  for (const { source, target } of links) {
    if (source === target || !byNode.has(source) || !byNode.has(target)) continue
    const key = pairKey(source, target)
    if (linked.has(key)) continue
    linked.add(key)
    adjacent.get(source)!.push(byNode.get(target)!)
    adjacent.get(target)!.push(byNode.get(source)!)
  }
  // 순위는 계획 안에서 이어진 수 — 전체 그래프의 이어진 수로 고르면 필터가 이웃을 다 숨긴 점이
  // 첫 점이 되어 첫 연결이 나오지 않는다
  const rank = (a: GrowthNode, b: GrowthNode): number =>
    adjacent.get(b.id)!.length - adjacent.get(a.id)!.length ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  for (const list of adjacent.values()) list.sort(rank)

  const order: { id: string; parent: string | null }[] = []
  const seen = new Set<string>()
  const tree = new Set<string>()
  for (const seed of [...nodes].sort(rank)) {
    if (seen.has(seed.id)) continue
    seen.add(seed.id)
    order.push({ id: seed.id, parent: null })
    const queue = [seed.id]
    for (let q = 0; q < queue.length; q++) {
      const parent = queue[q]
      const open = adjacent.get(parent)!.filter((n) => !seen.has(n.id))
      for (const next of open.slice(0, BRANCHES_PER_TURN)) {
        seen.add(next.id)
        order.push({ id: next.id, parent })
        tree.add(pairKey(parent, next.id))
        queue.push(next.id)
      }
      // 남은 가지는 이 점이 다시 차례를 받을 때 뻗는다
      if (open.length > BRANCHES_PER_TURN) queue.push(parent)
    }
  }
  const records = order.map((o, index) => ({ ...o, index, born: bornAt(index, order.length) }))
  return { records, byId: new Map(records.map((r) => [r.id, r])), tree }
}

export const isNodeGrown = (plan: GrowthPlan, id: string, t: number): boolean =>
  (plan.byId.get(id)?.born ?? Infinity) <= t

/** 양끝이 태어난 실제 선 — 가지면 바로, 가지가 아니면 `lateLinksAt` 부터 */
export const isLinkGrown = (plan: GrowthPlan, a: string, b: string, t: number): boolean => {
  const ra = plan.byId.get(a)
  const rb = plan.byId.get(b)
  if (!ra || !rb || Math.max(ra.born, rb.born) > t) return false
  return plan.tree.has(pairKey(a, b)) || t >= GROWTH.lateLinksAt
}

/**
 * 시각 t 의 자리 — 태어난 점은 부모 자리(origin)에서 튀어나와 제 자리(home)로 스프링처럼 선다.
 * 전체는 작게 뭉친 채 시작해 `lastBorn` 까지 제 크기로 퍼진다. 첫 점은 천천히 밀려난다
 */
export const growthPosition = (record: GrowthRecord, t: number, origin: Vec3, home: Vec3): Vec3 => {
  const u = Math.min(1, Math.max(0, t - record.born) / 1.6)
  const spring = u >= 1 ? 1 : 1 - Math.exp(-5 * u) * Math.cos(7 * u)
  const spread = 0.17 + 0.83 * Math.min(1, t / GROWTH.lastBorn)
  const progress = record.index === 0 ? Math.min(1, t / (GROWTH.duration * 0.6)) : spring
  const at = (axis: keyof Vec3): number =>
    origin[axis] + (home[axis] * spread - origin[axis]) * progress
  return { x: at('x'), y: at('y'), z: at('z') }
}

/** 구의 안쪽 반지름 — 점이 많을수록 크게 */
export const globeRadius = (count: number): number => Math.max(80, 22 * Math.sqrt(count))

/** 경도 구간 수 상한 — 구간이 가늘어지면 점이 세로 기둥으로 선다. 넘치는 작은 구획은 마지막 구간에 모은다 */
const MAX_SECTORS = 6

/** 구면에 놓을 점 — 구획(sector)이 경도 구간을 정한다 */
export type GlobeNode = GrowthNode & { sector: string }

/**
 * 결정적 구면 배치 — 원본 composeGlobe 그대로: 구획마다 경도 한 구간(앞뒤 8% 틈)을 주고, 그 안에서 위도를
 * 등면적으로 고르게 깐다. 큰 구획은 빽빽한 초승달이, 작은 구획은 듬성듬성한 점이 된다. 원본의 구획은 출처였고
 * 여기서는 점의 종류·폴더다(부르는 쪽이 정한다). 구획 안에서는 묶음 순서로 줄 세워 같은 묶음이 이웃한 위도에 모인다.
 * 껍질은 R~1.3R(원본 350~450). 같은 그래프면 같은 자리다
 */
export const globeLayout = (nodes: GlobeNode[]): Map<string, Vec3> => {
  const R = globeRadius(nodes.length)
  const bySector = new Map<string, GlobeNode[]>()
  for (const n of nodes) bySector.set(n.sector, [...(bySector.get(n.sector) ?? []), n])
  // 큰 구획부터(같으면 이름순) — 상한을 넘는 작은 구획은 마지막 구간 하나에 모은다
  const sectors = [...bySector.entries()].sort(
    ([a, x], [b, y]) => y.length - x.length || (a < b ? -1 : a > b ? 1 : 0)
  )
  const slots = sectors.slice(0, MAX_SECTORS - 1).map(([, list]) => list)
  const rest = sectors.slice(MAX_SECTORS - 1).flatMap(([, list]) => list)
  if (rest.length > 0) slots.push(rest)
  const at = new Map<string, Vec3>()
  slots.forEach((list, sector) => {
    const ordered = [...list].sort(
      (a, b) => a.community - b.community || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
    ordered.forEach((n, i) => {
      const y = 1 - 2 * ((i + 0.5) / ordered.length)
      const turn = (i * 0.61803398875) % 1
      const angle = ((sector + 0.08 + turn * 0.84) / slots.length) * Math.PI * 2
      // 껍질 두께 — 다 같은 반지름이면 얇은 껍데기라 깊이가 안 읽힌다
      const radius = R * (1 + 0.3 * ((i * 0.754877666) % 1))
      const flat = Math.sqrt(1 - y * y)
      at.set(n.id, {
        x: radius * flat * Math.sin(angle),
        y: radius * y,
        z: radius * flat * Math.cos(angle)
      })
    })
  })
  return at
}

/** 개요에서 짧은 선으로 칠 거리 — 안쪽 반지름 대비. 원본은 반지름 350~450 구에서 220 */
const SHORT_LINK = 0.55
/** 먼 선 중 표본으로 남길 간격 — 원본과 같다 */
const LINK_SAMPLE = 29

/**
 * 개요에 그릴 선 — 구면에서 가까운 쌍의 선과, 먼 선 중 몇 개의 표본. 구면 배치에서 선을 다 그리면 구를 가로지르는
 * 긴 현이 엉켜 아무것도 안 읽힌다. 개수는 줄여도 없는 선은 만들지 않는다(자리 없는 점의 선은 버린다).
 * 낮 개요는 먼 선 표본까지 버린다 — 빈 가운데를 관통하는 긴 현이 노이즈라서. 원본: app.js quietLinks
 */
export const overviewLinks = (
  links: GrowthLink[],
  at: Map<string, Vec3>,
  radius: number,
  keepFar = true
): Set<string> => {
  const kept = new Set<string>()
  links.forEach(({ source, target }, i) => {
    const a = at.get(source)
    const b = at.get(target)
    if (!a || !b) return
    const near = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < radius * SHORT_LINK
    if (near || (keepFar && i % LINK_SAMPLE === 0)) kept.add(pairKey(source, target))
  })
  return kept
}
