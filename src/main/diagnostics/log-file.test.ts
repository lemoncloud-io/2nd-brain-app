import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogFile } from './log-file'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'log-file-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createLogFile', () => {
  it('줄을 순서대로 붙인다', async () => {
    const file = createLogFile({ dir, name: 'main', maxBytes: 1000, keep: 2 })
    file.write('one')
    file.write('two')
    await file.flush()
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('one\ntwo\n')
  })

  it('상한을 넘기면 main.1.log 로 밀고 새 파일에 이어 쓴다', async () => {
    const file = createLogFile({ dir, name: 'main', maxBytes: 10, keep: 2 })
    file.write('aaaaaaaa')
    file.write('bbbbbbbb')
    await file.flush()
    expect(readFileSync(join(dir, 'main.1.log'), 'utf8')).toBe('aaaaaaaa\n')
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('bbbbbbbb\n')
  })

  it('keep 개수를 넘는 옛 파일은 지운다', async () => {
    const file = createLogFile({ dir, name: 'main', maxBytes: 5, keep: 2 })
    for (const line of ['1111', '2222', '3333', '4444']) file.write(line)
    await file.flush()
    expect(readdirSync(dir).sort()).toEqual(['main.1.log', 'main.2.log', 'main.log'])
    expect(readFileSync(join(dir, 'main.2.log'), 'utf8')).toBe('2222\n')
  })

  it('이미 있는 파일 크기부터 센다 — 재시작해도 상한이 이어진다', async () => {
    writeFileSync(join(dir, 'main.log'), 'x'.repeat(9))
    const file = createLogFile({ dir, name: 'main', maxBytes: 10, keep: 1 })
    file.write('next')
    await file.flush()
    expect(readFileSync(join(dir, 'main.1.log'), 'utf8')).toBe('x'.repeat(9))
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('next\n')
  })

  it('상한과 정확히 같아지는 줄까지는 회전하지 않는다', async () => {
    const file = createLogFile({ dir, name: 'main', maxBytes: 10, keep: 1 })
    file.write('aaaa')
    file.write('bbbb')
    await file.flush()
    expect(readdirSync(dir)).toEqual(['main.log'])
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('aaaa\nbbbb\n')
  })

  it('writeSync 는 대기 중인 줄을 먼저, 이 줄까지 돌아오기 전에 쓴다 — 죽기 직전 줄', async () => {
    const file = createLogFile({ dir, name: 'main', maxBytes: 1000, keep: 1 })
    file.write('queued')
    file.writeSync('fatal')
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('queued\nfatal\n')
    await file.flush()
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('queued\nfatal\n')
  })

  it('drainSync 는 대기열을 동기로 비운다 — 종료 직전', () => {
    const file = createLogFile({ dir, name: 'main', maxBytes: 1000, keep: 1 })
    file.write('last words')
    file.drainSync()
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('last words\n')
  })

  it('쓸 수 없는 자리면 한 번 알리고 앱을 멈추지 않는다', async () => {
    const blocked = join(dir, 'file-not-dir')
    writeFileSync(blocked, '')
    const reports: unknown[] = []
    const file = createLogFile({
      dir: join(blocked, 'logs'),
      name: 'main',
      maxBytes: 1000,
      keep: 1,
      onError: (e) => reports.push(e)
    })
    file.write('a')
    file.write('b')
    file.writeSync('c')
    await file.flush()
    expect(reports).toHaveLength(1)
    expect(existsSync(join(blocked, 'logs'))).toBe(false)
  })

  it('실패 뒤 쉬었다가 다시 쓰고, 그 사이 버린 줄 수를 남긴다', async () => {
    const blocked = join(dir, 'logs')
    writeFileSync(blocked, '') // 폴더 자리에 파일 — 처음엔 못 쓴다
    let clock = 1_000
    const reports: unknown[] = []
    const file = createLogFile({
      dir: blocked,
      name: 'main',
      maxBytes: 1000,
      keep: 1,
      retryMs: 100,
      now: () => clock,
      onError: (e) => reports.push(e)
    })
    file.write('lost-1')
    await file.flush()
    file.write('lost-2')
    expect(file.dropped()).toBe(2)

    rmSync(blocked)
    clock += 200
    file.write('back')
    await file.flush()
    const text = readFileSync(join(blocked, 'main.log'), 'utf8')
    expect(text).toMatch(/\[warn\] \[log\] 2 lines dropped/)
    expect(text.endsWith('back\n')).toBe(true)
    expect(reports).toHaveLength(1)
  })

  it('파일은 이 계정만 읽는다', async () => {
    const file = createLogFile({ dir: join(dir, 'private'), name: 'main', maxBytes: 1000, keep: 1 })
    file.write('x')
    await file.flush()
    expect(statSync(join(dir, 'private')).mode & 0o777).toBe(0o700)
    expect(statSync(join(dir, 'private', 'main.log')).mode & 0o777).toBe(0o600)
  })
})
