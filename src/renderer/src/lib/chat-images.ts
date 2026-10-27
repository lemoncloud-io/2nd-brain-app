// 채팅 입력칸에 붙여 넣은 그림 — 엔진에 보낼 base64 로 바꾸고, 큰 그림은 줄인다.
// 레티나 화면 캡처는 PNG 로 5MB 를 쉽게 넘는다(API 한 장 상한). 모델도 긴 변 1568px 넘는 그림은 어차피 줄여 읽으므로
// 붙일 때 그 크기로 줄여 보낸다(Anthropic 비전 문서의 권장 크기)
import { getT } from './i18n'
import type { ChatImage } from '../../../shared/ipc-contract'
import { MAX_CHAT_IMAGES, isChatImageType } from '../../../shared/chat-image'

const MAX_EDGE = 1568
/** base64 로 늘어나도 API 상한(5MB) 안에 들게 원본 바이트로 이만큼까지 */
const MAX_BYTES = 3.75 * 1024 * 1024

/** 입력칸에 붙은 그림 — url 은 미리보기용 data URL */
export type PendingImage = ChatImage & { id: string; url: string }

export const imageTypeError = (): string => getT().chatView.images.typeError
export const imageSizeError = (): string => getT().chatView.images.sizeError
export const imageCountError = (): string => getT().chatView.images.countError(MAX_CHAT_IMAGES)
export const imageReadError = (): string => getT().chatView.images.readError

/** 긴 변이 max 를 넘으면 비율을 지켜 줄인 크기 — 넘지 않으면 그대로 */
export const fitWithin = (
  width: number,
  height: number,
  max: number = MAX_EDGE
): { width: number; height: number } => {
  const edge = Math.max(width, height)
  if (edge <= max) return { width, height }
  const scale = max / edge
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** 붙여 넣기·놓기의 파일 중 그림만 */
export const imageFiles = (files: Iterable<File>): File[] =>
  [...files].filter((file) => file.type.startsWith('image/'))

const dataUrlOf = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })

/** 큰 그림을 긴 변 MAX_EDGE 로 줄인다 — PNG 가 그래도 크면 JPEG 로 */
const shrink = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file)
  const size = fitWithin(bitmap.width, bitmap.height)
  if (size.width === bitmap.width && file.size <= MAX_BYTES) {
    bitmap.close()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const encode = (type: string, quality?: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  const png = file.type === 'image/png' ? await encode('image/png') : null
  if (png !== null && png.size <= MAX_BYTES) return png
  const jpeg = await encode('image/jpeg', 0.85)
  if (jpeg === null) throw new Error('canvas.toBlob failed')
  return jpeg
}

/** 파일 하나를 붙일 그림으로 — 못 붙이면 화면에 보일 사유 */
export const readImage = async (file: File): Promise<PendingImage | { error: string }> => {
  if (!isChatImageType(file.type)) return { error: imageTypeError() }
  let blob: Blob
  try {
    blob = await shrink(file)
  } catch (error) {
    console.error('image downscale failed', error)
    return { error: imageReadError() }
  }
  if (blob.size > MAX_BYTES) return { error: imageSizeError() }
  const url = await dataUrlOf(blob).catch(() => null)
  if (url === null) return { error: imageReadError() }
  const comma = url.indexOf(',')
  return {
    id: crypto.randomUUID(),
    mediaType: blob.type as ChatImage['mediaType'],
    data: url.slice(comma + 1),
    url
  }
}
