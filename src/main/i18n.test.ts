import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeLanguage, mainLanguage, mainT, setMainLanguage } from './i18n'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'main-i18n-'))
  dirs.push(dir)
  return dir
}

describe('main i18n', () => {
  afterEach(() => {
    setMainLanguage('ko')
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('기본은 한국어이고, 고른 언어로 바뀐다', () => {
    expect(mainLanguage()).toBe('ko')
    expect(mainT().appearance.title).toBe('화면')
    setMainLanguage('en')
    expect(mainT().appearance.title).toBe('Appearance')
  })

  it('설정에서 바꾸면 저장하고 main 문구도 같은 언어가 되며 창들에 알린다', () => {
    const dir = tempDir()
    const notify = vi.fn()
    expect(changeLanguage(dir, 'en', notify)).toBe('en')
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).language).toBe('en')
    expect(mainT().appearance.title).toBe('Appearance')
    expect(notify).toHaveBeenCalledWith('en')
  })

  it('main 은 모듈 최상단 상수에 문구를 굳히지 않는다 — 언어를 바꿔도 남는다', () => {
    const files = readdirSync('src/main', { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts')
    )
    // `=` 뒤 줄바꿈(prettier 가 긴 줄을 접은 모양)까지 본다
    const TOP_LEVEL = /^(?:export )?(?:const|let) \w+[^=\n]*=\s*(?![\s(]|async )[^\n]*mainT\(\)/gm
    const frozen = files.flatMap((file) =>
      [...readFileSync(join('src/main', file), 'utf8').matchAll(TOP_LEVEL)].map(
        (match) => `${file}: ${match[0]}`
      )
    )
    expect(frozen).toEqual([])
  })

  it('모르는 값은 한국어로 거른다', () => {
    expect(changeLanguage(tempDir(), 'fr', () => undefined)).toBe('ko')
    expect(mainLanguage()).toBe('ko')
  })

  it('저장이 실패하면 main 언어도 알림도 그대로다', () => {
    const notify = vi.fn()
    // 폴더가 아니라 파일 아래를 가리킨다 — saveSettings 의 mkdirSync 가 던진다
    const file = join(tempDir(), 'not-a-folder')
    writeFileSync(file, '')
    const blocked = join(file, 'user-data')
    expect(() => changeLanguage(blocked, 'en', notify)).toThrow()
    expect(mainLanguage()).toBe('ko')
    expect(notify).not.toHaveBeenCalled()
  })
})
