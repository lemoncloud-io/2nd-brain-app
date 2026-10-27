import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVault } from '../vault/vault-service'
import { setRemote } from '../vault/remote-service'
import { editShareState, readEditShare, shareEdits, type EditShareDeps } from './edit-share'
import { mainT } from '../i18n'

const vault = (): { root: string; dir: string } => {
  const root = mkdtempSync(join(tmpdir(), 'edit-share-'))
  const dir = join(root, 'vault')
  mkdirSync(dir)
  expect(createVault(dir).ok).toBe(true)
  setRemote(dir, 'https://github.com/t/v.git')
  return { root, dir }
}

type Calls = {
  isPublic: ReturnType<typeof vi.fn>
  push: ReturnType<typeof vi.fn>
  openPullRequest: ReturnType<typeof vi.fn>
  isOpen: ReturnType<typeof vi.fn>
}

const deps = (over: Partial<Record<keyof EditShareDeps, unknown>> = {}): EditShareDeps & Calls => {
  const calls = {
    isPublic: vi.fn().mockResolvedValue(false),
    push: vi.fn().mockResolvedValue({ ok: true }),
    openPullRequest: vi
      .fn()
      .mockResolvedValue({ ok: true, number: 9, url: 'https://github.com/t/v/pull/9' }),
    isOpen: vi.fn().mockResolvedValue(true),
    now: () => new Date(2026, 8, 24, 14, 5),
    ...over
  }
  return calls as unknown as EditShareDeps & Calls
}

describe('shareEdits', () => {
  it('기본 줄기를 새 이름으로 올리고 요청을 열어 기억한다 — 제목·본문에 고친 파일이 있다', async () => {
    const { root, dir } = vault()
    try {
      const d = deps()
      const result = await shareEdits(dir, ['wiki/a.md', 'wiki/b.md'], d)
      expect(result).toEqual({
        ok: true,
        added: false,
        share: {
          branch: 'app/edits-2026-09-24-1405',
          number: 9,
          url: 'https://github.com/t/v/pull/9'
        }
      })
      expect(d.push).toHaveBeenCalledWith(dir, 'main', 'app/edits-2026-09-24-1405')
      const input = d.openPullRequest.mock.calls[0]![0] as {
        title: string
        body: string
        base: string
      }
      expect(input.title).toBe('edit: wiki/a.md 외 1개')
      expect(input.base).toBe('main')
      expect(input.body).toContain('- wiki/b.md')
      expect(d.isOpen).not.toHaveBeenCalled()
      expect(readEditShare(dir)?.number).toBe(9)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('열어 둔 요청이 아직 열려 있으면 같은 이름으로 다시 올려 거기에 더한다', async () => {
    const { root, dir } = vault()
    try {
      await shareEdits(dir, ['wiki/a.md'], deps())
      const d = deps({ now: () => new Date(2026, 8, 25, 9, 0) })
      const result = await shareEdits(dir, ['wiki/a.md', 'wiki/c.md'], d)
      expect(result).toMatchObject({ ok: true, added: true, share: { number: 9 } })
      expect(d.push).toHaveBeenCalledWith(dir, 'main', 'app/edits-2026-09-24-1405')
      expect(d.openPullRequest).not.toHaveBeenCalled()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('예전 요청이 닫혔으면 새 이름으로 새 요청을 연다 — 열려 있는지 모르면 보내지 않는다', async () => {
    const { root, dir } = vault()
    try {
      await shareEdits(dir, ['wiki/a.md'], deps())
      const closed = deps({
        isOpen: vi.fn().mockResolvedValue(false),
        now: () => new Date(2026, 8, 25, 9, 0),
        openPullRequest: vi
          .fn()
          .mockResolvedValue({ ok: true, number: 10, url: 'https://github.com/t/v/pull/10' })
      })
      expect(await shareEdits(dir, ['wiki/c.md'], closed)).toMatchObject({
        ok: true,
        added: false,
        share: { branch: 'app/edits-2026-09-25-0900', number: 10 }
      })
      const unknown = deps({ isOpen: vi.fn().mockResolvedValue(null) })
      expect(await shareEdits(dir, ['wiki/c.md'], unknown)).toMatchObject({ ok: false })
      expect(unknown.push).not.toHaveBeenCalled()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('공개 저장소·올리기 실패·요청 실패는 이유를 돌려주고 기억하지 않는다', async () => {
    const { root, dir } = vault()
    try {
      const open = deps({ isPublic: vi.fn().mockResolvedValue(true) })
      expect(await shareEdits(dir, ['a.md'], open)).toEqual({
        ok: false,
        reason: mainT().syncMain.publicRepo
      })
      expect(open.push).not.toHaveBeenCalled()
      const noPush = deps({ push: vi.fn().mockResolvedValue({ ok: false, reason: '막혔다' }) })
      expect(await shareEdits(dir, ['a.md'], noPush)).toEqual({ ok: false, reason: '막혔다' })
      const noPr = deps({
        openPullRequest: vi.fn().mockResolvedValue({ ok: false, reason: '권한이 없다' })
      })
      expect(await shareEdits(dir, ['a.md'], noPr)).toEqual({ ok: false, reason: '권한이 없다' })
      expect(readEditShare(dir)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('editShareState', () => {
  it('안 올린 작업이 없으면 기억을 지운다', async () => {
    const { root, dir } = vault()
    try {
      await shareEdits(dir, ['a.md'], deps())
      expect(await editShareState(dir, 2)).toMatchObject({ url: 'https://github.com/t/v/pull/9' })
      expect(await editShareState(dir, 0)).toBeNull()
      expect(readEditShare(dir)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('팀 확인 중인 위키화가 기본 줄기에 들어 있을 때', () => {
  const git = (dir: string, ...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      encoding: 'utf8'
    }).trim()

  /** 위키화를 승인해 로컬에 병합하고 그 작업을 팀 PR 로 올려 둔 상태 — 원격 추적 이름은 손으로 둔다 */
  const approvedIngest = (dir: string): void => {
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'main')
    git(dir, 'checkout', '-q', '-b', 'app/ingest-2026-09-30')
    writeFileSync(join(dir, 'wiki', 'new-page.md'), '# 새 페이지\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-qm', 'ingest: run')
    git(dir, 'update-ref', 'refs/remotes/origin/app/ingest-2026-09-30', 'HEAD')
    git(dir, 'checkout', '-q', 'main')
    git(
      dir,
      'merge',
      '--no-ff',
      '-q',
      '-m',
      'merge: app/ingest-2026-09-30',
      'app/ingest-2026-09-30'
    )
    writeFileSync(
      join(dir, '.git', '2nd-brain-team-reviews.json'),
      JSON.stringify({
        'app/ingest-2026-09-30': { number: 3, url: 'https://github.com/t/v/pull/3' }
      })
    )
  }

  it('승인만 했으면 새로 보낼 것이 없고 "팀 확인 중" 은 위키화 요청을 가리킨다', async () => {
    const { root, dir } = vault()
    try {
      approvedIngest(dir)
      expect(await editShareState(dir, 2)).toEqual({
        url: 'https://github.com/t/v/pull/3',
        unsent: 0
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('그 뒤 고친 것은 새 요청을 열지 않고 위키화 요청에 더한다 — 위키화 페이지가 두 요청에 실리지 않는다', async () => {
    const { root, dir } = vault()
    try {
      approvedIngest(dir)
      writeFileSync(join(dir, 'wiki', 'INDEX.md'), '# 고친 목차\n')
      git(dir, 'commit', '-qam', 'edit: INDEX')
      expect(await editShareState(dir, 3)).toMatchObject({ unsent: 1 })

      const d = deps()
      const result = await shareEdits(dir, ['wiki/INDEX.md'], d)
      expect(result).toMatchObject({ ok: true, added: true, share: { number: 3 } })
      expect(d.push).toHaveBeenCalledWith(dir, 'main', 'app/ingest-2026-09-30')
      expect(d.openPullRequest).not.toHaveBeenCalled()
      expect(readEditShare(dir)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('위키화 요청을 팀이 닫았으면 거기에 싣지 않고 새 요청을 연다', async () => {
    const { root, dir } = vault()
    try {
      approvedIngest(dir)
      writeFileSync(join(dir, 'wiki', 'INDEX.md'), '# 고친 목차\n')
      git(dir, 'commit', '-qam', 'edit: INDEX')
      const d = deps({ isOpen: vi.fn().mockResolvedValue(false) })
      const result = await shareEdits(dir, ['wiki/INDEX.md'], d)
      expect(result).toMatchObject({ ok: true, added: false, share: { number: 9 } })
      expect(d.push).not.toHaveBeenCalledWith(dir, 'main', 'app/ingest-2026-09-30')
      expect(d.openPullRequest).toHaveBeenCalled()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('위키화 요청이 열려 있는지 모르면 보내지 않는다', async () => {
    const { root, dir } = vault()
    try {
      approvedIngest(dir)
      const d = deps({ isOpen: vi.fn().mockResolvedValue(null) })
      const result = await shareEdits(dir, ['wiki/INDEX.md'], d)
      expect(result).toMatchObject({ ok: false })
      expect(d.push).not.toHaveBeenCalled()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('내 수정 요청이 팀에 squash 로 들어갔으면 잊는다 — 닫힌 요청을 "팀 확인 중" 으로 두지 않는다', async () => {
    const { root, dir } = vault()
    try {
      git(dir, 'update-ref', 'refs/remotes/origin/main', 'main')
      await shareEdits(dir, ['wiki/INDEX.md'], deps())
      writeFileSync(join(dir, 'wiki', 'INDEX.md'), '# 고친 목차\n')
      git(dir, 'commit', '-qam', 'edit: INDEX')
      git(dir, 'update-ref', 'refs/remotes/origin/app/edits-2026-09-24-1405', 'main')
      // 팀이 같은 내용을 다른 커밋으로 받아들였다
      git(dir, 'checkout', '-q', '--detach', 'refs/remotes/origin/main')
      writeFileSync(join(dir, 'wiki', 'INDEX.md'), '# 고친 목차\n')
      git(dir, 'commit', '-qam', 'squash (#9)')
      git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
      git(dir, 'checkout', '-q', 'main')

      expect(await editShareState(dir, 1)).toBeNull()
      expect(readEditShare(dir)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
