import { describe, expect, it } from 'vitest'
import { toUserError } from './user-error'
import { DETAIL_MARK } from '../../../shared/engine-failure'

describe('toUserError', () => {
  it('Electron 이 씌운 IPC 껍질을 벗긴다', () => {
    const error = new Error(
      "Error invoking remote method 'vault:create': Error: ENOENT: no such file or directory"
    )
    const { text, detail } = toUserError(error, '볼트를 만들지 못했다')
    expect(text).toBe(
      '볼트를 만들지 못했다 — 그 파일이나 폴더가 없어요. 옮기거나 지웠는지 확인해 주세요'
    )
    expect(detail).toBe('ENOENT: no such file or directory')
  })

  it.each([
    ['EACCES: permission denied', '권한이 없어요'],
    ['ENOSPC: no space left on device', '남은 저장 공간이 없어요'],
    ['EBUSY: resource busy or locked', '다른 프로그램'],
    ['fetch failed', '인터넷']
  ])('%s 는 할 일을 덧붙인다', (message, phrase) => {
    expect(toUserError(new Error(message), '올리지 못했다').text).toContain(phrase)
  })

  it('main 이 이미 사용자 말로 쓴 짧은 문구는 그대로 붙인다', () => {
    const { text, detail } = toUserError(new Error('열린 볼트가 없다'), '위키화를 시작하지 못했다')
    expect(text).toBe('위키화를 시작하지 못했다 — 열린 볼트가 없다')
    expect(detail).toBeNull()
  })

  it('스택이 섞인 긴 원문은 문장 밖으로 접는다', () => {
    const stack = 'Unexpected token\n    at parse (/app/x.js:1:1)\n    at run (/app/y.js:2:2)'
    const { text, detail } = toUserError(new Error(stack), '페이지를 읽지 못했다')
    expect(text).toBe('페이지를 읽지 못했다')
    expect(detail).toContain('at parse')
  })

  it('Error 가 아닌 것과 빈 값도 문장 하나로 끝난다', () => {
    expect(toUserError('무슨 일이 났다', '실패했다').text).toBe('실패했다 — 무슨 일이 났다')
    expect(toUserError(new Error(''), '실패했다')).toEqual({ text: '실패했다', detail: null })
  })
})

describe('AI 실패는 사용자 말로 바뀐다', () => {
  it('한도 원문 대신 무엇이 언제 풀리는지 말한다', () => {
    const { text } = toUserError(
      new Error('claude 가 실패를 보고했다: Claude AI usage limit reached|1758067200'),
      '답을 받지 못했다'
    )
    expect(text).toContain('한도에 닿았어요')
    expect(text).not.toContain('usage limit')
  })

  it('칸막이로 온 두 층은 앞을 문장으로, 뒤를 접어 둔다', () => {
    const { text, detail } = toUserError(
      new Error(`AI 가 지금 붐빈다. 잠시 뒤 다시 시도한다${DETAIL_MARK}claude exit 1 — overloaded`),
      '위키화를 마치지 못했다'
    )
    expect(text).toBe('AI 가 지금 붐빈다. 잠시 뒤 다시 시도한다')
    expect(detail).toContain('exit 1')
  })
})
