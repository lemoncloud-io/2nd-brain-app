// shared 헬퍼는 인자로 언어를 받지 않고 부르는 시점의 프로세스 언어를 따른다 — 모듈 상수에 굳은 문구가 없어야 한다.
import { afterEach, describe, expect, it } from 'vitest'
import { currentLanguage, setCurrentLanguage } from './index'
import { describeEngineFailure } from '../engine-failure'
import { githubUrlHint } from '../github-url'
import { VAULT_TEMPLATES } from '../vault-templates'
import { readDefect } from '../wiki/verify-defect'

afterEach(() => setCurrentLanguage('ko'))

describe('currentT — shared helpers follow the process language at call time', () => {
  it('starts in Korean', () => {
    expect(currentLanguage()).toBe('ko')
    expect(githubUrlHint('git@github.com:a/b.git')).toMatch(/^SSH 주소예요/)
  })

  it('switching to English changes helper output without reloading modules', () => {
    setCurrentLanguage('en')
    expect(githubUrlHint('git@github.com:a/b.git')).toMatch(/^That's an SSH address/)
    expect(describeEngineFailure('rate limit', 'Wikify stopped')).toBe(
      "Wikify stopped — You've reached the AI usage limit. You can use it again in a while"
    )
    expect(readDefect('wiki/a.md: duplicate key').fix).toBe(
      'The properties block has the same name twice. Keep only one'
    )
  })

  it('module-level tables read their labels at access time', () => {
    const research = VAULT_TEMPLATES.find((t) => t.id === 'research')!
    expect(research.name).toBe('리서치')
    setCurrentLanguage('en')
    expect(research.name).toBe('Research')
    // 토픽 설명은 볼트에 쓰는 본문이라 화면 언어와 상관없이 한국어다(D8)
    expect(research.topics[0]!.description).toBe('지금 답을 찾고 있는 질문')
  })

  it('English usage-limit time is a clock, not Korean hour words', () => {
    setCurrentLanguage('en')
    const at = new Date(2026, 9, 23, 15, 5)
    const text = describeEngineFailure(`usage limit reached|${Math.floor(at.getTime() / 1000)}`)
    expect(text).toBe("You've reached the AI usage limit. You can use it again around 15:05")
  })
})
