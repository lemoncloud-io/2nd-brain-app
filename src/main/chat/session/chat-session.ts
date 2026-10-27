// 켜 두는 채팅 세션 — 대화 하나에 엔진 프로세스 하나. 질문마다 띄우지 않고 같은 프로세스에 턴을 보낸다.
// 엔진별 구현(claude-session·codex-session)이 이 모양을 채우고, 풀(chat-sessions)이 대화와 묶는다
import { mainT } from '../../i18n'
import type { ChatImage, ChatSkill, EngineEvent } from '../../../shared/ipc-contract'
import type { ChatPermissionMode } from '../../../shared/chat-permission'
import type { McpServer } from '../../../shared/mcp-servers'
import type { EngineKind } from '../../../shared/engine-settings'

/** 세션 프로세스가 턴 도중 끝났다 */
export const sessionDied = (): string => mainT().chatSession.died
/** 도는 턴이 있는데 또 물었다 */
export const sessionBusy = (): string => mainT().chatSession.busy

/** 프로세스를 열 때 정하는 것 — 이 중 하나라도 바뀌면 다시 연다(`sessionKey`) */
export type SessionSpec = {
  /** claude 는 Agent SDK, codex 는 app-server 로 연다 */
  engine: EngineKind
  cliPath: string
  vaultDir: string
  system: string
  mcp: McpServer[]
  /** 사용자 PC 의 Claude 설정까지 읽는다 — 끄면 보관함 설정(project,local)만 */
  userSettings: boolean
  /** 처음 모델 — 열린 뒤에는 턴의 model 로 바꾼다 */
  model?: string
  /** 열 때 한 번 이어 붙일 앞 세션 */
  resume?: string
}

/** 턴 하나 — 권한 모드·모델은 열린 프로세스에서 바꾼다 */
export type SessionTurn = {
  prompt: string
  images?: ChatImage[]
  mode: ChatPermissionMode
  /** 위키화 중·다른 대화가 쓰는 중 — 이 턴만 읽기 도구 밖을 거절한다 */
  readonly: boolean
  /** 웹 도구도 막는다 — 곁일(대화 압축)은 보관함 안에서만 돈다 */
  offline?: boolean
  model?: string
}

export interface ChatSession {
  /** 프로세스가 살아 있다 — 죽었으면 풀이 버리고 다시 연다 */
  readonly alive: boolean
  /** 턴이 도는 중 — 풀은 도는 세션을 끄지 않는다 */
  readonly busy: boolean
  /** 이 턴의 이벤트 — 늘 `done` 하나로 끝난다 */
  turn(turn: SessionTurn): AsyncIterable<EngineEvent>
  /** 도는 턴만 멈춘다 — 프로세스와 대화 기억은 남는다 */
  interrupt(): void
  /** 승인 카드의 답 — 기다리는 요청이 아니면 아무 일도 없다 */
  respond(id: string, allow: boolean): void
  /** `/` 목록 */
  commands(): Promise<ChatSkill[]>
  close(): void
}

export type OpenSession = (spec: SessionSpec) => ChatSession

/** 같은 값이면 열린 프로세스를 그대로 쓴다 — 모델·권한 모드는 넣지 않는다(턴마다 바꾼다) */
export const sessionKey = (spec: SessionSpec): string =>
  JSON.stringify([
    spec.engine,
    spec.cliPath,
    spec.vaultDir,
    spec.system,
    spec.mcp,
    spec.userSettings
  ])

/** 이벤트를 밀어 넣고 한 번 읽는 줄 — 턴 하나의 출력 */
export type Channel<T> = AsyncIterable<T> & { push: (item: T) => void; end: () => void }

export const createChannel = <T>(): Channel<T> => {
  const items: T[] = []
  let ended = false
  let wake: (() => void) | null = null
  return {
    push: (item) => {
      if (ended) return
      items.push(item)
      wake?.()
    },
    end: () => {
      ended = true
      wake?.()
    },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        const item = items.shift()
        if (item !== undefined) {
          yield item
          continue
        }
        if (ended) return
        await new Promise<void>((resolve) => (wake = resolve))
        wake = null
      }
    }
  }
}
