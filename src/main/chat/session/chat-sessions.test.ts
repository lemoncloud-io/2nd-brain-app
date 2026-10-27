import { describe, expect, it } from 'vitest'
import type { EngineEvent } from '../../../shared/ipc-contract'
import type { IngestJob } from '../../engine/engine'
import type { ChatSession, SessionSpec, SessionTurn } from './chat-session'
import { createChatSessions } from './chat-sessions'

type Fake = ChatSession & {
  spec: SessionSpec
  turns: SessionTurn[]
  closed: boolean
  kill: () => void
  /** 턴을 끝내지 않고 붙잡는다 — release 로 푼다 */
  hold: () => void
  release: () => void
}

const fakeOpen = (): { open: (spec: SessionSpec) => Fake; opened: Fake[] } => {
  const opened: Fake[] = []
  const open = (spec: SessionSpec): Fake => {
    let alive = true
    let busy = false
    let held: Promise<void> | null = null
    let releaseHold: (() => void) | null = null
    const fake: Fake = {
      spec,
      turns: [],
      closed: false,
      get alive() {
        return alive && !fake.closed
      },
      get busy() {
        return busy
      },
      async *turn(turn): AsyncGenerator<EngineEvent> {
        fake.turns.push(turn)
        busy = true
        if (held !== null) await held
        busy = false
        yield { type: 'text', text: `답 ${fake.turns.length}` }
        yield { type: 'done', ok: alive, canceled: false }
      },
      interrupt: () => undefined,
      respond: () => undefined,
      commands: async () => [{ name: `skill-${opened.indexOf(fake)}` }],
      close: () => {
        fake.closed = true
      },
      kill: () => {
        alive = false
      },
      hold: () => {
        held = new Promise((resolve) => (releaseHold = resolve))
      },
      release: () => {
        releaseHold?.()
        held = null
      }
    }
    opened.push(fake)
    return fake
  }
  return { open, opened }
}

const base = { engine: 'claude' as const, cliPath: '/bin/claude', mcp: [], userSettings: true }
const job = (extra: Partial<IngestJob> = {}): IngestJob => ({
  vaultDir: '/vault',
  prompt: '질문',
  system: 'SYS',
  ...extra
})

const drain = async (events: AsyncIterable<EngineEvent>): Promise<EngineEvent[]> => {
  const out: EngineEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('createChatSessions', () => {
  it('one conversation keeps one session across turns', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    await drain(sessions.engineFor('a', base, 'note').run(job({ resume: 'sess-1' })))
    await drain(sessions.engineFor('a', base, 'note').run(job({ resume: 'sess-1' })))
    expect(opened).toHaveLength(1)
    expect(opened[0].spec.resume).toBe('sess-1')
    expect(opened[0].turns.map((t) => t.readonly)).toEqual([false, false])
  })

  it('chat use is a readonly turn on the same session', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    await drain(sessions.engineFor('a', base, 'note').run(job()))
    await drain(sessions.engineFor('a', base, 'chat').run(job()))
    expect(opened).toHaveLength(1)
    expect(opened[0].turns.map((t) => t.readonly)).toEqual([false, true])
  })

  it('aside use (compact) is a readonly turn without web tools', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    await drain(sessions.engineFor('a', base, 'chat').run(job()))
    await drain(sessions.engineFor('a', base, 'aside').run(job()))
    expect(opened[0].turns.map((t) => [t.readonly, t.offline])).toEqual([
      [true, false],
      [true, true]
    ])
  })

  it('keeps at most three open, closing the least recently used idle one', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    for (const id of ['a', 'b', 'c']) await drain(sessions.engineFor(id, base, 'note').run(job()))
    await drain(sessions.engineFor('a', base, 'note').run(job()))
    await drain(sessions.engineFor('d', base, 'note').run(job()))
    expect(sessions.size()).toBe(3)
    expect(opened.map((s) => s.closed)).toEqual([false, true, false, false])
  })

  it('never closes a session whose turn is running; the extra one closes after it ends', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    for (const id of ['a', 'b', 'c']) await drain(sessions.engineFor(id, base, 'note').run(job()))
    for (const s of opened) s.hold()
    const running = ['a', 'b', 'c'].map((id) =>
      drain(sessions.engineFor(id, base, 'note').run(job()))
    )
    await wait(0)
    // 셋 다 도는 중에 넷째가 온다 — 기다리지 않고 열고, 먼저 끝나는 것(여기서는 넷째)을 끈다
    await drain(sessions.engineFor('d', base, 'note').run(job()))
    expect(opened.slice(0, 3).some((s) => s.closed)).toBe(false)
    expect(opened[3].closed).toBe(true)
    expect(sessions.size()).toBe(3)
    for (const s of opened) s.release()
    await Promise.all(running)
  })

  it('closes a session after it rests for the idle time', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open, idleMs: 20 })
    await drain(sessions.engineFor('a', base, 'note').run(job()))
    await wait(60)
    expect(opened[0].closed).toBe(true)
    expect(sessions.size()).toBe(0)
  })

  it('reopens with resume when the process died between turns', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    await drain(sessions.engineFor('a', base, 'note').run(job()))
    opened[0].kill()
    const events = await drain(sessions.engineFor('a', base, 'note').run(job({ resume: 'sess-9' })))
    expect(opened).toHaveLength(2)
    expect(opened[1].spec.resume).toBe('sess-9')
    expect(events).toContainEqual({ type: 'text', text: '답 1' })
  })

  it('reopens when the vault or system prompt changes', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    await drain(sessions.engineFor('a', base, 'note').run(job()))
    await drain(sessions.engineFor('a', base, 'note').run(job({ system: 'SYS2' })))
    expect(opened).toHaveLength(2)
    expect(opened[0].closed).toBe(true)
    // 보관함이 바뀌면 옛 보관함 프로세스는 새 보관함 질문을 받지 않는다
    await drain(
      sessions.engineFor('a', base, 'note').run(job({ system: 'SYS2', vaultDir: '/other' }))
    )
    expect(opened).toHaveLength(3)
    expect(opened[2].spec.vaultDir).toBe('/other')
    expect(opened[1].closed).toBe(true)
  })

  it('reopens when the user claude settings switch changes', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    await drain(sessions.engineFor('a', base, 'note').run(job()))
    await drain(sessions.engineFor('a', { ...base, userSettings: false }, 'note').run(job()))
    expect(opened).toHaveLength(2)
    expect(opened[1].spec.userSettings).toBe(false)
    expect(opened[0].closed).toBe(true)
  })

  it('closes on conversation delete, vault switch and quit', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    await drain(sessions.engineFor('a', base, 'note').run(job()))
    await drain(sessions.engineFor('b', base, 'note').run(job({ vaultDir: '/other' })))
    await drain(sessions.engineFor('c', base, 'note').run(job()))
    sessions.close('a')
    expect(opened[0].closed).toBe(true)
    sessions.closeVault('/other')
    expect(opened[1].closed).toBe(true)
    sessions.closeAll()
    expect(opened.every((s) => s.closed)).toBe(true)
    expect(sessions.size()).toBe(0)
  })

  it('commands opens a spare session that the next new conversation takes over', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    expect(await sessions.commands({ ...base, vaultDir: '/vault', system: 'SYS' })).toEqual([
      { name: 'skill-0' }
    ])
    await drain(sessions.engineFor('a', base, 'note').run(job()))
    expect(opened).toHaveLength(1)
    expect(await sessions.commands({ ...base, vaultDir: '/vault', system: 'SYS' })).toEqual([
      { name: 'skill-0' }
    ])
    expect(opened).toHaveLength(1)
  })

  it('a new spare for the same vault closes the spare whose key went stale', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    await sessions.commands({ ...base, vaultDir: '/vault', system: 'SYS' })
    await sessions.commands({ ...base, userSettings: false, vaultDir: '/vault', system: 'SYS' })
    expect(opened).toHaveLength(2)
    expect(opened[0].closed).toBe(true)
    expect(sessions.size()).toBe(1)
  })

  it('cancel before the turn starts ends it without opening a process', async () => {
    const { open, opened } = fakeOpen()
    const sessions = createChatSessions({ open })
    const engine = sessions.engineFor('a', base, 'note')
    engine.cancel()
    expect(await drain(engine.run(job()))).toEqual([{ type: 'done', ok: false, canceled: true }])
    expect(opened).toHaveLength(0)
  })
})
