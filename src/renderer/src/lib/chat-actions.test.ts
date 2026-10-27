import { describe, expect, it } from 'vitest'
import { suggestActions } from './chat-actions'

describe('대화에서 이어지는 행동', () => {
  it('정리해 달라는 말은 위키화로 잇는다', () => {
    expect(suggestActions('넣어 둔 자료를 위키로 정리해줘').map((a) => a.id)).toContain('ingest')
  })

  it('승인·점검을 각각 알아본다', () => {
    expect(suggestActions('승인 기다리는 게 뭐야').map((a) => a.id)).toEqual(['review'])
    expect(suggestActions('위키에 이상한 데 없어?').map((a) => a.id)).toEqual(['lint'])
  })

  it('그냥 묻는 말에는 아무 행동도 권하지 않는다', () => {
    expect(suggestActions('RAG 가 뭐야')).toEqual([])
    expect(suggestActions('지난주 회의 내용 찾아줘')).toEqual([])
  })

  it('여러 개가 걸려도 두 개까지만 권한다', () => {
    expect(suggestActions('자료 넣고 정리해서 승인까지 점검해줘').length).toBe(2)
  })
})
