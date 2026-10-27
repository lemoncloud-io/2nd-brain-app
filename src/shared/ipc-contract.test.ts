import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { APP_CHANNELS } from './ipc-contract'

// IPC 배선 고정 — 채널 추가는 계약·preload·main 핸들러 세 곳의 수동 동기화다.
// 한 곳이 빠지면 런타임에서만 터지므로 키 목록 자체를 테스트가 들고 있는다.
const root = fileURLToPath(new URL('..', import.meta.url))

const readTree = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) readTree(full, out)
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

const keys = Object.keys(APP_CHANNELS) as (keyof typeof APP_CHANNELS)[]
const preload = readFileSync(join(root, 'preload/index.ts'), 'utf8')
const mainSources = readTree(join(root, 'main')).map((f) => readFileSync(f, 'utf8'))

describe('ipc wiring', () => {
  it('채널 키가 152개다 (늘면 이 숫자를 올린다 — 줄면 계약 삭제를 의심한다)', () => {
    expect(keys.length).toBe(152)
  })

  it('모든 채널이 preload에 노출된다', () => {
    const missing = keys.filter((k) => !preload.includes(`APP_CHANNELS.${k}`))
    expect(missing).toEqual([])
  })

  it('모든 채널이 main 어딘가에서 참조된다', () => {
    const missing = keys.filter(
      (k) => !mainSources.some((src) => src.includes(`APP_CHANNELS.${k}`))
    )
    expect(missing).toEqual([])
  })
})
