import { describe, expect, it } from 'vitest'
import { folderLabel, parentLabel, shortLabel } from './vault-path'

describe('vault-path labels', () => {
  it('folderLabel 은 폴더와 이름을 다 늘어놓고 맨 위 폴더는 화면 말로 바꾼다', () => {
    expect(folderLabel('wiki/topics/ai-agent.md')).toBe('위키 · topics · ai-agent')
  })

  it('parentLabel 은 담긴 폴더만, 맨 위 파일이면 빈 글자다', () => {
    expect(parentLabel('wiki/topics/ai-agent.md')).toBe('위키 · topics')
    expect(parentLabel('제목 없음.md')).toBe('')
  })

  it('shortLabel 은 바로 위 폴더와 이름만 남긴다 — 깊은 경로가 칩을 벽으로 만들지 않게', () => {
    expect(shortLabel('projects/x/outputs/2026-09-10-review.md')).toBe(
      'outputs · 2026-09-10-review'
    )
    expect(shortLabel('wiki/dou.md')).toBe('위키 · dou')
    expect(shortLabel('README.md')).toBe('README')
  })
})
