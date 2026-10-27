import type { AccountUsage } from '../account-usage'
import type { McpServer } from '../mcp-servers'
import type { ChatDefaults } from '../chat-defaults'

export const APP_CHANNELS_SETTINGS = {
  getChatDefaults: 'chat:get-defaults',
  setChatDefaults: 'chat:set-defaults',
  getMcpServers: 'chat:get-mcp-servers',
  setMcpServers: 'chat:set-mcp-servers',
  probeMcpServer: 'chat:probe-mcp-server',
  getAccountUsage: 'usage:get',
  getOnboardingPurpose: 'settings:get-onboarding-purpose',
  setOnboardingPurpose: 'settings:set-onboarding-purpose'
} as const

export interface AppApiSettings {
  /** 채팅 기본값 — 질문마다 따라가는 권한 모드. 정의는 shared/chat-defaults.ts */
  getChatDefaults(): Promise<ChatDefaults>
  /** 보낸 값만 바꿔 저장하고 저장된 값을 돌려준다 — 칸마다 자기 값만 보낸다 */
  setChatDefaults(defaults: Partial<ChatDefaults>): Promise<ChatDefaults>
  /** 채팅이 쓸 MCP 서버 — 켠 것만 엔진 CLI 에 넘긴다. 정의는 shared/mcp-servers.ts */
  getMcpServers(): Promise<McpServer[]>
  /** 정규화해 저장하고 저장된 목록을 돌려준다 — 못 쓰는 항목·겹치는 이름은 빠진다 */
  setMcpServers(servers: McpServer[]): Promise<McpServer[]>
  /** 저장된 서버 하나가 닿는지 확인한다 — 모르는 이름이면 실패 사유 */
  probeMcpServer(name: string): Promise<{ ok: true } | { ok: false; reason: string }>
  /**
   * 계정의 남은 여유 — CLI 가 이미 넣어 둔 토큰으로 main 이 묻고 숫자만 돌려준다.
   * 토큰이 없거나 실패하면 빈 값이다(여유 칸이 조용히 빠진다)
   */
  /** `fresh` 면 main 의 60초 기억을 건너뛴다 — 사람이 다시 보기를 눌렀을 때만이다 */
  getAccountUsage(fresh?: boolean): Promise<AccountUsage>
  /** 첫 질문 답 — 보관함이 생기기 전에 받아 둔 것. 보관함으로 옮겼거나 없으면 null */
  getOnboardingPurpose(): Promise<string | null>
  /** 정규화해 저장하고 저장된 값을 돌려준다(빈 답은 지운다). 다음에 보관함이 열리면 purpose.md 로 옮겨 커밋한다 */
  setOnboardingPurpose(text: string): Promise<string | null>
}
