// Codex 채팅 세션 — `codex app-server` 하나를 대화 내내 켜 두고 thread 하나에 턴을 보낸다.
// 줄 모양은 JSON-RPC 와 같되 `jsonrpc` 필드가 없다: 요청 `{id, method, params}` · 응답 `{id, result|error}` · 알림 `{method, params}`.
// 실측(codex-cli 0.163.0, 2026-10-23): initialize 약 0.3초 · thread/start 약 2초 · 없는 thread 의 resume 은
// `-32600 no rollout found for thread id …`. 승인은 묻지 않는다(approvalPolicy never) — 범위는 sandbox 가 지킨다
import { mainT } from '../../i18n'
import type { ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { ChatImage, EngineEvent } from '../../../shared/ipc-contract'
import { DETAIL_MARK, classifyEngineFailure, layeredFailure } from '../../../shared/engine-failure'
import { spawnCli } from '../../cli/resolve-cli'
import { killGroup } from '../../cli/kill-group'
import { engineTimedOut } from '../../engine/cli-process'
import { codexMcpArgs } from '../../engine/mcp-args'
import { errorText } from '../../engine/codex-engine'
import {
  sessionBusy,
  sessionDied,
  createChannel,
  type Channel,
  type ChatSession,
  type SessionSpec,
  type SessionTurn
} from './chat-session'

/** app-server 가 없거나(옛 codex) 시작하자마자 끝났다 — 옛 `exec` 경로로 돌아가지 않고 업데이트를 권한다 */
export const codexUpdateRequired = (): string => mainT().chatSession.codexUpdateRequired

const TURN_TIMEOUT_MS = 10 * 60 * 1000
/** initialize·thread 열기가 이만큼 답이 없으면 끈다 — 실측 thread/start 약 2초, 느린 MCP 서버까지 넉넉히 */
const START_TIMEOUT_MS = 60_000
const INTERRUPT_GRACE_MS = 10_000
const STDERR_TAIL = 2000

const EXT: Record<ChatImage['mediaType'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

type Rpc = { id?: number | string; method?: string; params?: Record<string, unknown> }
type RpcReply = { id: number; result?: unknown; error?: { message?: string } }

type Turn = {
  channel: Channel<EngineEvent>
  id: string | null
  canceled: boolean
  timedOut: boolean
  /** 이 턴에 오류를 이미 알렸다 — 실패한 turn/completed 가 같은 사유를 다시 싣는다 */
  errored: boolean
  timer: NodeJS.Timeout | null
  /** turn/start 를 보냈다 — 그 전에 멈추면 보낼 것 없이 끝낸다 */
  sent: boolean
  /** turn/interrupt 를 보냈다 — 한 번만 */
  interruptSent: boolean
  /** `/compact` 턴 — 압축 알림만 오고 turn 알림이 없을 수 있다 */
  compact: boolean
  /** 압축을 이미 알렸다 — thread/compacted 와 contextCompaction item 이 둘 다 올 수 있다 */
  compacted: boolean
  /** 이 턴의 그림 파일 — 턴이 끝나면 지운다 */
  imageDir: string | null
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

export const openCodexSession = (
  spec: SessionSpec,
  options: { turnTimeoutMs?: number; interruptGraceMs?: number; startTimeoutMs?: number } = {}
): ChatSession => {
  const turnTimeoutMs = options.turnTimeoutMs ?? TURN_TIMEOUT_MS
  const startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS
  const graceMs = options.interruptGraceMs ?? INTERRUPT_GRACE_MS
  let alive = true
  let closed = false
  let initialized = false
  let stderr = ''
  let current: Turn | null = null
  let threadId: string | null = null
  /** 여는 중인 thread — 두 턴이 thread 를 두 번 열지 않게 */
  let threadReady: Promise<string> | null = null
  /** 이어 붙일 앞 thread — 한 번 실패하면 버리고 새 thread 를 연다 */
  let resumeId = spec.resume
  let nextId = 0
  const waiting = new Map<number, (reply: RpcReply) => void>()

  // 웹 검색은 채팅에서 켠다. 사용자 `~/.codex` 설정은 그대로 읽는다
  const child: ChildProcess = spawnCli(
    spec.cliPath,
    ['app-server', '-c', 'web_search="live"', ...codexMcpArgs(spec.mcp)],
    {
      cwd: spec.vaultDir,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    }
  )

  const write = (message: object): void => {
    if (child.stdin?.writable) child.stdin.write(JSON.stringify(message) + '\n')
  }

  const request = (method: string, params: object): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (!alive) return reject(new Error(stderr.trim() || 'codex exited'))
      const id = ++nextId
      waiting.set(id, (reply) => {
        if (reply.error) reject(new Error(reply.error.message ?? 'codex request failed'))
        else resolve(reply.result)
      })
      write({ id, method, params })
    })

  const endTurn = (done: { ok: boolean; canceled: boolean }): void => {
    const turn = current
    if (turn === null) return
    current = null
    if (turn.timer !== null) clearTimeout(turn.timer)
    turn.channel.push({ type: 'done', ...done })
    turn.channel.end()
    if (turn.imageDir !== null) void rm(turn.imageDir, { recursive: true, force: true })
  }

  const fail = (message: string): void => {
    current?.channel.push({ type: 'error', message })
    endTurn({ ok: false, canceled: false })
  }

  const close = (): void => {
    if (closed) return
    closed = true
    endTurn({ ok: false, canceled: true })
    child.stdin?.end()
    killGroup(child)
  }

  const interruptTurn = (turn: Turn): void => {
    if (turn.interruptSent) return
    turn.interruptSent = true
    const guard = setTimeout(() => {
      if (current !== turn) return
      if (turn.timedOut) endTurn({ ok: false, canceled: false })
      close()
    }, graceMs)
    guard.unref()
    if (threadId === null || turn.id === null) return
    request('turn/interrupt', { threadId, turnId: turn.id }).catch((error: unknown) => {
      console.error('codex interrupt request failed', error)
    })
  }

  const armTimer = (turn: Turn): void => {
    if (turn.timer !== null) clearTimeout(turn.timer)
    turn.timer = setTimeout(() => {
      turn.timedOut = true
      turn.channel.push({ type: 'error', message: engineTimedOut() })
      interruptTurn(turn)
    }, turnTimeoutMs)
    turn.timer.unref()
  }

  /** 압축 알림 — 턴 알림 없이 압축만 오면 그것으로 `/compact` 턴을 끝낸다 */
  const onCompacted = (turn: Turn): void => {
    if (!turn.compacted) {
      turn.compacted = true
      turn.channel.push({ type: 'compacted' })
    }
    if (turn.compact && turn.id === null) endTurn({ ok: true, canceled: false })
  }

  /** turn id 를 알았다 — 그 전에 멈춤을 눌렀으면 지금 보낸다 */
  const knowTurn = (turn: Turn, id: string): void => {
    turn.id = id
    if (turn.canceled) interruptTurn(turn)
  }

  /** 알림 하나를 도는 턴의 이벤트로 옮긴다 */
  const onNotification = (method: string, params: Record<string, unknown>): void => {
    const turn = current
    if (turn === null) return
    // 보내기 전 알림(MCP 시작 상태 등)은 시작 타이머를 늦추지 않는다
    if (turn.sent) armTimer(turn)
    const item = (params['item'] ?? {}) as Record<string, unknown>
    switch (method) {
      case 'turn/started': {
        const id = (params['turn'] as { id?: unknown } | undefined)?.id
        if (typeof id === 'string' && turn.id === null) knowTurn(turn, id)
        return
      }
      case 'item/agentMessage/delta': {
        const delta = asText(params['delta'])
        if (delta !== '') turn.channel.push({ type: 'text', text: delta })
        return
      }
      case 'item/reasoning/summaryTextDelta': {
        const delta = asText(params['delta'])
        if (delta !== '') turn.channel.push({ type: 'thinking', text: delta })
        return
      }
      case 'item/completed':
        if (item['type'] === 'contextCompaction') onCompacted(turn)
        return
      case 'item/started':
        if (item['type'] === 'contextCompaction') {
          onCompacted(turn)
        } else if (item['type'] === 'commandExecution') {
          turn.channel.push({ type: 'tool', name: 'command', target: asText(item['command']) })
        } else if (item['type'] === 'mcpToolCall') {
          turn.channel.push({ type: 'tool', name: asText(item['tool']), target: '' })
        } else if (item['type'] === 'fileChange') {
          for (const change of (item['changes'] ?? []) as { path?: unknown }[]) {
            if (typeof change.path === 'string') {
              turn.channel.push({ type: 'file-change', path: change.path })
            }
          }
        }
        return
      case 'thread/compacted':
        onCompacted(turn)
        return
      case 'error': {
        // 다시 시도하는 오류는 지나간다 — 끝내 실패하면 turn/completed 가 failed 로 온다
        if (params['willRetry'] === true) return
        const raw = asText((params['error'] as { message?: unknown } | undefined)?.message)
        if (raw === '') return
        turn.errored = true
        turn.channel.push({ type: 'error', message: layeredFailure(errorText(raw)) })
        return
      }
      case 'turn/completed': {
        const done = (params['turn'] ?? {}) as { status?: unknown; error?: { message?: unknown } }
        if (turn.canceled || done.status === 'interrupted') {
          endTurn({ ok: false, canceled: !turn.timedOut })
        } else if (done.status === 'failed') {
          const message = errorText(asText(done.error?.message))
          // error 알림이 이미 같은 사유를 냈으면 한 번만 보인다
          if (!turn.errored) fail(layeredFailure(message))
          else endTurn({ ok: false, canceled: false })
        } else {
          endTurn({ ok: true, canceled: false })
        }
        return
      }
    }
  }

  createInterface({ input: child.stdout! }).on('line', (line) => {
    let message: Rpc & RpcReply
    try {
      message = JSON.parse(line) as Rpc & RpcReply
    } catch {
      return
    }
    if (message.method !== undefined && message.id !== undefined) {
      // 서버가 묻는 요청 — 승인 없이 도는 thread 라 승인 요청은 오지 않는다. 사용자 MCP 서버의 입력 요청은
      // 사양대로 거절하고, 나머지는 다루지 않는다고 답해 기다리지 않게 한다
      if (message.method === 'mcpServer/elicitation/request') {
        write({ id: message.id, result: { action: 'decline', content: null, _meta: null } })
      } else {
        write({
          id: message.id,
          error: { code: -32601, message: 'request not handled by the app' }
        })
      }
      return
    }
    if (message.method !== undefined) {
      onNotification(message.method, message.params ?? {})
      return
    }
    if (typeof message.id === 'number') {
      const done = waiting.get(message.id)
      waiting.delete(message.id)
      done?.(message)
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL)
  })
  const ended = (cause: string): void => {
    if (!alive) return
    alive = false
    for (const done of waiting.values()) done({ id: 0, error: { message: cause } })
    waiting.clear()
    if (closed) return
    const detail = stderr.trim() || cause
    fail(`${initialized ? sessionDied() : codexUpdateRequired()}${DETAIL_MARK}${detail}`)
  }
  child.on('error', (error) => ended(error.message))
  child.on('exit', (code) => ended(`codex exited (${code ?? 'signal'})`))
  child.stdin?.on('error', () => undefined)

  const ready = request('initialize', {
    clientInfo: { name: '2nd-brain', title: null, version: '1' },
    capabilities: null
  }).then(() => {
    initialized = true
    write({ method: 'initialized' })
  })
  // 시작 실패는 첫 턴이 알린다 — 여기서는 처리되지 않은 거절로 남기지 않는다
  ready.catch(() => undefined)

  /** thread 를 처음 한 번 연다 — resume 이면 앞 대화를 붙인다 */
  const openThread = (sandbox: string): Promise<string> => {
    if (threadReady !== null) return threadReady
    threadReady = startThread(sandbox).catch((error: unknown) => {
      // 실패한 열기는 기억하지 않는다. 앞 thread 가 사라졌을 때만 버린다 — 그 밖의 실패는 다음 턴이 같은 thread 를 다시 붙인다
      threadReady = null
      const raw = error instanceof Error ? error.message : String(error)
      if (classifyEngineFailure(raw) === 'session-expired') resumeId = undefined
      throw error
    })
    return threadReady
  }

  const startThread = async (sandbox: string): Promise<string> => {
    const common = {
      cwd: spec.vaultDir,
      approvalPolicy: 'never',
      sandbox,
      developerInstructions: spec.system,
      ...(spec.model ? { model: spec.model } : {})
    }
    const result = (await (resumeId
      ? request('thread/resume', { threadId: resumeId, ...common })
      : request('thread/start', common))) as { thread?: { id?: unknown } }
    const id = result.thread?.id
    if (typeof id !== 'string') throw new Error('codex returned no thread id')
    threadId = id
    return id
  }

  const imagesFor = async (turn: Turn, images: ChatImage[]): Promise<object[]> => {
    if (images.length === 0) return []
    turn.imageDir = await mkdtemp(join(tmpdir(), '2nd-brain-image-'))
    return Promise.all(
      images.map(async (image, i) => {
        const path = join(turn.imageDir!, `${i + 1}.${EXT[image.mediaType]}`)
        await writeFile(path, Buffer.from(image.data, 'base64'))
        return { type: 'localImage', path }
      })
    )
  }

  return {
    get alive() {
      return alive && !closed
    },
    get busy() {
      return current !== null
    },
    async *turn(turn: SessionTurn): AsyncGenerator<EngineEvent> {
      if (current !== null) {
        yield { type: 'error', message: sessionBusy() }
        yield { type: 'done', ok: false, canceled: false }
        return
      }
      if (!alive || closed) {
        yield { type: 'error', message: sessionDied() }
        yield { type: 'done', ok: false, canceled: false }
        return
      }
      const channel = createChannel<EngineEvent>()
      const state: Turn = {
        channel,
        id: null,
        canceled: false,
        timedOut: false,
        errored: false,
        timer: null,
        sent: false,
        interruptSent: false,
        compact: turn.prompt.trim() === '/compact',
        compacted: false,
        imageDir: null
      }
      current = state
      // 시작이 멈춰 있으면(initialize·thread 열기 무응답) 기다리지 않고 끈다 — 풀이 다음 질문에 다시 연다
      state.timer = setTimeout(() => {
        if (current !== state || state.sent) return
        fail(
          initialized
            ? engineTimedOut()
            : `${codexUpdateRequired()}${DETAIL_MARK}codex did not answer the start request`
        )
        close()
      }, startTimeoutMs)
      state.timer.unref()
      // 노트 쓰기는 보관함 안만 쓰고, 읽기 전용 턴(위키화 중·곁일)은 읽기만 — 턴마다 sandbox 를 정한다
      const sandboxPolicy = turn.readonly
        ? { type: 'readOnly', networkAccess: false }
        : {
            type: 'workspaceWrite',
            writableRoots: [spec.vaultDir],
            networkAccess: false,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false
          }
      void (async () => {
        try {
          await ready
          const thread = await openThread(turn.readonly ? 'read-only' : 'workspace-write')
          if (current !== state) return
          state.channel.push({ type: 'session', id: thread })
          state.sent = true
          armTimer(state)
          if (state.compact) {
            // 압축은 질문이 아니라 thread 에 거는 요청이다 — 끝은 turn/completed 로 온다
            await request('thread/compact/start', { threadId: thread })
            return
          }
          const images = await imagesFor(state, turn.images ?? [])
          if (current !== state) {
            // 그림을 쓰는 사이 턴이 끝났다 — 남은 그림을 지운다
            if (state.imageDir !== null) void rm(state.imageDir, { recursive: true, force: true })
            return
          }
          const started = (await request('turn/start', {
            threadId: thread,
            input: [{ type: 'text', text: turn.prompt, text_elements: [] }, ...images],
            sandboxPolicy,
            ...(turn.model ? { model: turn.model } : {})
          })) as { turn?: { id?: unknown } }
          if (typeof started.turn?.id === 'string' && state.id === null && current === state) {
            knowTurn(state, started.turn.id)
          }
        } catch (error) {
          if (current !== state) return
          const raw = error instanceof Error ? error.message : String(error)
          fail(initialized ? layeredFailure(raw) : `${codexUpdateRequired()}${DETAIL_MARK}${raw}`)
        }
      })()
      yield* channel
    },
    interrupt() {
      const turn = current
      if (turn === null || turn.canceled) return
      turn.canceled = true
      // 아직 보낸 질문이 없다(시작·thread 여는 중) — 멈출 것 없이 끝낸다
      if (!turn.sent) return endTurn({ ok: false, canceled: true })
      // 보냈지만 turn id 를 아직 모른다 — 알게 되면 knowTurn 이 멈춤을 보낸다
      if (turn.id !== null) interruptTurn(turn)
    },
    respond() {
      // 승인 없이 도는 thread — 기다리는 요청이 없다
    },
    commands: () => Promise.resolve([]),
    close
  }
}
