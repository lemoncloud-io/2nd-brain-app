import { describe, expect, it } from 'vitest'
import { webErrorText } from './web-text'

describe('webErrorText — 페이지가 안 뜬 까닭', () => {
  it('못 연 페이지는 할 일을 말하고 엔진 오류·주소는 자세히에 둔다', () => {
    const error = webErrorText(
      { kind: 'load', code: -102, description: 'ERR_CONNECTION_REFUSED' },
      'http://127.0.0.1:1/'
    )
    expect(error.text).toContain('페이지를 열지 못했어요')
    expect(error.text).not.toContain('ERR_')
    expect(error.detail).toBe('ERR_CONNECTION_REFUSED (-102)\nhttp://127.0.0.1:1/')
  })

  it('멈춘 페이지는 "페이지가 멈췄어요"', () => {
    const error = webErrorText({ kind: 'crashed' }, 'https://a.example/')
    expect(error.text).toContain('페이지가 멈췄어요')
    expect(error.detail).toBe('https://a.example/')
  })
})
