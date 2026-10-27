// @vitest-environment jsdom
// 성장 연출의 로고·궤도 링 — 무대 색을 따르고, 낮 무대는 빛을 더하지 않는다.
import { describe, expect, it, vi } from 'vitest'
import {
  AdditiveBlending,
  type BufferGeometry,
  Color,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Line,
  Sprite,
  Vector3,
  type Object3D
} from 'three'
import { STAGE } from './graph-3d-look'
import { makeGrowthStage, ringFacing } from './graph-growth-scene'

const materials = (root: Object3D): Material[] => {
  const all: Material[] = []
  root.traverse((part) => {
    if (part instanceof Mesh || part instanceof Line || part instanceof Sprite)
      all.push(part.material as Material)
  })
  return all
}

// jsdom 에는 2D 캔버스가 없다 — 빛무리 그림이 그려지도록 최소한만 흉내 낸다
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  createRadialGradient: () => ({ addColorStop: vi.fn() }),
  fillRect: vi.fn(),
  fillStyle: ''
})) as unknown as typeof HTMLCanvasElement.prototype.getContext

const eye = new Vector3(0, 0, 800)

describe('makeGrowthStage', () => {
  it('로고 조각 넷·링 둘·빛무리를 하나로 묶어 낸다', () => {
    const stage = makeGrowthStage(STAGE.dark.growth, 200)
    const parts = { mesh: 0, line: 0, sprite: 0 }
    stage.group.traverse((part) => {
      if (part instanceof Line) parts.line += 1
      else if (part instanceof Sprite) parts.sprite += 1
      else if (part instanceof Mesh) parts.mesh += 1
    })
    // 로고 조각 4 + 링마다 구슬 1
    expect(parts).toEqual({ mesh: 6, line: 2, sprite: 1 })
  })

  it('로고는 한 조각을 돌려 넷 — 우하단 하나만 Spark 색이다', () => {
    const stage = makeGrowthStage(STAGE.dark.growth, 200)
    const pieces: Mesh[] = []
    stage.group.traverse((part) => {
      if (part instanceof Mesh && part.geometry.type === 'ExtrudeGeometry') pieces.push(part)
    })
    expect(pieces).toHaveLength(4)
    // 지오메트리 하나를 돌려 쓴다
    expect(new Set(pieces.map((piece) => piece.geometry)).size).toBe(1)
    const sparkHex = new Color(STAGE.dark.growth.markSpark).getHex()
    const sparks = pieces.filter(
      (piece) => (piece.material as MeshBasicMaterial).color.getHex() === sparkHex
    )
    expect(sparks).toHaveLength(1)
    // 우하단 = 270° 돌린 것
    expect(sparks[0].rotation.z).toBeCloseTo(-Math.PI / 2)
  })

  it('로고는 천천히 자전한다 — 움직임 줄이기면 멈춘다', () => {
    const stage = makeGrowthStage(STAGE.dark.growth, 200)
    const pieces: Mesh[] = []
    stage.group.traverse((part) => {
      if (part instanceof Mesh && part.geometry.type === 'ExtrudeGeometry') pieces.push(part)
    })
    const parent = pieces[0].parent
    if (!parent) throw new Error('로고 조각이 무리에 없다')
    stage.update({ t: 10, reveal: 1, fade: 1, motion: false, eye })
    expect(parent.rotation.y).toBe(0)
    stage.update({ t: 30, reveal: 1, fade: 1, motion: false, eye })
    expect(parent.rotation.y).toBe(0)
    stage.update({ t: 30, reveal: 1, fade: 1, motion: true, eye })
    expect(parent.rotation.y).toBeCloseTo(30 * 0.2)
  })

  it('낮 무대는 어느 재질도 빛을 더하지 않는다', () => {
    const stage = makeGrowthStage(STAGE.light.growth, 200)
    expect(materials(stage.group).some((m) => m.blending === AdditiveBlending)).toBe(false)
  })

  it('밤 무대는 빛무리를 더해 그린다', () => {
    const stage = makeGrowthStage(STAGE.dark.growth, 200)
    expect(materials(stage.group).some((m) => m.blending === AdditiveBlending)).toBe(true)
  })

  it('거리 안개에 지워지지 않는다 — 낮 무대는 안개를 건다', () => {
    const stage = makeGrowthStage(STAGE.light.growth, 200)
    expect(materials(stage.group).every((m) => !('fog' in m) || m.fog === false)).toBe(true)
  })

  it('링이 옆으로 누운 각도에서는 지운다 — 곧은 선이 되어 그래프 선으로 읽힌다', () => {
    const normal = new Vector3(0, 0, 1)
    expect(ringFacing(normal, new Vector3(0, 0, 500))).toBe(1)
    expect(ringFacing(normal, new Vector3(500, 0, 0))).toBe(0)
    expect(ringFacing(normal, new Vector3(500, 0, 10))).toBe(0)

    const stage = makeGrowthStage(STAGE.dark.growth, 200)
    const rings: Line[] = []
    stage.group.traverse((part) => part instanceof Line && rings.push(part))
    stage.group.updateMatrixWorld()
    // 첫 링 면 위에 카메라를 둔다 — 링 법선에 수직인 방향
    const n = rings[0].getWorldDirection(new Vector3())
    const side = new Vector3(0, 1, 0).cross(n).normalize().multiplyScalar(800)
    stage.update({ t: 20, reveal: 1, fade: 1, motion: false, eye: side })
    expect((rings[0].material as Material).opacity).toBe(0)
    stage.update({ t: 20, reveal: 1, fade: 1, motion: false, eye: n.clone().multiplyScalar(800) })
    expect((rings[0].material as Material).opacity).toBeGreaterThan(0)
  })

  it('링은 펼침 0 이면 숨고, 사라짐 0 이면 전부 투명하다', () => {
    const stage = makeGrowthStage(STAGE.light.growth, 200)
    const rings: Line[] = []
    stage.group.traverse((part) => part instanceof Line && rings.push(part))
    stage.update({ t: 1, reveal: 0, fade: 1, motion: true, eye })
    expect(rings.every((ring) => !ring.visible)).toBe(true)
    stage.update({ t: 20, reveal: 1, fade: 0, motion: true, eye })
    expect(materials(stage.group).every((m) => m.opacity === 0)).toBe(true)
  })

  it('놓으면 지오메트리·재질·텍스처를 전부 놓는다', () => {
    const stage = makeGrowthStage(STAGE.dark.growth, 200)
    const geometries: BufferGeometry[] = []
    stage.group.traverse((part) => {
      if (part instanceof Mesh || part instanceof Line) geometries.push(part.geometry)
    })
    const halo = materials(stage.group).find((m) => m instanceof Object && 'map' in m && m.map)
    const textures = halo && 'map' in halo && halo.map ? [halo.map as { dispose: () => void }] : []
    expect(textures).toHaveLength(1)
    const spies = [...materials(stage.group), ...geometries, ...textures].map((item) =>
      vi.spyOn(item, 'dispose')
    )
    stage.dispose()
    for (const spy of spies) expect(spy).toHaveBeenCalled()
    expect(stage.group.parent).toBeNull()
  })
})
