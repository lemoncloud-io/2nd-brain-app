// 3D 그래프 무대 소품 — 가운데 로고 메달리온, 로고 둘레 빛무리, 기울어 도는 궤도 링 둘.
// 기본 화면에 늘 떠 있고, 성장 재생이 링을 펼친다. 색은 무대(`STAGE[stage].growth`)가 정한다.
//
// constellation.js(makeOrbitals)를 TS 로 옮기고 낮 무대용 보통 합성을 더했다 —
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
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3
} from 'three'
import type { GrowthLook } from './graph-3d-look'

export type GrowthFrame = {
  /** 연출 시각(초) */
  t: number
  /** 링이 펼쳐진 정도 0~1 */
  reveal: number
  /** 전체 진하기 0~1 */
  fade: number
  /** 움직일지 — 움직임 줄이기 설정이면 멈춘 채로 둔다 */
  motion: boolean
  /** 카메라 자리 — 링이 옆으로 누운 각도를 잰다 */
  eye: { x: number; y: number; z: number }
}

/**
 * 링이 카메라 쪽으로 얼마나 펼쳐져 보이나 0~1 — 링 면이 시선과 나란하면(옆으로 누우면) 화면을
 * 가로지르는 곧은 선 하나가 되어 그래프의 선으로 읽힌다. 그 각도에서는 링을 지운다
 */
export const ringFacing = (normal: Vector3, eye: Vector3): number => {
  const face = Math.abs(normal.dot(eye.clone().normalize()))
  return Math.min(1, Math.max(0, (face - 0.15) / 0.3))
}

export type GrowthStage = {
  group: Group
  update: (frame: GrowthFrame) => void
  dispose: () => void
}

/** 빛무리 그림 — 가운데 색에서 투명으로 둥글게 */
const haloTexture = (color: string): CanvasTexture | null => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return null
  const { r, g, b } = new Color(color)
  const rgb = `${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}`
  const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64)
  glow.addColorStop(0, `rgba(${rgb},1)`)
  glow.addColorStop(0.25, `rgba(${rgb},0.3)`)
  glow.addColorStop(1, `rgba(${rgb},0)`)
  context.fillStyle = glow
  context.fillRect(0, 0, 128, 128)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * 로고 한 조각 — BrandMark 사분원을 그대로 옮겼다. 바깥은 둥근 모서리 사각(모서리 r=0.28R),
 * 안은 오목한 호(중심이 조각 바깥 모서리, 반지름=조각 크기 — 가운데를 향해 불룩해 네 조각이
 * 모이면 작은 반짝임 빈자리를 이룬다). 조각 사이 십자 틈은 반지름의 5%씩. 1사분면 한 조각만
 * 만들고 돌려 쓴다 — 우하단(270° 돌린 것) 하나만 Spark 색이다
 */
const quadrantGeometry = (radius: number): ExtrudeGeometry => {
  const gap = radius * 0.05
  const corner = radius * 0.28
  const inner = radius - gap
  const shape = new Shape()
  shape.moveTo(gap, radius)
  shape.lineTo(radius - corner, radius)
  shape.absarc(radius - corner, radius - corner, corner, Math.PI / 2, 0, true)
  shape.lineTo(radius, gap)
  // 호 시작점이 현재점과 같아야 한다 — 다르면 three 가 그 사이에 현 직선을 끼워 윤곽이 겹치고,
  // 겹친 현–호 사이는 뚜껑 삼각측량에서 빠져 빈 렌즈가 된다. 끝점 D=(R,g) 는 270° 다
  shape.absarc(radius, radius, inner, Math.PI * 1.5, Math.PI, true)
  shape.closePath()
  const depth = radius * 0.32
  // 모서리 둥글림(bevel)은 뺀다 — 로고 원본도 평면이라 납작한 동전으로 충분하다
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 28 })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

/**
 * 구 반지름(`globeRadius`)에 맞춘 무대 소품. 링은 구 바깥에, 로고는 구 가운데 작게.
 * 재질은 전부 안개를 받지 않는다 — 낮 무대 안개가 가운데 로고를 바탕색으로 지운다
 */
export const makeGrowthStage = (look: GrowthLook, radius: number): GrowthStage => {
  const blending = look.additive ? AdditiveBlending : NormalBlending
  const group = new Group()
  const owned: { dispose: () => void }[] = []

  const ringRadii = [radius * 1.45, radius * 1.55]
  const rings = ringRadii.map((ringRadius, i) => {
    const points = Array.from({ length: 241 }, (_, j) => {
      const a = (j / 240) * Math.PI * 2
      return new Vector3(Math.cos(a) * ringRadius, Math.sin(a) * ringRadius, 0)
    })
    const geometry = new BufferGeometry().setFromPoints(points)
    const material = new LineBasicMaterial({
      color: look.rings[i],
      transparent: true,
      opacity: look.ringAlpha,
      depthWrite: false,
      fog: false,
      toneMapped: false
    })
    const ring = new Line(geometry, material)
    ring.rotation.set(i ? 0.9 : -0.5, i ? -0.45 : 0.4, 0.2)
    const beadGeometry = new SphereGeometry(Math.max(2, radius * 0.012), 10, 8)
    const beadMaterial = new MeshBasicMaterial({
      color: look.bead,
      transparent: true,
      fog: false,
      toneMapped: false
    })
    const bead = new Mesh(beadGeometry, beadMaterial)
    ring.add(bead)
    group.add(ring)
    owned.push(geometry, material, beadGeometry, beadMaterial)
    return { ring, bead, material, beadMaterial, radius: ringRadius }
  })

  const markGeometry = quadrantGeometry(radius * 0.07)
  const markMaterial = new MeshBasicMaterial({
    color: look.mark,
    transparent: true,
    fog: false,
    toneMapped: false
  })
  const sparkMaterial = new MeshBasicMaterial({
    color: look.markSpark,
    transparent: true,
    fog: false,
    toneMapped: false
  })
  // 한 조각 지오메트리를 돌려 넷 — 270° 돌린 우하단 하나만 Spark 색(BrandMark 규칙)
  const medallion = new Group()
  ;[0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((turn, i) => {
    const piece = new Mesh(markGeometry, i === 3 ? sparkMaterial : markMaterial)
    piece.rotation.z = turn
    medallion.add(piece)
  })
  group.add(medallion)
  owned.push(markGeometry, markMaterial, sparkMaterial)

  const texture = haloTexture(look.halo)
  const haloMaterial = texture
    ? new SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: look.haloAlpha,
        depthWrite: false,
        blending,
        fog: false,
        toneMapped: false
      })
    : null
  if (texture && haloMaterial) {
    const halo = new Sprite(haloMaterial)
    halo.scale.set(radius * 0.9, radius * 0.9, 1)
    group.add(halo)
    owned.push(texture, haloMaterial)
  }

  return {
    group,
    update: ({ t, reveal, fade, motion, eye }) => {
      const spin = motion ? t : 0
      const view = new Vector3(eye.x, eye.y, eye.z)
      const normal = new Vector3()
      // 로고는 살짝 기울인 채 천천히 자전한다 — 한 바퀴에 30초, 옆모습은 스쳐 간다
      medallion.rotation.set(0.3, spin * 0.2, 0)
      markMaterial.opacity = fade
      sparkMaterial.opacity = fade
      if (haloMaterial)
        haloMaterial.opacity = look.haloAlpha * fade * (motion ? 1 + Math.sin(t * 0.7) * 0.12 : 1)
      const open = Math.min(1, Math.max(0, reveal))
      rings.forEach(({ ring, bead, material, beadMaterial, radius: ringRadius }, i) => {
        ring.visible = open > 0.01
        ring.scale.setScalar(0.2 + 0.8 * open)
        ring.rotation.z = 0.2 + spin * (i ? -0.018 : 0.012)
        bead.position.set(
          Math.cos(spin * 0.16 + i * 2) * ringRadius,
          Math.sin(spin * 0.16 + i * 2) * ringRadius,
          0
        )
        ring.updateMatrixWorld()
        const facing = ringFacing(ring.getWorldDirection(normal), view)
        material.opacity = look.ringAlpha * open * fade * facing
        beadMaterial.opacity = open * fade * facing
      })
    },
    dispose: () => {
      group.removeFromParent()
      for (const item of owned) item.dispose()
    }
  }
}
