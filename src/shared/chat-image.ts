// 채팅 질문에 붙이는 그림의 공용 한도 — 렌더러(붙일 때)와 main(IPC 너머 확인)이 같은 값을 쓴다
import type { ChatImage } from './ipc/chat'

/** 한 질문에 붙일 수 있는 그림 수 */
export const MAX_CHAT_IMAGES = 5

const TYPES = new Set<string>(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/** 엔진이 받는 네 형식인가 */
export const isChatImageType = (type: string): type is ChatImage['mediaType'] => TYPES.has(type)
