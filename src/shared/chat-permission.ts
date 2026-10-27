// 채팅 권한 모드 — 엔진이 도구를 쓰기 전에 사람에게 묻는 정도. 입력칸에서 고르고 질문마다 실어 보낸다.

export const CHAT_PERMISSION_MODES = ['ask', 'edits', 'all'] as const

/** ask = 허용 규칙 밖 도구마다 묻는다 · edits = 파일 고치기는 묻지 않는다 · all = 아무것도 묻지 않는다 */
export type ChatPermissionMode = (typeof CHAT_PERMISSION_MODES)[number]

/** 화면이 보낸 값 — 세 값이 아니면 묻는 쪽이다 */
export const chatPermissionModeOf = (value: unknown): ChatPermissionMode =>
  CHAT_PERMISSION_MODES.find((mode) => mode === value) ?? 'ask'

/** 승인 카드의 답 — session 은 이 대화가 끝날 때까지 같은 도구를 다시 묻지 않는다 */
export type ChatPermissionAnswer = 'allow' | 'session' | 'deny'

export const chatPermissionAnswerOf = (value: unknown): ChatPermissionAnswer =>
  value === 'allow' || value === 'session' ? value : 'deny'

/** 셸 도구 — "계속 허용" 을 도구가 아니라 그 명령으로 기억한다(Claude Code 의 명령 앞부분 규칙과 같은 자) */
export const isShellTool = (tool: string): boolean => tool === 'Bash' || tool === 'PowerShell'
