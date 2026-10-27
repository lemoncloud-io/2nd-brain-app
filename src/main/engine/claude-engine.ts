// Claude CLI 엔진 — `claude -p --output-format stream-json` 인자와 stream-json 줄 해석. 실행 수명은 cli-process.
import type { EngineEvent, EngineUsage } from '../../shared/ipc-contract'
import { createCliEngine, parseJsonObject, type ParsedLine } from './cli-process'
import type { Engine, IngestJob } from './engine'
import type { McpServer } from '../../shared/mcp-servers'
import { claudeMcpArgs } from './mcp-args'
import { mainT } from '../i18n'

export { INGEST_LOCK } from './cli-process'

// 프로필별 인자 표 — ingest 는 쓰기 도구와 acceptEdits, 나머지는 읽기 전용이고 웹 도구가 없다.
// 채팅은 이 엔진을 쓰지 않는다 — 대화마다 켜 둔 세션(`chat/session/`)이 돈다
const READONLY_ARGS = [
  '--allowedTools',
  'Read,Glob,Grep',
  '--disallowedTools',
  'Write,Edit,MultiEdit,NotebookEdit,Bash'
]
const PROFILE_ARGS = {
  ingest: [
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    // 검증(vault_verify.py)은 에이전트가 돌리지 않는다 — 앱이 승인 확정 때 bundled 검증으로 판정한다.
    // 에이전트 안에서 돌리면 검증-수정 루프가 Sonnet 시간으로 돈다
    'Read,Write,Edit,Glob,Grep,Bash(git:*)',
    '--disallowedTools',
    'Bash(git push:*),Bash(git merge:*)'
  ],
  query: READONLY_ARGS,
  lint: READONLY_ARGS
} satisfies Record<string, string[]>

export type EngineProfile = keyof typeof PROFILE_ARGS

const BASE_ARGS = ['--output-format', 'stream-json', '--verbose']
/** 보관함의 설정만 읽는다 — 사용자 PC 의 설정이 위키화·점검·읽기 전용 답에 섞이지 않게 */
const VAULT_SETTINGS = ['--setting-sources', 'project']

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
// 승인 카드에 보이는 대상 — Task(서브에이전트)의 설명·지시, Skill 의 스킬 이름도 빈칸으로 두지 않는다
const TARGET_KEYS = [
  'file_path',
  'command',
  'pattern',
  'path',
  'url',
  'query',
  'description',
  'prompt',
  'skill'
]

interface ContentItem {
  type?: string
  text?: string
  thinking?: string
  name?: string
  input?: Record<string, unknown>
}

interface StreamLine {
  type?: string
  subtype?: string
  is_error?: boolean
  /** 오류 result 의 사유 목록 */
  errors?: unknown
  session_id?: string
  result?: string
  message?: { content?: ContentItem[] }
  /** init 줄 — CLI 가 해석한 모델 이름 */
  model?: string
  /** result 줄 — 이번 턴이 쓴 토큰 */
  usage?: Record<string, unknown>
  /** result 줄 — 모델별 창 크기 등 */
  modelUsage?: Record<string, { contextWindow?: number }>
}

/** 한 요청이 창에 올린 토큰 — 캐시로 읽은 것도 창을 차지한다 */
const TOKEN_KEYS = [
  'input_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'output_tokens'
]

const sumTokens = (usage: Record<string, unknown> = {}): number =>
  TOKEN_KEYS.reduce((sum, key) => sum + (typeof usage[key] === 'number' ? usage[key] : 0), 0)

/**
 * 창을 얼마나 쓰고 있나 — **마지막 요청** 하나의 토큰이다. 턴 합계(`usage` 맨 위)는 도구를 여러 번
 * 부른 턴에서 같은 캐시를 요청마다 다시 세어, 창 크기를 훌쩍 넘고 100% 로 붙는다
 * (녹화 `claude-ndjson/run.ndjson`: 합계 cache_read 47220 대 마지막 요청 36003).
 */
const contextTokens = (usage: Record<string, unknown> = {}): number => {
  const iterations = usage['iterations']
  const last = Array.isArray(iterations) ? iterations.at(-1) : undefined
  return sumTokens(
    typeof last === 'object' && last !== null ? (last as Record<string, unknown>) : usage
  )
}

/**
 * 이번 턴이 돈 모델의 항목 — `modelUsage` 에는 제목·부가 호출용 haiku 가 늘 같이 온다
 * (녹화 두 개 모두 2항목). 그래서 init 줄이 알려 준 모델 키로 맞추는 것이 1차고,
 * 그 키가 없을 때만 항목이 하나뿐인 경우로 물러선다. 여럿인데 못 맞추면 어느 창인지 모른다.
 */
const windowOf = (
  modelUsage: Record<string, { contextWindow?: number }>,
  model: string | null
): { model: string | null; window: number | null } => {
  const entries = Object.entries(modelUsage)
  const matched = model !== null && model in modelUsage ? model : null
  const only = matched === null && entries.length === 1 ? entries[0][0] : null
  const key = matched ?? only
  if (key === null) return { model, window: null }
  const window = modelUsage[key]?.contextWindow
  return { model: key, window: typeof window === 'number' && window > 0 ? window : null }
}

/** result 줄의 사용량 — 창을 모르면 비율 자리는 빈 채로 둔다(추정 상수를 만들지 않는다) */
const usageOf = (line: StreamLine, model: string | null): EngineUsage => {
  const found = windowOf(line.modelUsage ?? {}, model)
  if (found.window === null) return { model: found.model, contextPercent: null }
  const percent = Math.round((contextTokens(line.usage) / found.window) * 100)
  return { model: found.model, contextPercent: Math.max(0, Math.min(100, percent)) }
}

/** 도구 입력에서 사람에게 보일 대상 한 줄을 뽑는다 — 승인 카드·진행 줄이 쓴다 */
export const toolTarget = (input: Record<string, unknown> = {}): string => {
  const value = TARGET_KEYS.map((key) => input[key]).find((v) => typeof v === 'string')
  return typeof value === 'string' ? value : ''
}

/** 승인 요청에 실려 온 허용 규칙 중 그 도구의 첫 규칙 내용 — 없거나 꼴이 다르면 undefined */
export const suggestedRule = (suggestions: unknown, tool: string): string | undefined => {
  if (!Array.isArray(suggestions)) return undefined
  for (const suggestion of suggestions as {
    type?: unknown
    behavior?: unknown
    rules?: unknown
  }[]) {
    if (suggestion?.type !== 'addRules' || suggestion.behavior !== 'allow') continue
    if (!Array.isArray(suggestion.rules)) continue
    for (const rule of suggestion.rules as { toolName?: unknown; ruleContent?: unknown }[]) {
      if (rule?.toolName === tool && typeof rule.ruleContent === 'string') return rule.ruleContent
    }
  }
  return undefined
}

/** 사용자 메시지 본문 — 그림이 없으면 글 그대로 */
export const userContent = (
  job: Pick<IngestJob, 'prompt' | 'images'>
):
  | string
  | (
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text'; text: string }
    )[] => {
  const images = job.images ?? []
  if (images.length === 0) return job.prompt
  return [
    ...images.map((image) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: image.mediaType, data: image.data }
    })),
    { type: 'text' as const, text: job.prompt }
  ]
}

/**
 * 줄 해석기 — 엔진 하나가 하나씩 쥔다(`cli-process`: 엔진 하나 = 실행 하나).
 * result 줄의 `modelUsage` 를 init 줄이 말한 모델로 맞춰야 해서 그 이름을 기억한다
 */
const makeParseLine = (): ((line: string) => ParsedLine) => {
  const parseMessage = makeParseMessage()
  return (line: string): ParsedLine => {
    const parsed = parseJsonObject(line)
    if (!parsed) {
      return {
        events: [
          {
            type: 'error',
            message: mainT().engineMain.lineSkipped(line.slice(0, 120))
          }
        ]
      }
    }
    return parseMessage(parsed)
  }
}

/**
 * stream-json 메시지 하나 → 이벤트. 줄로 받는 per-run 엔진과 SDK 가 객체로 주는 켜 둔 채팅 세션이 같이 쓴다 —
 * SDK 메시지는 CLI 의 stream-json 줄과 같은 모양이다
 */
export const makeParseMessage = (): ((message: object) => ParsedLine) => {
  let runningModel: string | null = null
  return (parsed: object): ParsedLine => {
    const stream = parsed as StreamLine
    const { type, subtype, is_error, session_id, result, message } = stream
    // `/compact` 가 실제로 앞부분을 요약으로 바꾼 지점 — 이 줄이 없으면 압축은 일어나지 않았다
    if (type === 'system' && subtype === 'compact_boundary') {
      return { events: [{ type: 'compacted' }] }
    }
    if (type === 'system' && subtype === 'init' && typeof session_id === 'string') {
      const events: EngineEvent[] = [{ type: 'session', id: session_id }]
      // 모델 이름은 여기서만 온다 — 사용률은 턴이 끝나야 알므로 지금은 빈 자리로 둔다
      if (typeof stream.model === 'string' && stream.model !== '') {
        runningModel = stream.model
        events.push({ type: 'usage', usage: { model: stream.model, contextPercent: null } })
      }
      return { events }
    }
    if (type === 'result') {
      const usage = usageOf(stream, runningModel)
      // 할 말이 없으면 이벤트를 만들지 않는다 — 빈 사용량은 화면에서 빈 줄이 된다
      const events: EngineEvent[] =
        usage.model === null && usage.contextPercent === null ? [] : [{ type: 'usage', usage }]
      // 오류 result 의 사유는 `errors` 에 온다(claude 2.1.309: 없는 세션 resume 은 result 가 비고 errors 에 사유)
      const errors = Array.isArray(stream.errors)
        ? stream.errors.filter((e): e is string => typeof e === 'string' && e !== '')
        : []
      return {
        events,
        result: {
          ok: subtype === 'success' && is_error !== true,
          message: errors.length > 0 ? errors.join('\n') : (result ?? subtype ?? '')
        }
      }
    }
    if (type !== 'assistant') return { events: [] }

    const events: EngineEvent[] = []
    for (const item of message?.content ?? []) {
      if (item.type === 'text' && item.text) events.push({ type: 'text', text: item.text })
      // 녹화(claude 2.x): thinking 블록은 문구를 비워 보내는 경우가 있다 — 빈 블록은 알리지 않는다
      if (item.type === 'thinking' && item.thinking) {
        events.push({ type: 'thinking', text: item.thinking })
      }
      if (item.type !== 'tool_use' || !item.name) continue
      const target = toolTarget(item.input)
      events.push({ type: 'tool', name: item.name, target })
      if (FILE_TOOLS.has(item.name) && target) events.push({ type: 'file-change', path: target })
    }
    return { events }
  }
}

export const createClaudeCliEngine = (
  cliPath: string,
  profile: EngineProfile = 'ingest',
  opts: { model?: string; mcp?: McpServer[] } = {}
): Engine => {
  const profileArgs = claudeMcpArgs(opts.mcp ?? [], PROFILE_ARGS[profile])
  // 모델 이름 검증은 호출 쪽(normalizeEngineSettings)이 한다 — 여기서는 받은 그대로 --model 로 넘긴다
  const modelArgs = opts.model ? ['--model', opts.model] : []
  return createCliEngine({
    name: 'claude',
    cliPath,
    // 볼트 lock 은 ingest 프로필만 잡는다 — query 는 위키화 중에도 읽기 전용으로 돈다
    lock: profile === 'ingest',
    args: () => ['-p', ...BASE_ARGS, ...VAULT_SETTINGS, ...profileArgs, ...modelArgs],
    // 해석기는 엔진마다 새로 만든다 — 같이 돌던 다른 실행의 모델 이름이 섞이면 안 된다
    parseLine: makeParseLine(),
    noResultMessage: 'claude ended without a result line'
  })
}
