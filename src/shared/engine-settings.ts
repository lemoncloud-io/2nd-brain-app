// 엔진 설정 — 어떤 CLI 로 돌리고 어떤 모델 하나를 쓸지. settings.json 에 저장된다.
// main(팩토리)과 renderer(설정 화면)가 같은 정규화를 쓴다.

export const ENGINE_KINDS = ['claude', 'codex'] as const
export type EngineKind = (typeof ENGINE_KINDS)[number]

/** 엔진이 도는 용도 — 프로필(권한·도구)이 다르다. 모델은 모든 용도가 같은 하나를 쓰되,
 *  위키 초안만 고급의 draftModel 로 따로 둘 수 있다(없으면 model 과 같다) */
export type EngineUse = 'chat' | 'ingest' | 'lint'

/** model 이 없으면 CLI 기본 모델. draftModel 이 없으면 model 과 같다 */
export type EngineSettings = { engine: EngineKind; model?: string; draftModel?: string }

// claude --help 의 --model 설명이 예로 드는 별칭 — 전체 모델 이름도 그대로 넣을 수 있다. Codex 는 목록이 없다
export const CLAUDE_MODEL_ALIASES = ['fable', 'opus', 'sonnet']

/** 기본 화면의 목록으로 고를 수 있는 이름인가 — 아니면 '고급' 의 직접 입력으로 넣은 이름이다 */
export const isListedModel = (engine: EngineKind, model: string): boolean =>
  engine === 'claude' && CLAUDE_MODEL_ALIASES.includes(model)

// 모델 이름은 CLI 인자로 간다 — `-` 로 시작하면 플래그로 읽힐 수 있어 받지 않는다. 공백은 모델 이름에 없어서 받지 않는다.
// 허용: 영문·숫자로 시작, 이후 영문·숫자·`.`·`_`·`:`·`-`·`[`·`]` (예: sonnet, claude-opus-5[1m], gpt-5.1-codex)
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/

export const isValidModelName = (value: string): boolean => MODEL_NAME.test(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const modelOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed && isValidModelName(trimmed) ? trimmed : undefined
}

/**
 * settings.json·renderer 입력을 믿지 않고 정리한다 — 모르는 엔진은 claude, 쓸 수 없는 모델은 지정 없음.
 * 옛 설정(용도별 `models`)만 있으면 채팅 모델을 이어받는다 — 사람이 가장 자주 보는 모델이 그것이다.
 * 초안 모델은 비워 두면 지운다(위 모델과 같아진다). 엔진이 바뀌면 호출 쪽이 비운다 — Claude 별칭을 Codex 가 모른다.
 */
export const normalizeEngineSettings = (raw: unknown): EngineSettings => {
  const source = isRecord(raw) ? raw : {}
  const engine = ENGINE_KINDS.find((kind) => kind === source['engine']) ?? 'claude'
  const legacy = isRecord(source['models']) ? source['models']['chat'] : undefined
  const model = modelOf(source['model']) ?? modelOf(legacy)
  const draftModel = modelOf(source['draftModel'])
  const out: EngineSettings = model ? { engine, model } : { engine }
  if (draftModel && draftModel !== model) out.draftModel = draftModel
  return out
}
