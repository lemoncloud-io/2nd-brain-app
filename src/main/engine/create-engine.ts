// 엔진 팩토리 — 핸들러는 용도와 확인된 CLI 만 넘기고, 어떤 엔진·프로필·모델로 돌지는 여기서 정한다(슬라이스 09·10).
// 모델은 모든 용도가 같은 하나를 쓴다. 다만 위키 초안(draft)만 고급의 draftModel 로 따로 둘 수 있다.
// 설정은 만들 때마다 읽는다 — 설정 화면에서 저장한 값이 재시작 없이 다음 실행에 쓰인다.
import {
  normalizeEngineSettings,
  type EngineKind,
  type EngineUse
} from '../../shared/engine-settings'
import type { EngineStatus } from '../../shared/ipc-contract'
import type { AppSettings } from '../settings'
import { normalizeMcpServers } from '../../shared/mcp-servers'
import { createClaudeCliEngine, type EngineProfile } from './claude-engine'
import { createCodexCliEngine } from './codex-engine'
import type { Engine } from './engine'
import type { SessionBase } from '../chat/session/chat-sessions'
import { normalizeChatDefaults } from '../../shared/chat-defaults'
import { mainT } from '../i18n'

/**
 * 한 번 돌고 끝나는 실행 — 위키화·점검 + 위키화 초안(읽기 전용) + 선택 영역 고치기.
 * 채팅(질의·노트 쓰기·대화 압축)은 대화마다 켜 둔 세션이 돈다(`chat/session/`)
 */
export type EngineRun = Exclude<EngineUse, 'chat'> | 'draft' | 'aside'

const PROFILE: Record<EngineRun, EngineProfile> = {
  ingest: 'ingest',
  lint: 'lint',
  // 초안은 바꾸지 않고 읽기만 한다 — 파일·INDEX·run-log 은 앱이 코드로 쓴다
  draft: 'query',
  // 채팅 모델·MCP 는 그대로, 웹 도구만 없다 — 정해진 글을 고치거나 줄이는 일에 바깥 조회는 필요 없다
  aside: 'query'
}

/** 핸들러가 설치·로그인을 확인한 엔진 CLI — kind 는 그 확인 시점의 설정 엔진이다 */
export type EngineCli = { kind: EngineKind; path: string }

export type EngineFactory = (use: EngineRun, cli: EngineCli) => Engine

const ENGINE_LABEL: Record<EngineKind, string> = { claude: 'Claude', codex: 'Codex' }

/** 엔진 상태에서 엔진을 만들 CLI 를 고른다 — 없거나 미로그인이면 사용자에게 보일 사유 */
export const engineCliOf = (status: EngineStatus): EngineCli | { error: string } => {
  if ('missing' in status.cli) return { error: status.cli.reason }
  if (!status.auth.loggedIn)
    return { error: mainT().engineMain.loginNeeded(ENGINE_LABEL[status.engine]) }
  return { kind: status.engine, path: status.cli.path }
}

/** 켜 두는 채팅 세션이 열 때 쓰는 것 — 모델·MCP 는 엔진 설정과 같다 */
export const chatSessionBase = (settings: AppSettings, cli: EngineCli): SessionBase => {
  const { model } = normalizeEngineSettings(settings)
  return {
    engine: cli.kind,
    cliPath: cli.path,
    ...(model ? { model } : {}),
    mcp: normalizeMcpServers(settings.mcpServers),
    userSettings: normalizeChatDefaults(settings.chatDefaults).userSettings
  }
}

export const createEngineFactory =
  (readSettings: () => AppSettings): EngineFactory =>
  (use, cli) => {
    const settings = readSettings()
    const { model, draftModel } = normalizeEngineSettings(settings)
    const build = cli.kind === 'codex' ? createCodexCliEngine : createClaudeCliEngine
    // 위키 초안만 고급의 다른 모델로 돌 수 있다 — 없으면 모두 같은 모델이다
    const modelFor = use === 'draft' ? (draftModel ?? model) : model
    return build(cli.path, PROFILE[use], {
      model: modelFor,
      // MCP 도구는 채팅 곁일(선택 영역 고치기)만 쓴다 — 위키화·점검은 보관함 안에서만 돈다
      mcp: use === 'aside' ? normalizeMcpServers(settings.mcpServers) : []
    })
  }
