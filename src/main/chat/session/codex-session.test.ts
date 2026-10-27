import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { EngineEvent } from '../../../shared/ipc-contract'
import { classifyEngineFailure } from '../../../shared/engine-failure'
import { engineTimedOut } from '../../engine/cli-process'
import type { ChatSession, SessionSpec, SessionTurn } from './chat-session'
import { codexUpdateRequired, openCodexSession } from './codex-session'

const FAKE = resolve('test/fixtures/fake-codex/session/codex')
chmodSync(FAKE, 0o755)

let dir = ''
let session: ChatSession | null = null
const spawnLog = (): string => join(dir, 'spawn.log')
const requestLog = (): string => join(dir, 'request.log')
const lines = (file: string): string[] => {
  try {
    return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codex-session-'))
  process.env.FAKE_CODEX_SPAWN_LOG = spawnLog()
  process.env.FAKE_CODEX_REQUEST_LOG = requestLog()
})
afterEach(() => {
  session?.close()
  session = null
  delete process.env.FAKE_CODEX_SPAWN_LOG
  delete process.env.FAKE_CODEX_REQUEST_LOG
  delete process.env.FAKE_CODEX_OLD
  delete process.env.FAKE_CODEX_HANG
  delete process.env.FAKE_CODEX_RESUME_FAIL_ONCE
  delete process.env.FAKE_CODEX_COMPACT_ITEM
  rmSync(dir, { recursive: true, force: true })
})

const open = (
  extra: Partial<SessionSpec> = {},
  turnTimeoutMs?: number,
  startTimeoutMs?: number
): ChatSession => {
  session = openCodexSession(
    {
      engine: 'codex',
      cliPath: FAKE,
      vaultDir: dir,
      system: 'SYS',
      mcp: [],
      userSettings: true,
      ...extra
    },
    {
      ...(turnTimeoutMs === undefined ? {} : { turnTimeoutMs }),
      ...(startTimeoutMs === undefined ? {} : { startTimeoutMs })
    }
  )
  return session
}
const ask = (prompt: string, extra: Partial<SessionTurn> = {}): SessionTurn => ({
  prompt,
  mode: 'ask',
  readonly: false,
  ...extra
})
const collect = async (events: AsyncIterable<EngineEvent>): Promise<EngineEvent[]> => {
  const out: EngineEvent[] = []
  for await (const event of events) out.push(event)
  return out
}
const textOf = (events: EngineEvent[]): string =>
  events.map((e) => (e.type === 'text' ? e.text : '')).join('')
const doneOf = (events: EngineEvent[]): EngineEvent | undefined => events.at(-1)

describe('openCodexSession — test: codex-session.ts', () => {
  it('runs two turns on one thread in one app-server and remembers the first', async () => {
    const s = open()
    expect(textOf(await collect(s.turn(ask('기억해 사과'))))).toBe('OK')
    const second = await collect(s.turn(ask('무엇을 기억해')))
    expect(textOf(second)).toBe('사과')
    expect(second).toContainEqual({ type: 'session', id: 'thread-fake' })
    expect(doneOf(second)).toEqual({ type: 'done', ok: true, canceled: false })
    expect(lines(spawnLog())).toHaveLength(1)
    expect(lines(spawnLog())[0]).toMatch(/^app-server /)
    const requests = lines(requestLog())
    expect(requests.filter((l) => l.startsWith('thread/start'))).toEqual([
      'thread/start - workspace-write never SYS'
    ])
    expect(requests.filter((l) => l.startsWith('turn/start'))).toHaveLength(2)
  })

  it('opens with resume once and readonly turns run in a read-only sandbox', async () => {
    const s = open({ resume: 'thread-old' })
    expect(textOf(await collect(s.turn(ask('안녕', { readonly: true }))))).toBe('답: 안녕 (이어짐)')
    await collect(s.turn(ask('안녕', { model: 'gpt-x' })))
    expect(lines(requestLog()).filter((l) => /^thread\/|^turn\//.test(l))).toEqual([
      'thread/resume thread-old read-only never SYS',
      'turn/start readOnly -',
      'turn/start workspaceWrite gpt-x'
    ])
  })

  it('a thread codex no longer has reads as an expired session', async () => {
    const s = open({ resume: 'gone' })
    const events = await collect(s.turn(ask('안녕')))
    const error = events.find((e) => e.type === 'error')
    expect(error?.type === 'error' && classifyEngineFailure(error.message)).toBe('session-expired')
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
  })

  it('codex without app-server asks for an update and does not fall back to exec', async () => {
    process.env.FAKE_CODEX_OLD = '1'
    const s = open()
    const events = await collect(s.turn(ask('안녕')))
    const error = events.find((e) => e.type === 'error')
    expect(error?.type === 'error' && error.message.startsWith(codexUpdateRequired())).toBe(true)
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
    expect(lines(spawnLog()).every((l) => l.startsWith('app-server'))).toBe(true)
    expect(s.alive).toBe(false)
  })

  it('after a failed resume the next turn starts a new thread on the same process', async () => {
    const s = open({ resume: 'gone' })
    await collect(s.turn(ask('안녕')))
    expect(textOf(await collect(s.turn(ask('다시'))))).toBe('답: 다시')
    expect(lines(requestLog()).filter((l) => l.startsWith('thread/'))).toEqual([
      'thread/resume gone workspace-write never SYS',
      'thread/start - workspace-write never SYS'
    ])
  })

  it('a resume that fails for another reason keeps the old thread for the next turn', async () => {
    process.env.FAKE_CODEX_RESUME_FAIL_ONCE = '1'
    const s = open({ resume: 'thread-old' })
    await collect(s.turn(ask('안녕')))
    expect(textOf(await collect(s.turn(ask('다시'))))).toBe('답: 다시 (이어짐)')
    expect(lines(requestLog()).filter((l) => l.startsWith('thread/'))).toEqual([
      'thread/resume thread-old workspace-write never SYS',
      'thread/resume thread-old workspace-write never SYS'
    ])
  })

  it('a codex that never answers initialize is stopped and asked to update', async () => {
    process.env.FAKE_CODEX_HANG = '1'
    const s = open({}, undefined, 300)
    const events = await collect(s.turn(ask('안녕')))
    const error = events.find((e) => e.type === 'error')
    expect(error?.type === 'error' && error.message.startsWith(codexUpdateRequired())).toBe(true)
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
    expect(s.alive).toBe(false)
  })

  it('stop while the thread is still opening ends the turn at once', async () => {
    process.env.FAKE_CODEX_HANG = '1'
    const s = open()
    const run = collect(s.turn(ask('안녕')))
    await new Promise((r) => setTimeout(r, 100))
    s.interrupt()
    expect(doneOf(await run)).toEqual({ type: 'done', ok: false, canceled: true })
  })

  it('compaction reported only as a contextCompaction item still counts and ends the turn', async () => {
    process.env.FAKE_CODEX_COMPACT_ITEM = '1'
    const s = open()
    await collect(s.turn(ask('기억해 사과')))
    const events = await collect(s.turn(ask('/compact', { readonly: true })))
    expect(events.filter((e) => e.type === 'compacted')).toHaveLength(1)
    expect(doneOf(events)).toEqual({ type: 'done', ok: true, canceled: false })
  })

  it('interrupt ends only the turn and the thread answers the next turn', async () => {
    const s = open()
    const events: EngineEvent[] = []
    for await (const event of s.turn(ask('천천히 세어'))) {
      events.push(event)
      if (event.type === 'text') s.interrupt()
    }
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: true })
    expect(textOf(await collect(s.turn(ask('안녕'))))).toBe('답: 안녕')
    expect(lines(spawnLog())).toHaveLength(1)
  })

  it('images go as local files that are removed after the turn', async () => {
    const s = open()
    const png = Buffer.from('fake').toString('base64')
    const events = await collect(
      s.turn(ask('그림 봐', { images: [{ mediaType: 'image/png', data: png }] }))
    )
    expect(textOf(events)).toBe('답: 그림 봐 [image ok]')
    const [path] = lines(requestLog())
      .filter((l) => l.startsWith('turn/start'))[0]!
      .split(' ')
      .slice(3)
    expect(path).toMatch(/2nd-brain-image-.+\/1\.png$/)
    await new Promise((r) => setTimeout(r, 50))
    expect(existsSync(path!)).toBe(false)
  })

  it('/compact asks the thread to compact and reports it', async () => {
    const s = open()
    await collect(s.turn(ask('기억해 사과')))
    const events = await collect(s.turn(ask('/compact', { readonly: true, offline: true })))
    expect(events).toContainEqual({ type: 'compacted' })
    expect(doneOf(events)).toEqual({ type: 'done', ok: true, canceled: false })
    expect(lines(requestLog())).toContain('thread/compact/start')
  })

  it('a failed turn shows its reason once', async () => {
    const s = open()
    const events = await collect(s.turn(ask('한도 넘겨')))
    const errors = events.filter((e) => e.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]?.type === 'error' && classifyEngineFailure(errors[0].message)).toBe(
      'usage-limit'
    )
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
  })

  it('a command shows as a tool line', async () => {
    const s = open()
    const events = await collect(s.turn(ask('명령 실행')))
    expect(events).toContainEqual({ type: 'tool', name: 'command', target: 'ls wiki' })
  })

  it('timeout interrupts a silent turn and keeps the thread', async () => {
    const s = open({}, 300)
    const events = await collect(s.turn(ask('조용히 있어')))
    expect(events).toContainEqual({ type: 'error', message: engineTimedOut() })
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
    expect(textOf(await collect(s.turn(ask('안녕'))))).toBe('답: 안녕')
  })

  it('a process that dies mid-turn ends the turn with an error', async () => {
    const s = open()
    await collect(s.turn(ask('안녕')))
    const events = await collect(s.turn(ask('죽어')))
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
    expect(s.alive).toBe(false)
  })
})
