import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVault } from '../vault/vault-service'
import { setRemote } from '../vault/remote-service'
import { writeFileSync } from 'node:fs'
import type { SyncState } from '../../shared/ipc-contract'
import {
  publishApproved,
  readTeamReview,
  shareToTeam,
  unshare,
  type PublishDeps,
  type ShareDeps
} from './team-share'
import { mainT } from '../i18n'

const vault = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'team-share-'))
  const dir = join(root, 'vault')
  mkdirSync(dir)
  expect(createVault(dir).ok).toBe(true)
  return dir
}

type Calls = {
  isPublic: ReturnType<typeof vi.fn>
  push: ReturnType<typeof vi.fn>
  openPullRequest: ReturnType<typeof vi.fn>
}

const deps = (overrides: Partial<Calls> = {}): ShareDeps & Calls => {
  const calls = {
    // 기본은 비공개 — 공개 판정은 그 자리를 다루는 테스트가 따로 덮는다
    isPublic: vi.fn().mockResolvedValue(false),
    push: vi.fn().mockResolvedValue({ ok: true }),
    openPullRequest: vi
      .fn()
      .mockResolvedValue({ ok: true, number: 7, url: 'https://github.com/t/v/pull/7' }),
    ...overrides
  }
  return calls as unknown as ShareDeps & Calls
}

describe('shareToTeam', () => {
  it('팀 저장소가 연결돼 있으면 작업을 올리고 PR 을 열어 기억한다', async () => {
    const dir = vault()
    try {
      setRemote(dir, 'https://github.com/t/v.git')
      const calls = deps()
      const result = await shareToTeam(dir, 'app/ingest-2026-09-16', calls)
      expect(result).toEqual({
        ok: true,
        review: { number: 7, url: 'https://github.com/t/v/pull/7' }
      })
      expect(calls.push).toHaveBeenCalledWith(dir, 'app/ingest-2026-09-16')
      expect(readTeamReview(dir, 'app/ingest-2026-09-16')).toEqual({
        number: 7,
        url: 'https://github.com/t/v/pull/7'
      })
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })

  it('공개 저장소면 올리지 않는다 — 승인도 올리기다', async () => {
    const dir = vault()
    try {
      setRemote(dir, 'https://github.com/t/v.git')
      const calls = deps({ isPublic: vi.fn().mockResolvedValue(true) })
      const result = await shareToTeam(dir, 'app/ingest-2026-09-16', calls)
      expect(result.ok).toBe(false)
      expect(calls.push).not.toHaveBeenCalled()
      expect(calls.openPullRequest).not.toHaveBeenCalled()
      expect(readTeamReview(dir, 'app/ingest-2026-09-16')).toBeNull()
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })

  it('공개 여부를 확인하지 못하면 막지 않는다 — 모른다고 올리기를 멈추면 그것도 손해다', async () => {
    const dir = vault()
    try {
      setRemote(dir, 'https://github.com/t/v.git')
      const calls = deps({ isPublic: vi.fn().mockResolvedValue(undefined) })
      expect((await shareToTeam(dir, 'app/ingest-2026-09-16', calls)).ok).toBe(true)
      expect(calls.push).toHaveBeenCalled()
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })

  it('팀 저장소가 없으면 조용히 넘어간다 — 혼자 쓰는 보관함도 있다', async () => {
    const dir = vault()
    try {
      const calls = deps()
      expect(await shareToTeam(dir, 'app/ingest-2026-09-16', calls)).toEqual({
        ok: true,
        review: null
      })
      expect(calls.push).not.toHaveBeenCalled()
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })

  it('PR 을 열지 못해도 사유만 돌려준다 — 내 위키의 승인은 그대로다', async () => {
    const dir = vault()
    try {
      setRemote(dir, 'https://github.com/t/v.git')
      const calls = deps({
        openPullRequest: vi
          .fn()
          .mockResolvedValue({ ok: false, reason: '조직 관리자 승인이 필요하다' })
      })
      const result = await shareToTeam(dir, 'app/ingest-2026-09-16', calls)
      expect(result).toEqual({ ok: false, reason: '조직 관리자 승인이 필요하다' })
      expect(readTeamReview(dir, 'app/ingest-2026-09-16')).toBeNull()
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })

  it('올리기가 실패하면 PR 을 열지 않는다', async () => {
    const dir = vault()
    try {
      setRemote(dir, 'https://github.com/t/v.git')
      const calls = deps({
        push: vi.fn().mockResolvedValue({ ok: false, reason: 'GitHub 로그인이 끝나지 않았다' })
      })
      const result = await shareToTeam(dir, 'app/ingest-2026-09-16', calls)
      expect(result).toEqual({ ok: false, reason: 'GitHub 로그인이 끝나지 않았다' })
      expect(calls.openPullRequest).not.toHaveBeenCalled()
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })
})

describe('unshare', () => {
  it('열어 둔 것을 닫고 기억에서 지운다', async () => {
    const dir = vault()
    try {
      setRemote(dir, 'https://github.com/t/v.git')
      await shareToTeam(dir, 'app/ingest-2026-09-16', deps())
      const close = vi.fn().mockResolvedValue({ ok: true as const })
      expect(await unshare(dir, 'app/ingest-2026-09-16', { closePullRequest: close })).toEqual({
        ok: true
      })
      expect(close).toHaveBeenCalledWith('https://github.com/t/v.git', 7)
      expect(readTeamReview(dir, 'app/ingest-2026-09-16')).toBeNull()
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })

  it('닫지 못하면 기억을 지우지 않는다 — 다시 시도할 수 있어야 한다', async () => {
    const dir = vault()
    try {
      setRemote(dir, 'https://github.com/t/v.git')
      await shareToTeam(dir, 'app/ingest-2026-09-16', deps())
      const close = vi.fn().mockResolvedValue({ ok: false as const, reason: '이미 머지됐다' })
      expect(await unshare(dir, 'app/ingest-2026-09-16', { closePullRequest: close })).toEqual({
        ok: false,
        reason: '이미 머지됐다'
      })
      expect(readTeamReview(dir, 'app/ingest-2026-09-16')).not.toBeNull()
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })

  it('열어 둔 것이 없으면 할 일이 없다', async () => {
    const dir = vault()
    try {
      const close = vi.fn()
      expect(await unshare(dir, 'app/ingest-2026-09-16', { closePullRequest: close })).toEqual({
        ok: true
      })
      expect(close).not.toHaveBeenCalled()
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })
})

const SYNCED: SyncState = {
  received: 0,
  conflicts: [],
  at: 1,
  error: null,
  running: false,
  ahead: 1,
  aheadFiles: [],
  newDocs: [],
  behind: 0,
  shared: null,
  skipped: null,
  held: null,
  via: null
}

type PublishCalls = Calls & {
  isPersonal: ReturnType<typeof vi.fn>
  sync: ReturnType<typeof vi.fn>
  pushDefault: ReturnType<typeof vi.fn>
}

const publishDeps = (overrides: Partial<PublishCalls> = {}): PublishDeps & PublishCalls => {
  const calls = {
    ...deps(),
    // 기본은 혼자 쓰는 내 저장소 — 팀 저장소 판정은 그 자리를 다루는 테스트가 따로 덮는다
    isPersonal: vi.fn().mockResolvedValue(true),
    sync: vi.fn().mockResolvedValue(SYNCED),
    pushDefault: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides
  }
  return calls as unknown as PublishDeps & PublishCalls
}

const BRANCH = 'app/ingest-2026-10-22'

describe('publishApproved', () => {
  const withRemote = async (url: string, body: (dir: string) => Promise<void>): Promise<void> => {
    const dir = vault()
    try {
      setRemote(dir, url)
      await body(dir)
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  }

  it('혼자 쓰는 내 저장소면 받은 뒤 기본 줄기를 올리고 확인 요청은 열지 않는다', () =>
    withRemote('https://github.com/alice/2nd-brain.git', async (dir) => {
      const calls = publishDeps()
      const result = await publishApproved(dir, BRANCH, calls)
      expect(result).toEqual({
        teamReview: null,
        shareError: null,
        published: 'https://github.com/alice/2nd-brain',
        publishError: null
      })
      expect(calls.isPersonal).toHaveBeenCalledWith('https://github.com/alice/2nd-brain.git')
      // 순서는 "지금 올리기" 와 같다 — 받기 → 공개 검사 → 올리기
      const order = [calls.sync, calls.isPublic, calls.pushDefault].map(
        (fn) => fn.mock.invocationCallOrder[0]
      )
      expect(order).toEqual([...order].sort((a, b) => a! - b!))
      expect(calls.pushDefault).toHaveBeenCalledWith(dir)
      expect(calls.push).not.toHaveBeenCalled()
      expect(calls.openPullRequest).not.toHaveBeenCalled()
      expect(readTeamReview(dir, BRANCH)).toBeNull()
    }))

  it('구성원이 있거나 조직 저장소면(개인 아님) 지금처럼 팀 확인 요청을 연다', () =>
    withRemote('https://github.com/acme/team.git', async (dir) => {
      const calls = publishDeps({ isPersonal: vi.fn().mockResolvedValue(false) })
      const result = await publishApproved(dir, BRANCH, calls)
      expect(result).toEqual({
        teamReview: { number: 7, url: 'https://github.com/t/v/pull/7' },
        shareError: null,
        published: null,
        publishError: null
      })
      expect(calls.push).toHaveBeenCalledWith(dir, BRANCH)
      expect(calls.sync).not.toHaveBeenCalled()
      expect(calls.pushDefault).not.toHaveBeenCalled()
    }))

  // 확인 요청 기록은 되돌리기만 지운다 — GitHub 에서 합쳐진 요청의 기록이 남아 있어도 혼자 저장소의 바로 올리기를 막지 않는다.
  // 아직 열려 있는지는 받은 뒤의 `SyncState.shared`(edit-share.ts pendingReview)가 판정한다
  it('이미 합쳐진 팀 확인 요청의 기록만 남았으면 개인 저장소는 바로 올린다', () =>
    withRemote('https://github.com/alice/2nd-brain.git', async (dir) => {
      writeFileSync(
        join(dir, '.git', '2nd-brain-team-reviews.json'),
        JSON.stringify({ 'app/ingest-2026-10-01': { number: 3, url: 'https://x/pull/3' } })
      )
      const calls = publishDeps()
      const result = await publishApproved(dir, BRANCH, calls)
      expect(calls.pushDefault).toHaveBeenCalledWith(dir)
      expect(calls.openPullRequest).not.toHaveBeenCalled()
      expect(result.published).toBe('https://github.com/alice/2nd-brain')
    }))

  it('내 수정으로 열어 둔 확인 요청이 있어도 확인 요청 쪽으로 간다', () =>
    withRemote('https://github.com/alice/2nd-brain.git', async (dir) => {
      const calls = publishDeps({
        sync: vi
          .fn()
          .mockResolvedValue({ ...SYNCED, shared: { url: 'https://x/pull/4', unsent: 0 } })
      })
      await publishApproved(dir, BRANCH, calls)
      expect(calls.pushDefault).not.toHaveBeenCalled()
      expect(calls.openPullRequest).toHaveBeenCalled()
    }))

  it('공개 저장소면 자동으로도 올리지 않는다', () =>
    withRemote('https://github.com/alice/2nd-brain.git', async (dir) => {
      const calls = publishDeps({ isPublic: vi.fn().mockResolvedValue(true) })
      const result = await publishApproved(dir, BRANCH, calls)
      expect(result.publishError).toBe(mainT().syncMain.publicRepo)
      expect(result.published).toBeNull()
      expect(calls.pushDefault).not.toHaveBeenCalled()
    }))

  it('팀 변경을 받지 못했으면 올리지 않고 사유를 돌려준다', () =>
    withRemote('https://github.com/alice/2nd-brain.git', async (dir) => {
      const calls = publishDeps({
        sync: vi.fn().mockResolvedValue({ ...SYNCED, error: 'GitHub에 연결하지 못했어요' })
      })
      const result = await publishApproved(dir, BRANCH, calls)
      expect(result.publishError).toBe('GitHub에 연결하지 못했어요')
      expect(calls.pushDefault).not.toHaveBeenCalled()
    }))

  it('올리기가 거절되면 사유를 돌려주고 확인 요청으로 돌아가지 않는다', () =>
    withRemote('https://github.com/alice/2nd-brain.git', async (dir) => {
      const calls = publishDeps({
        pushDefault: vi.fn().mockResolvedValue({ ok: false, reason: '거절' })
      })
      const result = await publishApproved(dir, BRANCH, calls)
      expect(result).toEqual({
        teamReview: null,
        shareError: null,
        published: null,
        publishError: '거절'
      })
      expect(calls.openPullRequest).not.toHaveBeenCalled()
    }))

  it('GitHub 저장소가 연결돼 있지 않으면 아무것도 묻지 않는다', async () => {
    const dir = vault()
    try {
      const calls = publishDeps()
      expect(await publishApproved(dir, BRANCH, calls)).toEqual({
        teamReview: null,
        shareError: null,
        published: null,
        publishError: null
      })
      expect(calls.isPersonal).not.toHaveBeenCalled()
      expect(calls.sync).not.toHaveBeenCalled()
    } finally {
      rmSync(join(dir, '..'), { recursive: true, force: true })
    }
  })
})
