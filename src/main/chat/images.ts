// 채팅 질문에 붙인 그림 — 렌더러가 보낸 값을 엔진에 넘기기 전에 모양을 확인한다.
// 렌더러가 붙일 때 줄이고 거르지만, IPC 너머 값은 믿지 않는다 — 모양이 틀린 그림은 조용히 뺀다
import type { ChatImage } from '../../shared/ipc-contract'
import { MAX_CHAT_IMAGES, isChatImageType } from '../../shared/chat-image'

/** 그림 한 장의 상한 — Anthropic API 의 이미지 한 장 상한(5MB)과 같다 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

const decodedBytes = (data: string): number =>
  Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)

export const chatImagesOf = (raw: unknown): ChatImage[] => {
  if (!Array.isArray(raw)) return []
  const out: ChatImage[] = []
  for (const item of raw) {
    if (out.length >= MAX_CHAT_IMAGES) break
    const { mediaType, data } = (item ?? {}) as { mediaType?: unknown; data?: unknown }
    if (typeof mediaType !== 'string' || !isChatImageType(mediaType)) continue
    if (typeof data !== 'string' || data === '' || !BASE64.test(data)) continue
    if (decodedBytes(data) > MAX_IMAGE_BYTES) continue
    out.push({ mediaType, data })
  }
  return out
}
