import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVault } from './vault-service'
import {
  checkVisibility,
  clearRemote,
  forgetVisibility,
  isPublicRepo,
  remoteHasCommits,
  rememberedVisibility,
  pushFailureMessage,
  pushVault,
  readRemote,
  setRemote
} from './remote-service'

import type { GitFailure } from '../git'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

const exited = (stderr: string): GitFailure => ({ ok: false, code: 128, stderr, failure: 'exit' })

describe('pushFailureMessage', () => {
  // 로그인 창은 더 이상 뜨지 않는다 — 로그인하지 않았거나 로그인이 풀렸으면 앱의 GitHub 로그인으로 보낸다
  it('로그인하지 않아 띄우지 않은 올리기는 로그인부터 하라고 말한다', () => {
    const text = pushFailureMessage({ ok: false, code: null, stderr: '', failure: 'login' })
    expect(text).toContain('GitHub 로그인이 필요해요')
    expect(text).not.toContain('창')
  })

  // 로그인은 있는데 GitHub 가 받지 않았다 — 토큰이 풀린 것이라 로그아웃 뒤 다시 로그인이 할 일이다
  it('로그인이 있는데 거절되면 다시 로그인하라고 말한다', () => {
    expect(
      pushFailureMessage(
        exited('remote: Invalid username or password.\nfatal: Authentication failed for x')
      )
    ).toContain('로그아웃한 뒤 다시 로그인')
  })

  it.each([
    ['remote: Repository not found.\nfatal: repository not found', '찾지 못했어요'],
    ['fatal: could not read Username for https://github.com: terminal prompts disabled', '로그인'],
    [' ! [rejected]        main -> main (fetch first)', '받지 않은 팀 변경'],
    [
      "error: failed to push some refs to 'x'\nhint: Updates were rejected because a pushed branch tip is behind its remote\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.",
      '받지 않은 팀 변경'
    ],
    ['fatal: unable to access: Could not resolve host: github.com', '인터넷']
  ])('%s', (stderr, phrase) => {
    expect(pushFailureMessage(exited(stderr))).toContain(phrase)
  })
})

describe('pushVault', () => {
  it('승인된 기본 브랜치만 원격으로 올리고 작업 브랜치는 올리지 않는다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'remote-'))
    try {
      const vault = join(root, 'vault')
      const bare = join(root, 'backup.git')
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
      execFileSync('mkdir', [vault])
      expect(createVault(vault).ok).toBe(true)
      git(vault, 'checkout', '-q', '-b', 'app/ingest-2026-09-16')
      writeFileSync(join(vault, 'wiki', 'draft.md'), '# draft\n')
      git(vault, 'add', '-A')
      git(vault, 'commit', '-q', '-m', 'ingest')

      expect(readRemote(vault)).toBeNull()
      expect(await pushVault(vault)).toEqual({ ok: false, reason: expect.stringContaining('연결') })

      setRemote(vault, bare)
      expect(readRemote(vault)).toEqual({ url: bare, webUrl: join(root, 'backup') })
      expect(await pushVault(vault)).toEqual({ ok: true })
      expect(git(bare, 'rev-parse', 'main')).toBe(git(vault, 'rev-parse', 'main'))
      expect(git(bare, 'branch', '--list', 'app/*')).toBe('')

      setRemote(vault, join(root, 'missing.git'))
      expect(await pushVault(vault)).toEqual({ ok: false, reason: expect.any(String) })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('isPublicRepo', () => {
  const answer = (status: number): typeof fetch =>
    (() => Promise.resolve(new Response(null, { status }))) as unknown as typeof fetch

  it('로그인 없이 보이면 공개다 — 올린 문서를 누구나 읽는다', async () => {
    const original = globalThis.fetch
    globalThis.fetch = answer(200)
    try {
      expect(await isPublicRepo('https://github.com/me/2nd-brain')).toBe(true)
    } finally {
      globalThis.fetch = original
    }
  })

  it('안 보이면 공개가 아니다', async () => {
    const original = globalThis.fetch
    globalThis.fetch = answer(404)
    try {
      expect(await isPublicRepo('https://github.com/me/2nd-brain')).toBe(false)
    } finally {
      globalThis.fetch = original
    }
  })

  // 확인하지 못한 것을 "비공개" 로 단정하면 공개된 문서를 안전하다고 말하게 된다
  it('확인하지 못하면 판정하지 않는다', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    try {
      expect(await isPublicRepo('https://github.com/me/2nd-brain')).toBeUndefined()
    } finally {
      globalThis.fetch = original
    }
    expect(await isPublicRepo('https://example.com/me/repo')).toBeUndefined()
  })
})

describe('clearRemote', () => {
  it('연결만 지운다 — 올라간 것은 GitHub 에 남으므로 여기서는 지울 수 없다', () => {
    const root = mkdtempSync(join(tmpdir(), 'remote-clear-'))
    try {
      const vault = join(root, 'vault')
      execFileSync('mkdir', [vault])
      expect(createVault(vault).ok).toBe(true)
      setRemote(vault, 'https://github.com/me/2nd-brain.git')
      expect(readRemote(vault)).not.toBeNull()
      clearRemote(vault)
      expect(readRemote(vault)).toBeNull()
      // 두 번 불러도 터지지 않는다 — 이미 끊긴 상태에서 버튼을 다시 누를 수 있다
      expect(() => clearRemote(vault)).not.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('공개 여부 기억', () => {
  const answer = (status: number): typeof fetch =>
    (() => Promise.resolve(new Response(null, { status }))) as unknown as typeof fetch

  // 비인증 GitHub API 는 IP 당 시간 60회다 — 화면 갱신마다 물으면 한도를 태우고 경고가 조용히 사라진다
  it('한 번 물어본 주소는 다시 묻지 않는다', async () => {
    const original = globalThis.fetch
    let calls = 0
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      calls += 1
      return answer(200)(...args)
    }) as unknown as typeof fetch
    try {
      forgetVisibility()
      expect(rememberedVisibility('https://github.com/me/memo')).toBe('miss')
      expect(await checkVisibility('https://github.com/me/memo')).toBe(true)
      expect(rememberedVisibility('https://github.com/me/memo')).toBe(true)
      expect(calls).toBe(1)

      forgetVisibility('https://github.com/me/memo')
      expect(rememberedVisibility('https://github.com/me/memo')).toBe('miss')
    } finally {
      globalThis.fetch = original
      forgetVisibility()
    }
  })
})

describe('remoteHasCommits', () => {
  it('빈 저장소와 내용이 있는 저장소를 가른다 — 남의 내용 위에 덮어쓰지 않는다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'remote-empty-'))
    try {
      const vault = join(root, 'vault')
      const bare = join(root, 'backup.git')
      execFileSync('mkdir', [vault])
      expect(createVault(vault).ok).toBe(true)
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
      expect(await remoteHasCommits(vault, bare)).toBe(false)

      // 올리고 나면 그 저장소에는 내용이 있다
      setRemote(vault, bare)
      expect((await pushVault(vault)).ok).toBe(true)
      expect(await remoteHasCommits(vault, bare)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('읽지 못하면 비어 있다고 단정하지 않는다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'remote-unknown-'))
    try {
      const vault = join(root, 'vault')
      execFileSync('mkdir', [vault])
      expect(createVault(vault).ok).toBe(true)
      expect(await remoteHasCommits(vault, join(root, 'missing.git'))).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
