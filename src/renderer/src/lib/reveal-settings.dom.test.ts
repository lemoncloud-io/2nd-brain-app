// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GITHUB_SECTION, revealSettingsSection } from './reveal-settings'

// requestAnimationFrame 스텁 — 콜백을 모아 두었다가 flush 로 동기 실행한다.
// jsdom 에는 rAF 가 없고 offsetParent 는 항상 null 이라 보이는 경우는 직접 깔아 준다.
let queued: FrameRequestCallback[] = []
let rafCount = 0

const installRaf = (): void => {
  queued = []
  rafCount = 0
  vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback): number => {
    queued.push(cb)
    rafCount += 1
    return rafCount
  }) as typeof requestAnimationFrame)
}

const flush = (maxRounds = 70): void => {
  for (let round = 0; round < maxRounds && queued.length > 0; round += 1) {
    const batch = queued
    queued = []
    for (const cb of batch) cb(0)
  }
}

const show = (el: HTMLElement): void => {
  Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('revealSettingsSection', () => {
  it('보이는 묶음이면 그 자리로 스크롤하고 제목에 초점을 둔다', () => {
    installRaf()
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    try {
      document.body.innerHTML =
        '<section id="settings-github"><h2 id="settings-github-title" tabindex="-1">묶음</h2></section>'
      const section = document.getElementById(GITHUB_SECTION)!
      show(section)
      revealSettingsSection(GITHUB_SECTION)
      flush()
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
      expect(document.activeElement?.id).toBe('settings-github-title')
    } finally {
      // @ts-expect-error jsdom 에는 원래 없다 — 빌려 쓴 자리만 지운다
      delete window.HTMLElement.prototype.scrollIntoView
    }
  })

  it('없는 id 면 61프레임 뒤에 조용히 그만둔다', () => {
    installRaf()
    revealSettingsSection('settings-없음')
    flush()
    expect(rafCount).toBe(61)
    expect(queued).toHaveLength(0)
  })

  it('계속 안 보이면 61프레임 뒤에 조용히 그만둔다', () => {
    installRaf()
    document.body.innerHTML = '<section id="settings-github"></section>'
    revealSettingsSection(GITHUB_SECTION)
    flush()
    expect(rafCount).toBe(61)
    expect(queued).toHaveLength(0)
  })

  it('제목이 없어도 스크롤은 하고 던지지 않는다', () => {
    installRaf()
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    try {
      document.body.innerHTML = '<section id="settings-github"></section>'
      show(document.getElementById(GITHUB_SECTION)!)
      revealSettingsSection(GITHUB_SECTION)
      flush()
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    } finally {
      // @ts-expect-error jsdom 에는 원래 없다 — 빌려 쓴 자리만 지운다
      delete window.HTMLElement.prototype.scrollIntoView
    }
  })
})
