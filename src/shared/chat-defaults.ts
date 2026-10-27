// 채팅 기본값 — 질문마다 따라가는 권한 모드와 내 Claude 설정 같이 쓰기. settings.json 에 저장된다.
// main(저장)과 renderer(설정 화면)가 같은 정규화를 쓴다.
import { chatPermissionModeOf, type ChatPermissionMode } from './chat-permission'

export type ChatDefaults = {
  /** AI가 도구를 쓸 때 묻기 — ask(물어보기)·edits(파일 고치기는 바로)·all(전부 바로) */
  permissionMode: ChatPermissionMode
  /** 이 PC 의 Claude 설정(`~/.claude` 의 규칙·훅·출력 스타일·스킬)도 채팅이 읽는다 — 끄면 보관함 설정만 */
  userSettings: boolean
}

export const DEFAULT_CHAT_DEFAULTS: ChatDefaults = {
  permissionMode: 'ask',
  userSettings: true
}

/** 저장된 값을 거른다 — 모르는 모드는 물어보기로, 내 설정은 false 일 때만 끈다. 예전 키(sourceOnly·attachOpen)는 읽지 않는다 */
export const normalizeChatDefaults = (raw: unknown): ChatDefaults => {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<
    Record<keyof ChatDefaults, unknown>
  >
  return {
    permissionMode: chatPermissionModeOf(obj.permissionMode),
    userSettings: obj.userSettings !== false
  }
}

/** 화면이 보낸 일부 값을 저장된 값 위에 얹는다 — 칸마다 자기 값만 보내 다른 칸이 고친 값을 덮지 않는다 */
export const updateChatDefaults = (saved: unknown, patch: unknown): ChatDefaults => {
  const base = normalizeChatDefaults(saved)
  const next = typeof patch === 'object' && patch !== null ? patch : {}
  return normalizeChatDefaults({ ...base, ...next })
}
