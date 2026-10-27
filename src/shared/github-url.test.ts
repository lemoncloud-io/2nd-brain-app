import { describe, expect, it } from 'vitest'
import { githubCloneUrl, githubUrlHint } from './github-url'

describe('githubCloneUrl', () => {
  it.each([
    ['https://github.com/kim/my-brain', 'https://github.com/kim/my-brain.git'],
    ['https://github.com/kim/my-brain.git', 'https://github.com/kim/my-brain.git'],
    ['  github.com/kim/my.brain/ ', 'https://github.com/kim/my.brain.git'],
    ['http://www.github.com/Kim-1/brain_2', 'https://github.com/Kim-1/brain_2.git']
  ])('%s → %s', (input, url) => {
    expect(githubCloneUrl(input)).toBe(url)
  })

  it.each([
    'https://gitlab.com/kim/brain',
    'https://github.com/kim',
    'git@github.com:kim/brain.git',
    ''
  ])('GitHub 저장소 주소가 아니면 null: %s', (input) => {
    expect(githubCloneUrl(input)).toBeNull()
  })
})

describe('githubUrlHint', () => {
  it('빈 칸과 올바른 주소에는 아무 말도 하지 않는다', () => {
    expect(githubUrlHint('')).toBeNull()
    expect(githubUrlHint('   ')).toBeNull()
    expect(githubUrlHint('https://github.com/kim/my-brain')).toBeNull()
  })

  it.each([
    ['git@github.com:kim/brain.git', 'SSH'],
    ['https://github.com/kim/brain/settings', '안쪽'],
    ['https://gitlab.com/kim/brain', 'GitHub 주소가 아니에요'],
    ['그냥 아무 글자', 'https://github.com/계정/저장소']
  ])('%s → %s', (input, phrase) => {
    expect(githubUrlHint(input)).toContain(phrase)
  })

  // 화면이 막는 것과 main 이 거절하는 것이 갈리면 누를 수 있는데 실패하는 버튼이 생긴다
  it('hint 가 없는 입력은 항상 clone 주소가 나온다', () => {
    for (const input of ['github.com/a/b', 'https://github.com/a/b.git', 'www.github.com/a/b/']) {
      expect(githubUrlHint(input)).toBeNull()
      expect(githubCloneUrl(input)).not.toBeNull()
    }
  })
})
