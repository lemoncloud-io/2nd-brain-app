// 위키화 엔진 공통 계약 — 엔진마다 CLI 는 달라도 같은 EngineEvent 로 진행을 알린다.
import type { ChatPermissionMode } from '../../shared/chat-permission'
import type { ChatImage, EngineEvent } from '../../shared/ipc-contract'

export interface IngestJob {
  vaultDir: string
  prompt: string
  // 아래는 채팅만 싣는다 — 켜 둔 대화 세션(`chat/session/`)이 읽고, 한 번 도는 CLI 엔진은 보지 않는다
  /** 앱 규칙 — 세션을 열 때 시스템 프롬프트로 싣는다 */
  system?: string
  /** 이어 붙일 앞 대화의 session(thread) id */
  resume?: string
  /** 채팅 권한 모드 */
  mode?: ChatPermissionMode
  /** 채팅 질문에 붙인 그림 */
  images?: ChatImage[]
}

export interface Engine {
  run(job: IngestJob): AsyncIterable<EngineEvent>
  cancel(): void
  /** `permission` 이벤트의 답 — 기다리는 요청이 아니면 아무 일도 하지 않는다. 승인을 주고받지 않는 엔진에는 없다 */
  respond?(id: string, allow: boolean): void
}
