import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../git'
import { appIdentity, setAppUser } from './app-identity'

afterEach(() => setAppUser(null))

describe('appIdentity', () => {
  it('로그인하지 않았으면 앱 이름으로 남긴다', () => {
    expect(appIdentity()).toEqual([
      '-c',
      'user.name=2nd-brain',
      '-c',
      'user.email=vault@2nd-brain.local'
    ])
  })

  // 문서 기록이 "누가 고쳤나" 를 사람마다 가르려면 커밋 작성자가 그 사람의 GitHub 아이디여야 한다
  it('로그인했으면 앱이 만드는 커밋의 작성자가 GitHub 아이디가 된다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'app-identity-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main', dir])
      writeFileSync(join(dir, 'a.md'), 'a\n')
      setAppUser({ login: 'alice', id: 7 })
      git(dir, ['add', '-A'])
      git(dir, [...appIdentity(), 'commit', '-qm', 'edit: a'])
      expect(git(dir, ['log', '-1', '--format=%an <%ae>']).trim()).toBe(
        'alice <7+alice@users.noreply.github.com>'
      )
      setAppUser(null)
      writeFileSync(join(dir, 'a.md'), 'b\n')
      git(dir, ['add', '-A'])
      git(dir, [...appIdentity(), 'commit', '-qm', 'edit: a'])
      expect(git(dir, ['log', '-1', '--format=%an']).trim()).toBe('2nd-brain')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
