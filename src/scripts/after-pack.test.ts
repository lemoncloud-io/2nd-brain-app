import { afterEach, describe, expect, it } from 'vitest'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { linkGitBuiltins } from '../../scripts/after-pack.mjs'

let core = ''
afterEach(() => {
  if (core !== '') rmSync(core, { recursive: true, force: true })
  core = ''
})

// 가짜 git-core — git 본체 + 같은 내용 복제 2개 + 같은 길이 다른 내용 + 다른 길이 + 하위 폴더 + 기존 심링크
// 가짜 .app — linkGitBuiltins 가 내부 git-core 경로를 스스로 만든다
const GIT_CORE = 'Contents/Resources/app.asar.unpacked/node_modules/dugite/git/libexec/git-core'
const fixture = (): { app: string; dir: string } => {
  core = mkdtempSync(join(tmpdir(), 'after-pack-'))
  const dir = join(core, GIT_CORE)
  mkdirSync(dir, { recursive: true })
  const git = Buffer.from('git-binary-content-0123456789')
  writeFileSync(join(dir, 'git'), git)
  writeFileSync(join(dir, 'git-add'), git)
  writeFileSync(join(dir, 'git-commit'), git)
  writeFileSync(join(dir, 'same-size'), Buffer.from('x'.repeat(git.length)))
  writeFileSync(join(dir, 'other'), Buffer.from('short'))
  mkdirSync(join(dir, 'subdir'))
  symlinkSync('git', join(dir, 'already-link'))
  return { app: core, dir }
}

describe('scripts/after-pack.mjs linkGitBuiltins', () => {
  it('같은 내용 복제는 git 심링크로 바꾸고 나머지는 두지 않는다', () => {
    const { app, dir } = fixture()
    linkGitBuiltins(app)
    for (const name of ['git-add', 'git-commit']) {
      const stat = lstatSync(join(dir, name))
      expect(stat.isSymbolicLink()).toBe(true)
    }
    // 같은 길이지만 내용이 다르면 링크하지 않는다 — 크기 선필터만으로 끝내지 않는다
    const gitLen = readFileSync(join(dir, 'git')).length
    const sameSize = readFileSync(join(dir, 'same-size'))
    expect(lstatSync(join(dir, 'same-size')).isFile()).toBe(true)
    expect(sameSize.length).toBe(gitLen)
    expect(sameSize.toString()).toBe('x'.repeat(gitLen))
    expect(lstatSync(join(dir, 'other')).isFile()).toBe(true)
    expect(lstatSync(join(dir, 'subdir')).isDirectory()).toBe(true)
    expect(lstatSync(join(dir, 'already-link')).isSymbolicLink()).toBe(true)
    expect(lstatSync(join(dir, 'git')).isFile()).toBe(true)
  })
})
