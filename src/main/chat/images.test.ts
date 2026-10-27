import { describe, expect, it } from 'vitest'
import { MAX_CHAT_IMAGES as MAX_IMAGES } from '../../shared/chat-image'
import { MAX_IMAGE_BYTES, chatImagesOf } from './images'

describe('chatImagesOf — test: images.ts', () => {
  const png = { mediaType: 'image/png', data: 'iVBORw0KGgo=' }

  it('엔진이 받는 네 형식의 base64 그림만 남긴다', () => {
    expect(chatImagesOf([png, { mediaType: 'image/webp', data: 'AAAA' }])).toEqual([
      png,
      { mediaType: 'image/webp', data: 'AAAA' }
    ])
    expect(chatImagesOf([{ mediaType: 'image/svg+xml', data: 'AAAA' }])).toEqual([])
    expect(chatImagesOf([{ mediaType: 'image/png', data: 'data:image/png;base64,AAAA' }])).toEqual(
      []
    )
    expect(chatImagesOf([{ mediaType: 'image/png', data: '' }, null, 'x'])).toEqual([])
    expect(chatImagesOf('x')).toEqual([])
    expect(chatImagesOf(undefined)).toEqual([])
  })

  it(`${MAX_IMAGES}장까지, 한 장 5MB 를 넘는 것은 뺀다`, () => {
    expect(chatImagesOf(Array.from({ length: MAX_IMAGES + 2 }, () => png))).toHaveLength(MAX_IMAGES)
    const big = 'A'.repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4)
    expect(chatImagesOf([{ mediaType: 'image/png', data: big }])).toEqual([])
  })
})
