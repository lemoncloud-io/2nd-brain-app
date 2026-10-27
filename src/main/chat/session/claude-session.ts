// Claude 채팅 세션 — Agent SDK `query()` 하나를 대화 내내 켜 두고 메시지 채널로 턴을 넣는다.
// claude 는 사용자 PC 의 것을 띄운다(SDK 가 받는 플랫폼 실행 파일은 앱에 싣지 않는다).
// 실측(claude 2.1.309 · SDK 0.3.309, 2026-10-23): 두 턴 기억 · setModel · `/compact` 뒤 compact_boundary ·
// interrupt 뒤에도 프로세스가 살아 다음 턴을 받는다. SessionStart 훅은 프로세스당 한 번 돈다
import { mainT } from '../../i18n'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type {
  CanUseTool,
  HookCallback,
  Options,
  PermissionMode,
  PermissionResult,
  Query,
  SDKUserMessage,
  SpawnedProcess
} from '@anthropic-ai/claude-agent-sdk'
import type { ChatSkill, EngineEvent } from '../../../shared/ipc-contract'
import type { ChatPermissionMode } from '../../../shared/chat-permission'
import { DETAIL_MARK, layeredFailure } from '../../../shared/engine-failure'
import { cliEnv, spawnCli } from '../../cli/resolve-cli'
import { killGroup } from '../../cli/kill-group'
import { engineTimedOut } from '../../engine/cli-process'
import {
  makeParseMessage,
  suggestedRule,
  toolTarget,
  userContent
} from '../../engine/claude-engine'
import {
  sessionBusy,
  sessionDied,
  createChannel,
  type Channel,
  type ChatSession,
  type SessionSpec,
  type SessionTurn
} from './chat-session'

type Sdk = typeof import('@anthropic-ai/claude-agent-sdk')

// main 은 CJS 번들이고 SDK 는 ESM 전용이다 — 동적 import 는 번들에서 네이티브 import() 로 남는다(pdf-text.ts 와 같다)
const loadSdk = (): Promise<Sdk> => import('@anthropic-ai/claude-agent-sdk')

const PERMISSION_MODE: Record<ChatPermissionMode, PermissionMode> = {
  ask: 'default',
  edits: 'acceptEdits',
  all: 'bypassPermissions'
}

/** 읽기 전용 턴에 허용하는 도구 — MCP 도구는 따로 허용한다 */
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch'])
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', ...WEB_TOOLS])

/** 답할 화면이 없는 도구 */
const DISALLOWED = ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode']

/** 턴 하나가 아무 출력 없이 이만큼 지나면 멈춘다 */
const TURN_TIMEOUT_MS = 10 * 60 * 1000

const STDERR_TAIL = 2000

export const claudeStartFailed = (): string => mainT().chatSession.claudeStartFailed
/** SDK 자체를 못 불렀다 — 앱 설치가 깨진 것이지 claude 버전 탓이 아니다 */
export const claudeConnectFailed = (): string => mainT().chatSession.claudeConnectFailed
// ui-hangul-ignore: AI 에게 보내는 거절 사유(범위 밖: AI 프롬프트)
const NO_TURN_DENIED = '도는 질문이 없다'
// ui-hangul-ignore: AI 에게 보내는 거절 사유(범위 밖: AI 프롬프트)
const STOPPED_DENIED = '멈췄다'
// ui-hangul-ignore: AI 에게 보내는 거절 사유(범위 밖: AI 프롬프트)
const USER_DENIED = '사용자가 이 도구 사용을 허용하지 않았다'
// ui-hangul-ignore: AI 에게 보내는 거절 사유(범위 밖: AI 프롬프트)
const READONLY_DENIED = '지금은 읽기 전용이다 — 파일을 바꾸거나 명령을 실행하지 않는다'

/** 멈추라고 한 뒤 이만큼 지나도 턴이 안 끝나면 프로세스째 끈다 — 풀이 다음 질문에 다시 연다 */
const INTERRUPT_GRACE_MS = 10_000

type Turn = {
  channel: Channel<EngineEvent>
  readonly: boolean
  offline: boolean
  /** 사용자 메시지를 보냈다 — 그 전의 실패는 시작 실패다 */
  sent: boolean
  canceled: boolean
  timedOut: boolean
  timer: NodeJS.Timeout | null
}

export type ClaudeSessionOptions = {
  sdk?: () => Promise<Sdk>
  turnTimeoutMs?: number
  interruptGraceMs?: number
}

export const openClaudeSession = (
  spec: SessionSpec,
  options: ClaudeSessionOptions = {}
): ChatSession => {
  const turnTimeoutMs = options.turnTimeoutMs ?? TURN_TIMEOUT_MS
  const graceMs = options.interruptGraceMs ?? INTERRUPT_GRACE_MS
  const inbox: SDKUserMessage[] = []
  let wakeInbox: (() => void) | null = null
  let closed = false
  let alive = true
  let initialized = false
  let current: Turn | null = null
  let mode: PermissionMode = 'default'
  let model = spec.model
  let child: ChildProcess | null = null
  let live: Query | null = null
  let stderr = ''
  const pending = new Map<string, (allow: boolean) => void>()
  const parse = makeParseMessage()

  async function* prompt(): AsyncGenerator<SDKUserMessage> {
    while (!closed) {
      const next = inbox.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      await new Promise<void>((resolve) => (wakeInbox = resolve))
      wakeInbox = null
    }
  }

  const settleAll = (): void => {
    for (const settle of [...pending.values()]) settle(false)
  }

  const endTurn = (done: { ok: boolean; canceled: boolean }): void => {
    const turn = current
    if (turn === null) return
    current = null
    if (turn.timer !== null) clearTimeout(turn.timer)
    settleAll()
    turn.channel.push({ type: 'done', ...done })
    turn.channel.end()
  }

  const fail = (message: string): void => {
    current?.channel.push({ type: 'error', message })
    endTurn({ ok: false, canceled: false })
  }

  /** 프로세스가 끝났거나 못 떴다 — 열기 전이면 시작 실패(구버전 claude), 연 뒤면 멈춤. 원인은 접어 둔다 */
  const failWith = (cause: string): void => {
    const detail = cause.trim() || 'claude exited'
    fail(`${initialized ? sessionDied() : claudeStartFailed()}${DETAIL_MARK}${detail}`)
  }

  const close = (): void => {
    if (closed) return
    closed = true
    wakeInbox?.()
    endTurn({ ok: false, canceled: true })
    live?.close()
    if (child !== null) killGroup(child)
  }

  /** 멈춤 요청 — 시간 안에 턴이 끝나지 않거나 요청이 실패하면 프로세스째 끈다(남은 출력이 다음 턴에 섞이지 않게) */
  const interruptTurn = (turn: Turn): void => {
    const shut = (): void => {
      if (current !== turn) return
      // 시간 초과로 끄는 것은 사람이 누른 멈춤이 아니다
      if (turn.timedOut) endTurn({ ok: false, canceled: false })
      close()
    }
    const guard = setTimeout(shut, graceMs)
    guard.unref()
    const q = live
    if (q === null) return
    q.interrupt().catch((error: unknown) => {
      console.error('claude interrupt request failed', error)
      shut()
    })
  }

  /** 출력이 끊긴 채 시간이 지나면 멈춘다 — 사람이 승인 카드를 보는 동안은 세지 않는다 */
  const armTimer = (turn: Turn): void => {
    if (turn.timer !== null) clearTimeout(turn.timer)
    turn.timer = null
    if (pending.size > 0) return
    turn.timer = setTimeout(() => {
      turn.timedOut = true
      turn.channel.push({ type: 'error', message: engineTimedOut() })
      interruptTurn(turn)
    }, turnTimeoutMs)
    turn.timer.unref()
  }

  const enabledMcp = spec.mcp.filter((s) => s.enabled)
  // 읽기 전용 턴의 MCP 는 앱 설정에 켠 서버만 — 사용자 설정(`~/.claude`)의 서버는 쓰기 도구일 수 있다
  const appMcp = enabledMcp.map((s) => `mcp__${s.name}__`)
  const isReadTool = (name: string): boolean =>
    READ_TOOLS.has(name) || appMcp.some((prefix) => name.startsWith(prefix))
  /** 읽기 전용 턴이 쓸 수 있는 도구 — 곁일 턴은 웹 도구도 뺀다 */
  const readable = (turn: Turn, name: string): boolean =>
    isReadTool(name) && !(turn.offline && WEB_TOOLS.has(name))

  // 읽기 전용 턴 — 허용 규칙(사용자·보관함 settings)보다 먼저 도는 훅에서 막는다. canUseTool 은 허용 규칙에
  // 걸린 도구에는 불리지 않는다(실측 claude 2.1.309: 보관함 allow Write 면 canUseTool 없이 파일이 써졌다)
  const readonlyGuard: HookCallback = (input) => {
    const turn = current
    if (turn === null || !turn.readonly || input.hook_event_name !== 'PreToolUse') {
      return Promise.resolve({})
    }
    if (readable(turn, input.tool_name)) return Promise.resolve({})
    return Promise.resolve({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: READONLY_DENIED
      }
    })
  }

  const canUseTool: CanUseTool = (toolName, input, { signal, suggestions }) => {
    const turn = current
    const allowed: PermissionResult = { behavior: 'allow', updatedInput: input }
    if (turn === null) return Promise.resolve({ behavior: 'deny', message: NO_TURN_DENIED })
    // 멈춘 턴에 늦게 온 요청 — 카드를 띄우지 않는다
    if (turn.canceled) return Promise.resolve({ behavior: 'deny', message: STOPPED_DENIED })
    if (turn.readonly) {
      // 훅을 지나온 것은 읽기 도구·앱 MCP 뿐이다 — 묻지 않고 쓴다
      if (readable(turn, toolName)) return Promise.resolve(allowed)
      return Promise.resolve({ behavior: 'deny', message: READONLY_DENIED })
    }
    if (signal.aborted) return Promise.resolve({ behavior: 'deny', message: STOPPED_DENIED })
    const id = randomUUID()
    const rule = suggestedRule(suggestions, toolName)
    const answered = new Promise<PermissionResult>((resolve) => {
      const settle = (allow: boolean): void => {
        if (!pending.delete(id)) return
        resolve(allow ? allowed : { behavior: 'deny', message: USER_DENIED })
        if (current === turn) armTimer(turn)
      }
      pending.set(id, settle)
      signal.addEventListener('abort', () => settle(false), { once: true })
    })
    armTimer(turn)
    turn.channel.push({
      type: 'permission',
      id,
      tool: toolName,
      target: toolTarget(input),
      ...(rule === undefined ? {} : { rule })
    })
    return answered
  }

  const spawnClaudeCodeProcess: Options['spawnClaudeCodeProcess'] = (spawn) => {
    // Windows npm `.cmd` shim·Dock 최소 PATH 는 spawnCli 가 맡는다. detached 로 띄워 닫을 때 MCP 손자까지 끈다
    const proc = spawnCli(spawn.command, spawn.args, {
      cwd: spawn.cwd,
      env: spawn.env,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL)
    })
    proc.stdin?.on('error', () => undefined)
    spawn.signal.addEventListener('abort', () => killGroup(proc), { once: true })
    child = proc
    return proc as unknown as SpawnedProcess
  }

  const ready: Promise<Query> = (options.sdk ?? loadSdk)().then(({ query }) => {
    // SDK 를 불러오는 사이 닫혔다 — claude 를 띄우지 않는다
    if (closed) throw new Error('session closed')
    live = query({
      prompt: prompt(),
      options: {
        pathToClaudeCodeExecutable: spec.cliPath,
        spawnClaudeCodeProcess,
        cwd: spec.vaultDir,
        env: cliEnv(),
        settingSources: spec.userSettings ? ['user', 'project', 'local'] : ['project', 'local'],
        systemPrompt: { type: 'preset', preset: 'claude_code', append: spec.system },
        disallowedTools: DISALLOWED,
        ...(enabledMcp.length > 0
          ? {
              mcpServers: Object.fromEntries(
                enabledMcp.map((s) => [
                  s.name,
                  s.kind === 'http'
                    ? { type: 'http' as const, url: s.url }
                    : { type: 'stdio' as const, command: s.command, args: s.args, env: s.env }
                ])
              ),
              allowedTools: enabledMcp.map((s) => `mcp__${s.name}__*`)
            }
          : {}),
        ...(spec.model ? { model: spec.model } : {}),
        ...(spec.resume ? { resume: spec.resume } : {}),
        permissionMode: mode,
        // 권한 모드 '모두 허용' 으로 턴 중에 바꿀 수 있게 — 이 값만으로는 아무것도 허용하지 않는다
        allowDangerouslySkipPermissions: true,
        hooks: { PreToolUse: [{ hooks: [readonlyGuard] }] },
        canUseTool
      }
    })
    return live
  })

  // 프로세스 출력 — 턴 밖에서 온 것(result 뒤 알림 등)은 버린다
  void ready.then(
    async (q) => {
      let cause = ''
      try {
        for await (const message of q) {
          const turn = current
          if (turn === null) continue
          armTimer(turn)
          const parsed = parse(message)
          for (const event of parsed.events) turn.channel.push(event)
          if (parsed.result === undefined) continue
          if (turn.canceled) endTurn({ ok: false, canceled: true })
          else if (turn.timedOut) endTurn({ ok: false, canceled: false })
          else if (!parsed.result.ok) fail(layeredFailure(parsed.result.message))
          else endTurn({ ok: true, canceled: false })
        }
      } catch (error) {
        cause = error instanceof Error ? error.message : String(error)
        if (!closed) console.error('claude session ended', error, stderr)
      } finally {
        alive = false
        if (!closed) failWith(stderr.trim() || cause)
      }
    },
    (error: unknown) => {
      alive = false
      if (closed) return
      console.error('could not load the claude SDK', error)
      fail(`${claudeConnectFailed()}${DETAIL_MARK}${String(error)}`)
    }
  )

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
        readonly: turn.readonly,
        offline: turn.offline === true,
        sent: false,
        canceled: false,
        timedOut: false,
        timer: null
      }
      current = state
      stderr = ''
      let step = 'initialize'
      try {
        const q = await ready
        // 처음 여는 프로세스는 초기화(명령 목록 등)를 마쳐야 턴을 받는다 — 구버전 claude 는 여기서 실패한다
        await q.initializationResult()
        initialized = true
        step = 'set_permission_mode'
        const want = turn.readonly ? 'default' : PERMISSION_MODE[turn.mode]
        if (want !== mode) {
          await q.setPermissionMode(want)
          mode = want
        }
        step = 'set_model'
        if (turn.model && turn.model !== model) {
          await q.setModel(turn.model)
          model = turn.model
        }
        if (state.canceled) endTurn({ ok: false, canceled: true })
        else {
          state.sent = true
          armTimer(state)
          inbox.push({
            type: 'user',
            message: { role: 'user', content: userContent(turn) },
            parent_tool_use_id: null
          } as SDKUserMessage)
          wakeInbox?.()
        }
      } catch (error) {
        const raw = `${step}: ${error instanceof Error ? error.message : String(error)}`
        if (current === state) {
          if (initialized) fail(layeredFailure(raw))
          else failWith(stderr.trim() || raw)
        }
      }
      yield* channel
    },
    interrupt() {
      const turn = current
      if (turn === null || turn.canceled) return
      turn.canceled = true
      if (!turn.sent) return settleAll()
      if (pending.size === 0) return interruptTurn(turn)
      // 승인 카드의 거절이 멈춤 요청보다 먼저 가야 한다 — 늦게 간 거절에 대한 출력이 다음 턴 답으로 섞인다.
      // SDK 0.3.309: handleControlRequest 가 canUseTool 을 await 한 뒤 같은 마이크로태스크 흐름에서 transport.write 한다
      settleAll()
      setImmediate(() => {
        if (current === turn) interruptTurn(turn)
      })
    },
    respond(id, allow) {
      pending.get(id)?.(allow)
    },
    async commands(): Promise<ChatSkill[]> {
      const q = await ready
      const commands = await q.supportedCommands()
      // 앱이 다루지 못하는 내장 명령(/login·/clear 등)은 빼고 사용자 스킬·명령만 이름순으로 보인다
      return commands
        .filter((c) => c.builtin !== true)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ name: c.name, ...(c.description ? { description: c.description } : {}) }))
    },
    close
  }
}
