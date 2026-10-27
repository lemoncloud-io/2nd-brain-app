import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { EngineEvent } from '../../../shared/ipc-contract'
import type { IngestJob } from '../../engine/engine'
import { claudeStartFailed, openClaudeSession } from './claude-session'
import { engineTimedOut } from '../../engine/cli-process'
import { classifyEngineFailure } from '../../../shared/engine-failure'
import type { ChatSession, SessionSpec, SessionTurn } from './chat-session'
import { createChatSessions } from './chat-sessions'

const FAKE = resolve('test/fixtures/fake-claude/session/claude')

let dir = ''
let session: ChatSession | null = null
const spawnLog = (): string => join(dir, 'spawn.log')
const controlLog = (): string => join(dir, 'control.log')
const lines = (file: string): string[] => {
  try {
    return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'claude-session-'))
  process.env.FAKE_CLAUDE_SPAWN_LOG = spawnLog()
  process.env.FAKE_CLAUDE_CONTROL_LOG = controlLog()
})
afterEach(() => {
  session?.close()
  session = null
  delete process.env.FAKE_CLAUDE_SPAWN_LOG
  delete process.env.FAKE_CLAUDE_CONTROL_LOG
  delete process.env.FAKE_CLAUDE_OLD
  rmSync(dir, { recursive: true, force: true })
})

const open = (extra: Partial<SessionSpec> = {}, turnTimeoutMs?: number): ChatSession => {
  session = openClaudeSession(
    {
      engine: 'claude',
      cliPath: FAKE,
      vaultDir: dir,
      system: 'SYS',
      mcp: [],
      userSettings: true,
      ...extra
    },
    turnTimeoutMs === undefined ? {} : { turnTimeoutMs }
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

describe('openClaudeSession', () => {
  it('keeps one process across turns and remembers the earlier turn', async () => {
    const s = open()
    const first = await collect(s.turn(ask('기억해 파인애플')))
    expect(textOf(first)).toBe('OK')
    expect(doneOf(first)).toEqual({ type: 'done', ok: true, canceled: false })
    const second = await collect(s.turn(ask('무엇을 기억해?')))
    expect(textOf(second)).toBe('파인애플')
    expect(second).toContainEqual({ type: 'session', id: 'sess-fake' })
    expect(lines(spawnLog())).toHaveLength(1)
    expect(s.alive).toBe(true)
  })

  it('opens with resume once and asks the user claude with stream-json input', async () => {
    const s = open({ resume: 'sess-old', model: 'claude-x' })
    const events = await collect(s.turn(ask('안녕')))
    expect(textOf(events)).toBe('답: 안녕 (이어짐)')
    const [argv] = lines(spawnLog())
    expect(argv).toContain('--resume=sess-old')
    expect(argv).toContain('--input-format stream-json')
    expect(argv).toContain('--setting-sources=user,project,local')
    expect(argv).toContain('--disallowedTools=AskUserQuestion,EnterPlanMode,ExitPlanMode')
  })

  it('without the user claude settings reads only the vault settings', async () => {
    const s = open({ userSettings: false })
    await collect(s.turn(ask('안녕')))
    expect(lines(spawnLog())[0]).toContain('--setting-sources=project,local')
  })

  it('interrupt ends only the turn and the process answers the next turn', async () => {
    const s = open()
    await collect(s.turn(ask('기억해 사과')))
    const slow = s.turn(ask('천천히 세어'))
    const events: EngineEvent[] = []
    for await (const event of slow) {
      events.push(event)
      if (event.type === 'text') s.interrupt()
    }
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: true })
    expect(textOf(await collect(s.turn(ask('무엇을 기억해?'))))).toBe('사과')
    expect(lines(spawnLog())).toHaveLength(1)
  })

  it('permission asks the screen and returns the answer to the same process', async () => {
    const s = open()
    const events: EngineEvent[] = []
    for await (const event of s.turn(ask('파일 써 줘'))) {
      events.push(event)
      if (event.type === 'permission') {
        expect(event.tool).toBe('Write')
        expect(event.target).toBe(join(realpathSync(dir), 'notes/a.md'))
        s.respond(event.id, true)
      }
    }
    expect(textOf(events)).toBe('허용됨')
    const denied: EngineEvent[] = []
    for await (const event of s.turn(ask('파일 써 줘'))) {
      denied.push(event)
      if (event.type === 'permission') s.respond(event.id, false)
    }
    expect(textOf(denied)).toBe('거절됨')
    expect(lines(spawnLog())).toHaveLength(1)
  })

  it('interrupt while an approval card waits denies it, ends the turn and keeps the process', async () => {
    const s = open()
    const events: EngineEvent[] = []
    for await (const event of s.turn(ask('파일 써 줘'))) {
      events.push(event)
      if (event.type === 'permission') s.interrupt()
    }
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: true })
    expect(existsSync(join(dir, 'notes/a.md'))).toBe(false)
    expect(textOf(await collect(s.turn(ask('안녕'))))).toBe('답: 안녕')
    expect(lines(spawnLog())).toHaveLength(1)
  })

  it('an approval answered through the pool engine reaches the open process', async () => {
    const sessions = createChatSessions({ open: (spec) => openClaudeSession(spec) })
    const base = { engine: 'claude' as const, cliPath: FAKE, mcp: [], userSettings: true }
    const run = async (answer: boolean): Promise<EngineEvent[]> => {
      const engine = sessions.engineFor('a', base, 'note')
      const events: EngineEvent[] = []
      for await (const event of engine.run({
        vaultDir: dir,
        prompt: '파일 써 줘',
        system: 'SYS'
      })) {
        events.push(event)
        if (event.type === 'permission') engine.respond?.(event.id, answer)
      }
      return events
    }
    try {
      expect(textOf(await run(true))).toBe('허용됨')
      expect(textOf(await run(false))).toBe('거절됨')
      expect(lines(spawnLog())).toHaveLength(1)
    } finally {
      sessions.closeAll()
    }
  })

  it('closes on conversation delete, vault switch and quit leave no claude process behind', async () => {
    const pids = join(dir, 'pids.log')
    process.env.FAKE_CLAUDE_PID_LOG = pids
    const sessions = createChatSessions({ open: (spec) => openClaudeSession(spec) })
    const base = { engine: 'claude' as const, cliPath: FAKE, mcp: [], userSettings: true }
    const other = join(dir, 'other')
    mkdirSync(other)
    const job = (vaultDir: string): IngestJob => ({ vaultDir, prompt: '안녕', system: 'SYS' })
    const alive = (pid: number): boolean => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    // 끄는 데 걸리는 시간은 머신마다 다르다 — 고정 대기 대신 2초까지 지켜본다
    const gone = async (pid: number): Promise<boolean> => {
      for (let waited = 0; waited < 2000 && alive(pid); waited += 50) {
        await new Promise((r) => setTimeout(r, 50))
      }
      return !alive(pid)
    }
    try {
      for (const [id, vault] of [
        ['a', dir],
        ['b', other],
        ['c', dir]
      ] as const) {
        await collect(sessions.engineFor(id, base, 'note').run(job(vault)))
      }
      const [a, b, c] = lines(pids).map(Number)
      expect([a, b, c].every(alive)).toBe(true)
      sessions.close('a')
      expect(await gone(a)).toBe(true)
      expect([alive(b), alive(c)]).toEqual([true, true])
      sessions.closeVault(other)
      expect(await gone(b)).toBe(true)
      expect(alive(c)).toBe(true)
      sessions.closeAll()
      expect(await gone(c)).toBe(true)
    } finally {
      sessions.closeAll()
      delete process.env.FAKE_CLAUDE_PID_LOG
    }
  })

  it('readonly turn denies write tools without asking and the next turn restores the mode', async () => {
    const s = open()
    await collect(s.turn(ask('안녕', { mode: 'all' })))
    const readonly = await collect(s.turn(ask('명령 실행해', { mode: 'all', readonly: true })))
    expect(readonly.some((e) => e.type === 'permission')).toBe(false)
    expect(textOf(readonly)).toBe('실행 못 함')
    await collect(s.turn(ask('안녕', { mode: 'all' })))
    expect(lines(controlLog()).filter((l) => l.startsWith('set_permission_mode'))).toEqual([
      'set_permission_mode bypassPermissions',
      'set_permission_mode default',
      'set_permission_mode bypassPermissions'
    ])
  })

  it('readonly turn blocks a write that a vault allow rule would let through', async () => {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'settings.json'), '{"permissions":{"allow":["Write"]}}')
    const s = open()
    const readonly = await collect(s.turn(ask('허용 규칙으로 써 줘', { readonly: true })))
    expect(textOf(readonly)).toBe('막힘')
    expect(existsSync(join(dir, 'notes', 'allowed.md'))).toBe(false)
    // 노트를 쓸 수 있는 턴에서는 허용 규칙대로 쓴다
    expect(textOf(await collect(s.turn(ask('허용 규칙으로 써 줘'))))).toBe('써짐')
    expect(existsSync(join(dir, 'notes', 'allowed.md'))).toBe(true)
  })

  it('timeout does not count while an approval card waits for the person', async () => {
    const s = open({}, 200)
    const events: EngineEvent[] = []
    for await (const event of s.turn(ask('파일 써 줘'))) {
      events.push(event)
      if (event.type === 'permission') setTimeout(() => s.respond(event.id, true), 500)
    }
    expect(textOf(events)).toBe('허용됨')
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })

  it('closes the process when an interrupt does not end the turn in time', async () => {
    session = openClaudeSession(
      {
        engine: 'claude',
        cliPath: FAKE,
        vaultDir: dir,
        system: 'SYS',
        mcp: [],
        userSettings: true
      },
      { interruptGraceMs: 100 }
    )
    const s = session
    process.env.FAKE_CLAUDE_IGNORE_INTERRUPT = '1'
    const events: EngineEvent[] = []
    for await (const event of s.turn(ask('천천히 세어'))) {
      events.push(event)
      if (event.type === 'text') s.interrupt()
    }
    delete process.env.FAKE_CLAUDE_IGNORE_INTERRUPT
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: true })
    expect(s.alive).toBe(false)
  })

  it('a timeout that has to close the process is a failure, not a stop', async () => {
    session = openClaudeSession(
      {
        engine: 'claude',
        cliPath: FAKE,
        vaultDir: dir,
        system: 'SYS',
        mcp: [],
        userSettings: true
      },
      { turnTimeoutMs: 300, interruptGraceMs: 100 }
    )
    process.env.FAKE_CLAUDE_IGNORE_INTERRUPT = '1'
    const events = await collect(session.turn(ask('조용히 있어')))
    delete process.env.FAKE_CLAUDE_IGNORE_INTERRUPT
    expect(events).toContainEqual({ type: 'error', message: engineTimedOut() })
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
  })

  it('a second turn while one runs says a question is already running', async () => {
    const s = open()
    const slow = collect(s.turn(ask('천천히 세어')))
    await new Promise((resolve) => setTimeout(resolve, 50))
    const second = await collect(s.turn(ask('안녕')))
    expect(second[0]).toEqual({ type: 'error', message: '이미 진행 중인 질문이 있어요' })
    s.interrupt()
    await slow
  })

  it('commands lists user skills and commands without builtins', async () => {
    const s = open()
    expect(await s.commands()).toEqual([
      { name: 'pdf2md-ingest' },
      { name: 'vault-reach', description: '보관함에서 찾는다' }
    ])
  })

  it('model change goes to the open process', async () => {
    const s = open({ model: 'claude-a' })
    await collect(s.turn(ask('안녕', { model: 'claude-a' })))
    await collect(s.turn(ask('안녕', { model: 'claude-b' })))
    expect(lines(controlLog())).toContain('set_model claude-b')
    expect(lines(spawnLog())).toHaveLength(1)
  })

  it('a resume of a session claude no longer has reads as an expired session', async () => {
    const s = open({ resume: 'gone' })
    const events = await collect(s.turn(ask('안녕')))
    const error = events.find((e) => e.type === 'error')
    expect(error?.type === 'error' && classifyEngineFailure(error.message)).toBe('session-expired')
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
    expect(s.alive).toBe(false)
  })

  it('an aside turn keeps to the vault — web tools are blocked, a readonly question may use them', async () => {
    const s = open()
    expect(textOf(await collect(s.turn(ask('웹 찾아', { readonly: true }))))).toBe('웹 씀')
    expect(textOf(await collect(s.turn(ask('웹 찾아', { readonly: true, offline: true }))))).toBe(
      '웹 막힘'
    )
  })

  it('a readonly turn lets only the app MCP servers through, not the user ones', async () => {
    const docs = {
      name: 'docs',
      enabled: true,
      kind: 'http' as const,
      command: '',
      args: [],
      env: {},
      url: 'http://127.0.0.1:1/mcp'
    }
    const s = open({ mcp: [docs] })
    expect(textOf(await collect(s.turn(ask('도구 mcp__docs__search', { readonly: true }))))).toBe(
      '씀'
    )
    expect(textOf(await collect(s.turn(ask('도구 mcp__mine__write', { readonly: true }))))).toBe(
      '막힘'
    )
  })

  it('/compact on the open process reports the compaction and keeps the process', async () => {
    const s = open()
    await collect(s.turn(ask('기억해 사과')))
    const events = await collect(s.turn(ask('/compact', { readonly: true, offline: true })))
    expect(events).toContainEqual({ type: 'compacted' })
    expect(doneOf(events)).toEqual({ type: 'done', ok: true, canceled: false })
    expect(lines(spawnLog())).toHaveLength(1)
  })

  it('claude too old to initialize asks for an update', async () => {
    process.env.FAKE_CLAUDE_OLD = '1'
    const s = open()
    const events = await collect(s.turn(ask('안녕')))
    const error = events.find((e) => e.type === 'error')
    expect(error?.type === 'error' && error.message.startsWith(claudeStartFailed())).toBe(true)
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
  })

  it('timeout interrupts a silent turn and keeps the process for the next question', async () => {
    const s = open({}, 300)
    const events = await collect(s.turn(ask('조용히 있어')))
    expect(events).toContainEqual({ type: 'error', message: engineTimedOut() })
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
    expect(textOf(await collect(s.turn(ask('안녕'))))).toBe('답: 안녕')
    expect(lines(spawnLog())).toHaveLength(1)
  })

  it('a process that dies mid-turn ends the turn with an error and is no longer alive', async () => {
    const s = open()
    const events = await collect(s.turn(ask('죽어')))
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(doneOf(events)).toEqual({ type: 'done', ok: false, canceled: false })
    expect(s.alive).toBe(false)
  })
})
