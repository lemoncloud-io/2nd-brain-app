import { describe, expect, it } from 'vitest'
import { countText } from './text-count'

describe('countText', () => {
  it('한국어는 공백을 넣어 글자를 세고, 띄어 쓴 덩어리를 단어로 센다', () => {
    expect(countText('오늘 회의를 했다')).toEqual({ chars: 9, words: 3 })
  })

  it('맨 위 속성과 줄바꿈은 세지 않는다', () => {
    expect(countText('---\ntitle: 긴 제목\ntags: [a, b]\n---\n가나\n다라')).toEqual({
      chars: 4,
      words: 2
    })
  })

  it('꾸밈 기호는 빼고 보이는 글자만 센다', () => {
    const text = ['# 제목', '- [ ] **할 일**', '> 인용', '1. `코드`', '---'].join('\n')
    expect(countText(text)).toEqual({ chars: 2 + 3 + 2 + 2, words: 5 })
  })

  it('링크는 보이는 글자로, 임베드·그림은 빼고 센다', () => {
    expect(
      countText('[[machine-learning|기계 학습]] 과 [[ml]] ![[a.png]] [글](https://x.y)')
    ).toEqual({ chars: '기계 학습 과 ml 글'.length, words: 5 })
  })

  it('빈 글은 0', () => {
    expect(countText('')).toEqual({ chars: 0, words: 0 })
  })
})
