// 켜 둔 채팅 세션 풀 — 대화 id 마다 세션 하나. 쉬는 세션을 포함해 최대 3개, 10분 쉬면 끈다.
// 채팅 서비스에는 턴 하나짜리 `Engine` 으로 보인다 — 서비스는 프로세스가 켜져 있는지 모른다
import type { ChatSkill, EngineEvent } from '../../../shared/ipc-contract'
import type { McpServer } from '../../../shared/mcp-servers'
import type { EngineKind } from '../../../shared/engine-settings'
import type { Engine, IngestJob } from '../../engine/engine'
import { sessionKey, type ChatSession, type OpenSession, type SessionSpec } from './chat-session'

/** 질문마다 같은 것 — 엔진 CLI·모델·MCP. 보관함·system 은 턴(job)에서 온다 */
export type SessionBase = {
  engine: EngineKind
  cliPath: string
  mcp: McpServer[]
  userSettings: boolean
  model?: string
}

/** 채팅 서비스가 부르는 용도 — chat 은 읽기 전용 턴, note 는 노트를 쓸 수 있는 턴, aside 는 압축 */
export type SessionUse = 'chat' | 'note' | 'aside'

export type ChatSessions = {
  engineFor: (conversationId: string, base: SessionBase, use: SessionUse) => Engine
  /** `/` 목록 — 그 보관함의 열린 세션에 묻고, 없으면 새 대화가 이어받을 세션을 하나 미리 연다 */
  commands: (base: SessionBase & { vaultDir: string; system: string }) => Promise<ChatSkill[]>
  close: (conversationId: string) => void
  closeVault: (vaultDir: string) => void
  closeAll: () => void
  /** 켜 둔 세션 수 */
  size: () => number
}

type Entry = {
  key: string
  vaultDir: string
  session: ChatSession
  usedAt: number
  idleTimer: NodeJS.Timeout | null
}

const IDLE_MS = 10 * 60 * 1000
const MAX_OPEN = 3
/** 아직 대화가 이어받지 않은 세션의 자리 이름 — `/` 목록을 받으며 연 것 */
const SPARE = 'spare:'

export const createChatSessions = (options: {
  open: OpenSession
  idleMs?: number
  max?: number
}): ChatSessions => {
  const idleMs = options.idleMs ?? IDLE_MS
  const max = options.max ?? MAX_OPEN
  const entries = new Map<string, Entry>()
  let clock = 0

  const drop = (id: string): void => {
    const entry = entries.get(id)
    if (entry === undefined) return
    entries.delete(id)
    if (entry.idleTimer !== null) clearTimeout(entry.idleTimer)
    entry.session.close()
  }

  const rest = (id: string, entry: Entry): void => {
    entry.usedAt = ++clock
    if (entry.idleTimer !== null) clearTimeout(entry.idleTimer)
    entry.idleTimer = setTimeout(() => {
      if (entries.get(id) === entry && !entry.session.busy) drop(id)
    }, idleMs)
    entry.idleTimer.unref()
  }

  /** 넘치면 쉬는 것 중 가장 오래 안 쓴 것부터 끈다 — 도는 세션은 끄지 않는다(끝난 뒤 다시 본다) */
  const evict = (keep: string): void => {
    while (entries.size > max) {
      const idle = [...entries].filter(([id, e]) => id !== keep && !e.session.busy)
      if (idle.length === 0) return
      idle.sort(([, a], [, b]) => a.usedAt - b.usedAt)
      drop(idle[0][0])
    }
  }

  const openEntry = (id: string, spec: SessionSpec): Entry => {
    const entry: Entry = {
      key: sessionKey(spec),
      vaultDir: spec.vaultDir,
      session: options.open(spec),
      usedAt: ++clock,
      idleTimer: null
    }
    entries.set(id, entry)
    evict(id)
    return entry
  }

  /** 대화의 세션 — 열 때 정한 것이 바뀌었거나 죽었으면 다시 연다. 새 대화는 미리 연 세션을 이어받는다 */
  const sessionFor = (id: string, spec: SessionSpec): Entry => {
    const key = sessionKey(spec)
    const found = entries.get(id)
    if (found !== undefined && found.key === key && found.session.alive) return found
    if (found !== undefined) drop(id)
    const spare = entries.get(SPARE + key)
    if (spec.resume === undefined && spare !== undefined && spare.session.alive) {
      entries.delete(SPARE + key)
      entries.set(id, spare)
      return spare
    }
    return openEntry(id, spec)
  }

  const engineFor = (id: string, base: SessionBase, use: SessionUse): Engine => {
    let canceled = false
    let entry: Entry | null = null
    return {
      async *run(job: IngestJob): AsyncGenerator<EngineEvent> {
        if (canceled) {
          yield { type: 'done', ok: false, canceled: true }
          return
        }
        const spec: SessionSpec = {
          engine: base.engine,
          cliPath: base.cliPath,
          vaultDir: job.vaultDir,
          system: job.system ?? '',
          mcp: base.mcp,
          userSettings: base.userSettings,
          ...(base.model ? { model: base.model } : {}),
          ...(job.resume ? { resume: job.resume } : {})
        }
        const current = sessionFor(id, spec)
        entry = current
        if (current.idleTimer !== null) clearTimeout(current.idleTimer)
        try {
          yield* current.session.turn({
            prompt: job.prompt,
            images: job.images,
            mode: job.mode ?? 'ask',
            readonly: use !== 'note',
            offline: use === 'aside',
            model: base.model
          })
        } finally {
          // 같은 대화의 다른 턴(압축 등)이 아직 돌면 그 턴이 끝날 때 쉰다
          if (entries.get(id) === current && !current.session.busy) {
            if (current.session.alive) rest(id, current)
            else drop(id)
          }
          // 다 돌던 중에 넘쳐 열었으면 지금 끝난 것도 후보다 — 쉬는 것 중 가장 오래 안 쓴 것부터
          evict('')
        }
      },
      cancel() {
        canceled = true
        entry?.session.interrupt()
      },
      respond(requestId, allow) {
        entry?.session.respond(requestId, allow)
      }
    }
  }

  const commands = async (
    base: SessionBase & { vaultDir: string; system: string }
  ): Promise<ChatSkill[]> => {
    const key = sessionKey(base)
    const open = [...entries].find(([, e]) => e.key === key && e.session.alive)
    if (open !== undefined) return open[1].session.commands()
    const id = SPARE + key
    // 이 보관함의 미리 연 세션은 하나만 — 죽었거나 설정이 바뀌어 아무도 이어받지 못할 것은 치우고 새로 연다
    for (const [other, e] of [...entries]) {
      if (other.startsWith(SPARE) && e.vaultDir === base.vaultDir) drop(other)
    }
    const spare = openEntry(id, {
      engine: base.engine,
      cliPath: base.cliPath,
      vaultDir: base.vaultDir,
      system: base.system,
      mcp: base.mcp,
      userSettings: base.userSettings,
      ...(base.model ? { model: base.model } : {})
    })
    rest(id, spare)
    return spare.session.commands()
  }

  return {
    engineFor,
    commands,
    close: drop,
    closeVault: (vaultDir) => {
      for (const [id, entry] of [...entries]) if (entry.vaultDir === vaultDir) drop(id)
    },
    closeAll: () => {
      for (const id of [...entries.keys()]) drop(id)
    },
    size: () => entries.size
  }
}
