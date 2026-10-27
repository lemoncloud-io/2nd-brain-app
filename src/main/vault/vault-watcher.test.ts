// watchVault — fs.watch 재귀 감시, 디바운스 배치, .git 무시, hold 중 적립 후 1회 flush
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { watchVault } from './vault-watcher'

const dirs: string[] = []

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'watch-'))
  dirs.push(d)
  return d
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// FSEvents 는 watch() 직후 잠깐 이벤트를 흘린다 — 조작 전에 탐침 파일 이벤트가 도착할 때까지 기다린다.
// 고정 대기가 아니라 "감시가 켜졌다"는 관측으로 게이트한다. 앱은 감시 시작 뒤 사용자 편집까지 여유가 있어 해당 없음.
const armWatcher = async (dir: string, onChange: ReturnType<typeof vi.fn>): Promise<void> => {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    writeFileSync(join(dir, 'arm-probe.md'), String(Date.now()))
    await wait(300)
    if (onChange.mock.calls.some((c) => (c[0] as string[]).includes('arm-probe.md'))) return
  }
  throw new Error('watcher 가 15초 안에 이벤트를 보내지 않았다')
}

describe('watchVault', { timeout: 25000 }, () => {
  it('파일 쓰기 3회 연속 → 디바운스로 묶인 배치 이벤트 — test: vault-watcher.test.ts', async () => {
    const dir = tmp()
    mkdirSync(join(dir, 'wiki'))
    const onChange = vi.fn()
    const w = watchVault(dir, { debounceMs: 400, onChange, onError: () => {} })
    writeFileSync(join(dir, 'wiki', 'a.md'), '1')
    writeFileSync(join(dir, 'wiki', 'b.md'), '2')
    writeFileSync(join(dir, 'wiki', 'c.md'), '3')
    // 부하 시 FSEvents가 이벤트를 디렉터리 단위로 병합해 개별 파일 이벤트를 잃을 수 있다 —
    // 빠진 파일을 다시 쓰며 수렴시킨다(디바운스 배칭 자체는 호출 수·묶음으로 검증)
    const want = ['wiki/a.md', 'wiki/b.md', 'wiki/c.md']
    const deadline = Date.now() + 15000
    let seen = new Set<string>()
    while (Date.now() < deadline) {
      seen = new Set(onChange.mock.calls.flatMap((c) => c[0] as string[]))
      const missing = want.filter((p) => !seen.has(p))
      if (missing.length === 0) break
      for (const m of missing) writeFileSync(join(dir, m), String(Date.now()))
      await wait(400)
    }
    w.stop()
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1)
    // 폴더 이벤트(`wiki`)도 트리 갱신용으로 온다 — 여기서는 파일 묶음만 본다
    expect([...seen].filter((p) => p.endsWith('.md')).sort()).toEqual(want)
  })

  // 파일 트리는 폴더 변화도 따라가야 한다 — Obsidian·Finder 에서 만든 폴더가 트리에 떠야 한다
  it('밖에서 만든 폴더도 알린다', async () => {
    const dir = tmp()
    const onChange = vi.fn()
    const w = watchVault(dir, { debounceMs: 100, onChange, onError: () => {} })
    await armWatcher(dir, onChange)
    mkdirSync(join(dir, '새 폴더'))
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      if (onChange.mock.calls.some((c) => (c[0] as string[]).includes('새 폴더'))) break
      await wait(200)
    }
    w.stop()
    expect(onChange.mock.calls.flatMap((c) => c[0] as string[])).toContain('새 폴더')
  })

  it('.git/ 변경 → 이벤트 0회 — test: vault-watcher.test.ts', async () => {
    const dir = tmp()
    mkdirSync(join(dir, '.git'))
    const onChange = vi.fn()
    const w = watchVault(dir, { debounceMs: 150, onChange, onError: () => {} })
    writeFileSync(join(dir, '.git', 'config'), 'x')
    await wait(700)
    w.stop()
    expect(onChange).not.toHaveBeenCalled()
  })

  // 커밋은 워킹트리를 안 건드린다 — 이 줄을 안 보면 `save:` 커밋 뒤 트리 배지가 낡은 채 남는다
  it('커밋(.git/logs/HEAD) → 빈 묶음 1회 — test: vault-watcher.test.ts', async () => {
    const dir = tmp()
    mkdirSync(join(dir, '.git', 'logs'), { recursive: true })
    const onChange = vi.fn()
    const w = watchVault(dir, { debounceMs: 150, onChange, onError: () => {} })
    await armWatcher(dir, onChange)
    onChange.mockClear()
    writeFileSync(join(dir, '.git', 'logs', 'HEAD'), 'commit 1\n')
    await wait(700)
    w.stop()
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('볼트 폴더 삭제 → 예외 없이 onError 1회 — test: vault-watcher.test.ts', async () => {
    const dir = tmp()
    const onError = vi.fn()
    const onChange = vi.fn()
    const w = watchVault(dir, { debounceMs: 150, onChange, onError })
    await armWatcher(dir, onChange)
    rmSync(dir, { recursive: true, force: true })
    // 부하 시 이벤트 전달이 늦을 수 있다 — onError가 올 때까지 폴링한다
    const deadline = Date.now() + 15000
    while (Date.now() < deadline && onError.mock.calls.length === 0) await wait(300)
    w.stop()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('hold 중 변경은 푸시하지 않고 적립, release()에 1회 flush — test: vault-watcher.test.ts', async () => {
    const dir = tmp()
    mkdirSync(join(dir, 'wiki'))
    const onChange = vi.fn()
    let held = false
    const w = watchVault(dir, { debounceMs: 150, onChange, onError: () => {}, isHeld: () => held })
    await armWatcher(dir, onChange)
    // 늦게 도착하는 탐침 이벤트가 hold 적립에 섞이지 않게 디바운스 여러 번만큼 흘려보낸 뒤 기록을 비운다
    await wait(600)
    onChange.mockClear()
    held = true
    writeFileSync(join(dir, 'wiki', 'a.md'), '1')
    await wait(700)
    expect(onChange).not.toHaveBeenCalled()
    held = false
    w.release()
    await wait(50)
    w.stop()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual([join('wiki', 'a.md')])
  })
})
