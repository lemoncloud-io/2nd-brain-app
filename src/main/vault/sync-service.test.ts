import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { INGEST_LOCK } from '../engine/cli-process'
import { vaultActivity } from './vault-activity'
import { createVault } from './vault-service'
import { pushVault, setRemote } from './remote-service'
import {
  commitNewDocs,
  conflictSides,
  lookForTeamChanges,
  newDocs,
  resolveConflict,
  restoreVault,
  saveEdits,
  syncVault,
  unpushedCount,
  unpushedFiles,
  unreceivedCount
} from './sync-service'
import { fetchFailureMessage } from './sync-failure'
import { keptAsideName } from './sync-text'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

const commit = (dir: string, message: string): void => {
  git(dir, 'add', '-A')
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message)
}

/** 팀 저장소 하나에 붙은 두 컴퓨터 — 내 볼트와 동료 볼트 */
const team = async (): Promise<{ root: string; mine: string; mate: string }> => {
  const root = mkdtempSync(join(tmpdir(), 'sync-'))
  const mine = join(root, 'mine')
  const bare = join(root, 'team.git')
  mkdirSync(mine)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  expect(createVault(mine).ok).toBe(true)
  setRemote(mine, bare)
  expect((await pushVault(mine)).ok).toBe(true)
  const mate = join(root, 'mate')
  execFileSync('git', ['clone', '-q', bare, mate])
  git(mate, 'config', 'user.name', 'mate')
  git(mate, 'config', 'user.email', 'mate@t')
  return { root, mine, mate }
}

describe('fetchFailureMessage', () => {
  it('로그인하지 않았으면 로그인부터, 로그인이 거절되면 다시 로그인하라고 말한다', () => {
    expect(fetchFailureMessage({ ok: false, code: null, stderr: '', failure: 'login' })).toContain(
      'GitHub 로그인이 필요해요'
    )
    expect(
      fetchFailureMessage({
        ok: false,
        code: 128,
        stderr: 'fatal: Authentication failed for x',
        failure: 'exit'
      })
    ).toContain('로그아웃한 뒤 다시 로그인')
  })
})

describe('lookForTeamChanges', () => {
  it('팀 새 변경을 세기만 하고 합치지 않는다 — 받은 뒤에는 0건이다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'mate.md'), '# 동료 문서\n')
      commit(mate, 'mate page')
      writeFileSync(join(mate, 'wiki', 'mate2.md'), '# 동료 둘째\n')
      commit(mate, 'mate second')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 내가 고친 목차\n')

      expect(await unreceivedCount(mine)).toBe(0)
      await lookForTeamChanges(mine)
      expect(await unreceivedCount(mine)).toBe(2)
      expect(existsSync(join(mine, 'wiki', 'mate.md'))).toBe(false)
      expect(git(mine, 'status', '--porcelain')).toContain('wiki/INDEX.md')

      expect((await syncVault(mine)).ok).toBe(true)
      expect(await unreceivedCount(mine)).toBe(0)
      expect(readFileSync(join(mine, 'wiki', 'INDEX.md'), 'utf8')).toBe('# 내가 고친 목차\n')
      expect(existsSync(join(mine, 'wiki', 'mate2.md'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('연결이 없으면 조용히 넘어가고 0건이다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sync-alone-'))
    try {
      expect(createVault(root).ok).toBe(true)
      await expect(lookForTeamChanges(root)).resolves.toBeUndefined()
      expect(await unreceivedCount(root)).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('syncVault', () => {
  it('팀이 올린 변경을 받아 온다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'mate.md'), '# 동료 문서\n')
      commit(mate, 'mate page')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = await syncVault(mine)
      expect(result).toEqual({
        ok: true,
        received: 1,
        conflicts: [],
        skipped: null,
        held: null,
        via: 'forward'
      })
      expect(existsSync(join(mine, 'wiki', 'mate.md'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('받을 것이 없으면 0건이다', async () => {
    const { root, mine } = await team()
    try {
      expect(await syncVault(mine)).toEqual({
        ok: true,
        received: 0,
        conflicts: [],
        skipped: null,
        held: null,
        via: null
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // CTO 가 squash 로 머지하면 같은 내용이 다른 커밋으로 들어온다 — 충돌로 올리면 안 된다
  it('내 작업이 squash 로 머지돼 돌아와도 충돌로 올리지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'mine.md'), '# 내 문서\n\n첫 줄\n')
      commit(mine, 'my page part 1')
      writeFileSync(join(mine, 'wiki', 'mine.md'), '# 내 문서\n\n첫 줄\n둘째 줄\n')
      commit(mine, 'my page part 2')

      // 팀 저장소에는 같은 내용이 커밋 하나로 들어간다(squash)
      writeFileSync(join(mate, 'wiki', 'mine.md'), '# 내 문서\n\n첫 줄\n둘째 줄\n')
      commit(mate, 'squashed: my page')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = await syncVault(mine)
      expect(result).toEqual({
        ok: true,
        received: 1,
        conflicts: [],
        skipped: null,
        held: null,
        via: 'rewind'
      })
      expect(readFileSync(join(mine, 'wiki', 'mine.md'), 'utf8')).toContain('둘째 줄')
      expect(git(mine, 'rev-parse', 'HEAD')).toBe(git(mine, 'rev-parse', 'origin/main'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('깨끗한 되감기 받기는 via rewind를 찍는다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'mine.md'), '# 내 문서\n')
      commit(mine, 'my page')
      writeFileSync(join(mate, 'wiki', 'mine.md'), '# 내 문서\n')
      commit(mate, 'squashed: my page')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = await syncVault(mine)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.via).toBe('rewind')
      expect(git(mine, 'rev-parse', 'HEAD')).toBe(git(mine, 'rev-parse', 'origin/main'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('저장으로 못 치우는 더러움은 합치기로 받고 via merge를 찍는다', async () => {
    const { root, mine, mate } = await team()
    try {
      // squash로 들어간 내 커밋 + 저장해도 안 치워지는 추적 중 더러움(심링크가 폴더로 풀린 자리)
      writeFileSync(join(mine, 'wiki', 'mine.md'), '# 내 문서\n')
      commit(mine, 'my page')
      mkdirSync(join(mine, 'target'))
      writeFileSync(join(mine, 'target', 's.md'), '# s\n')
      symlinkSync(join('target'), join(mine, 'link-skill'))
      commit(mine, 'seed link')
      writeFileSync(join(mate, 'wiki', 'mine.md'), '# 내 문서\n')
      commit(mate, 'squashed: my page')
      writeFileSync(join(mate, 'wiki', 'mate.md'), '# 동료 문서\n')
      commit(mate, 'mate page')
      git(mate, 'push', '-q', 'origin', 'main')
      rmSync(join(mine, 'link-skill'))
      mkdirSync(join(mine, 'link-skill'))
      writeFileSync(join(mine, 'link-skill', 's.md'), '# s 고침\n')

      const result = await syncVault(mine)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.via).toBe('merge')
        expect(result.conflicts).toEqual([])
      }
      // 되감지 않았다 — 합치기로 받았다
      expect(git(mine, 'rev-parse', 'HEAD')).not.toBe(git(mine, 'rev-parse', 'origin/main'))
      expect(readFileSync(join(mine, 'link-skill', 's.md'), 'utf8')).toBe('# s 고침\n')
      expect(existsSync(join(mine, 'wiki', 'mate.md'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('같은 파일을 둘이 고쳤으면 충돌 목록을 돌려준다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# 동료가 고친 INDEX\n')
      commit(mate, 'mate edits index')
      git(mate, 'push', '-q', 'origin', 'main')

      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 내가 고친 INDEX\n')
      commit(mine, 'i edit index')

      const result = await syncVault(mine)
      expect(result).toEqual({
        ok: true,
        received: 1,
        conflicts: ['wiki/INDEX.md'],
        skipped: null,
        held: null,
        via: 'merge'
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 이 앱은 넣어 둔 자료를 커밋하지 않는다 — 인박스에 파일 하나만 있어도 받기가 멈추면 안 된다
  it('넣어 둔 자료(커밋 전 파일)가 있어도 받아 온다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mine, 'Clippings', '오늘-받은-자료.md'), '# 자료\n')
      writeFileSync(join(mate, 'wiki', 'mate.md'), '# 동료 문서\n')
      commit(mate, 'mate page')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = await syncVault(mine)
      expect(result).toEqual({
        ok: true,
        received: 1,
        conflicts: [],
        skipped: null,
        held: null,
        via: 'forward'
      })
      expect(existsSync(join(mine, 'Clippings', '오늘-받은-자료.md'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 충돌은 메모리에만 있으면 앱을 다시 켤 때 사라진다 — 보관함 자체를 보고 다시 말한다
  it('고르기를 기다리는 충돌은 다시 물어도 그대로 나온다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# 동료가 고친 INDEX\n')
      commit(mate, 'mate edits index')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 내가 고친 INDEX\n')
      commit(mine, 'i edit index')
      expect((await syncVault(mine)).ok).toBe(true)

      expect(await syncVault(mine)).toEqual({
        ok: true,
        received: 0,
        conflicts: ['wiki/INDEX.md'],
        skipped: null,
        held: null,
        via: null
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // USB·압축으로 옮겨 온 보관함은 git 기록이 없다 — 받기가 던지면 레일이 받는 중에 멈춘다
  it('git 기록이 없는 보관함에서도 던지지 않는다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sync-no-git-'))
    try {
      const dir = join(root, 'vault')
      mkdirSync(dir)
      expect(createVault(dir).ok).toBe(true)
      rmSync(join(dir, '.git'), { recursive: true, force: true })
      expect(await syncVault(dir)).toEqual({
        ok: true,
        received: 0,
        conflicts: [],
        skipped: 'no-remote',
        held: null,
        via: null
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('연결이 없으면 조용히 0건 — 오류가 아니다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sync-local-'))
    try {
      const dir = join(root, 'vault')
      mkdirSync(dir)
      expect(createVault(dir).ok).toBe(true)
      expect(await syncVault(dir)).toEqual({
        ok: true,
        received: 0,
        conflicts: [],
        skipped: 'no-remote',
        held: null,
        via: null
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('연결이 없는데 어제 작업에 남아 있으면 그 사실을 함께 돌려준다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sync-local-held-'))
    try {
      const dir = join(root, 'vault')
      mkdirSync(dir)
      expect(createVault(dir).ok).toBe(true)
      git(dir, 'switch', '-q', '-c', 'docs/plan')
      expect(await syncVault(dir)).toEqual({
        ok: true,
        received: 0,
        conflicts: [],
        skipped: 'no-remote',
        held: 'docs/plan',
        via: null
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 예전 앱은 브라우저 로그인(GCM)으로 올렸다 — 업데이트 뒤 첫 실행에는 앱 로그인이 없다.
  // 받으러 나가 실패하는 대신 다시 연결하라고 말하고, 네트워크에는 나가지 않는다
  it('GitHub 저장소에 연결돼 있는데 로그인하지 않았으면 받지 않고 signed-out 으로 돌려준다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sync-signed-out-'))
    try {
      const dir = join(root, 'vault')
      mkdirSync(dir)
      expect(createVault(dir).ok).toBe(true)
      setRemote(dir, 'https://github.com/acme/team.git')
      expect(await syncVault(dir)).toEqual({
        ok: true,
        received: 0,
        conflicts: [],
        skipped: 'signed-out',
        held: null,
        via: null
      })
      await lookForTeamChanges(dir)
      expect(existsSync(join(dir, '.git', 'FETCH_HEAD'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 팀 저장소를 만들고 첫 올리기가 실패한 뒤 — 원격은 아직 비어 있다. 받을 것이 없는 것이지 실패가 아니다:
  // 실패로 읽으면 올리기 직전 받기가 막아 다시 올릴 길이 없다
  it('연결한 저장소가 아직 비어 있으면 받을 것이 없다고 돌려준다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sync-empty-remote-'))
    try {
      const dir = join(root, 'vault')
      const bare = join(root, 'team.git')
      mkdirSync(dir)
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
      expect(createVault(dir).ok).toBe(true)
      setRemote(dir, bare)
      expect(await syncVault(dir)).toEqual({
        ok: true,
        received: 0,
        conflicts: [],
        skipped: null,
        held: null,
        via: null
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 다른 줄기는 있는데 기본 줄기만 없다(GitHub 에서 이름을 바꿨거나 지웠다) — 받을 것이 없다고 하면 받기가
  // 조용히 멈추고 다음 올리기가 그 이름으로 새 줄기를 만들어 팀 기록이 갈라진다. 실패로 알린다
  it('원격에 다른 줄기만 있고 기본 줄기가 없으면 받지 못했다고 말한다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sync-renamed-remote-'))
    try {
      const dir = join(root, 'vault')
      const bare = join(root, 'team.git')
      mkdirSync(dir)
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
      expect(createVault(dir).ok).toBe(true)
      git(dir, 'push', '-q', bare, 'main:trunk')
      setRemote(dir, bare)
      expect((await syncVault(dir)).ok).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('저장소에 닿지 못하면 사유를 말하고 보관함은 그대로 둔다', async () => {
    const { root, mine } = await team()
    try {
      setRemote(mine, join(root, 'gone.git'))
      const head = git(mine, 'rev-parse', 'HEAD')
      const result = await syncVault(mine)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toContain('연결')
      expect(git(mine, 'rev-parse', 'HEAD')).toBe(head)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

/** 어제 하던 작업 브랜치 — 팀 관행: 작업마다 브랜치 → PR → 머지 */
const workOn = (dir: string, branch: string, file: string, text: string): void => {
  git(dir, 'switch', '-q', '-c', branch)
  writeFileSync(join(dir, file), text)
  commit(dir, `work on ${branch}`)
}

const ok = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  if (!result.ok) throw new Error(`실패: ${JSON.stringify(result)}`)
  return result as Extract<T, { ok: true }>
}

describe('syncVault — 어제 브랜치에 남은 보관함', () => {
  it('내용이 이미 팀에 들어갔으면 기본 브랜치로 옮겨 받고, 원래 브랜치는 남긴다', async () => {
    const { root, mine, mate } = await team()
    try {
      workOn(mine, 'docs/plan', 'outputs-plan.md', '# 계획\n')
      git(mine, 'push', '-q', 'origin', 'docs/plan')
      // 동료가 PR 을 그대로 머지했다
      git(mate, 'fetch', '-q', 'origin')
      git(mate, 'merge', '-q', '--no-ff', '-m', 'merge pr', 'origin/docs/plan')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = ok(await syncVault(mine))
      expect(result.held).toBeNull()
      expect(result.conflicts).toEqual([])
      expect(git(mine, 'branch', '--show-current')).toBe('main')
      expect(git(mine, 'rev-parse', 'HEAD')).toBe(git(mine, 'rev-parse', 'origin/main'))
      expect(git(mine, 'branch', '--list', 'docs/plan')).toContain('docs/plan')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('squash 로 들어간 작업도 들어간 것으로 본다', async () => {
    const { root, mine, mate } = await team()
    try {
      workOn(mine, 'docs/plan', 'wiki/plan.md', '# 계획\n\n첫 줄\n')
      writeFileSync(join(mine, 'wiki', 'plan.md'), '# 계획\n\n첫 줄\n둘째 줄\n')
      commit(mine, 'more plan')
      writeFileSync(join(mate, 'wiki', 'plan.md'), '# 계획\n\n첫 줄\n둘째 줄\n')
      commit(mate, 'squash: plan (#3)')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = ok(await syncVault(mine))
      expect(result.held).toBeNull()
      expect(git(mine, 'branch', '--show-current')).toBe('main')
      expect(readFileSync(join(mine, 'wiki', 'plan.md'), 'utf8')).toContain('둘째 줄')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('아직 안 들어간 작업은 그 자리에 두고 팀 최신만 합친다 — 커밋이 사라지지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      workOn(mine, 'docs/plan', 'wiki/plan.md', '# 아직 검토 중\n')
      const mineHead = git(mine, 'rev-parse', 'HEAD')
      writeFileSync(join(mate, 'wiki', 'mate.md'), '# 동료 문서\n')
      commit(mate, 'mate page')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = ok(await syncVault(mine))
      expect(result).toMatchObject({ received: 1, conflicts: [], skipped: null, held: 'docs/plan' })
      expect(git(mine, 'branch', '--show-current')).toBe('docs/plan')
      expect(existsSync(join(mine, 'wiki', 'mate.md'))).toBe(true)
      expect(readFileSync(join(mine, 'wiki', 'plan.md'), 'utf8')).toBe('# 아직 검토 중\n')
      expect(git(mine, 'merge-base', '--is-ancestor', mineHead, 'HEAD')).toBe('')
      expect(git(mine, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD')).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('남은 작업에 팀 최신을 합치다 부딪히면 충돌 목록을 돌려준다', async () => {
    const { root, mine, mate } = await team()
    try {
      workOn(mine, 'docs/index', 'wiki/INDEX.md', '# 내가 고친 INDEX\n')
      writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# 동료가 고친 INDEX\n')
      commit(mate, 'mate edits index')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = ok(await syncVault(mine))
      expect(result).toMatchObject({ conflicts: ['wiki/INDEX.md'], held: 'docs/index' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('동료가 같은 작업 브랜치에 올린 것도 받는다', async () => {
    const { root, mine, mate } = await team()
    try {
      workOn(mine, 'docs/plan', 'wiki/plan.md', '# 계획\n')
      git(mine, 'push', '-q', '-u', 'origin', 'docs/plan')
      git(mate, 'fetch', '-q', 'origin')
      git(mate, 'switch', '-q', 'docs/plan')
      writeFileSync(join(mate, 'wiki', 'review-note.md'), '# 검토 메모\n')
      commit(mate, 'review note')
      git(mate, 'push', '-q', 'origin', 'docs/plan')

      const result = ok(await syncVault(mine))
      expect(result.held).toBe('docs/plan')
      expect(existsSync(join(mine, 'wiki', 'review-note.md'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // squash 뒤 팀이 같은 파일을 더 고치면 내용 비교가 "안 들어감" 으로 본다 — 합친 결과가 팀과 같아져 다음 받기에 풀린다
  it('squash 뒤 팀이 더 고친 경우 두 번의 받기 안에 기본 브랜치로 돌아간다', async () => {
    const { root, mine, mate } = await team()
    try {
      const base = '# 계획\n\n첫 줄\n\n가운데\n\n끝\n'
      writeFileSync(join(mine, 'wiki', 'plan.md'), base)
      commit(mine, 'plan base')
      git(mine, 'push', '-q', 'origin', 'main')
      git(mate, 'pull', '-q', 'origin', 'main')

      workOn(mine, 'docs/plan', 'wiki/plan.md', base.replace('첫 줄', '첫 줄 고침'))
      writeFileSync(join(mate, 'wiki', 'plan.md'), base.replace('첫 줄', '첫 줄 고침'))
      commit(mate, 'squash: plan (#3)')
      writeFileSync(
        join(mate, 'wiki', 'plan.md'),
        base.replace('첫 줄', '첫 줄 고침').replace('끝', '끝 — 팀이 덧붙임')
      )
      commit(mate, 'team follow-up')
      git(mate, 'push', '-q', 'origin', 'main')

      const first = ok(await syncVault(mine))
      const second = first.held === null ? first : ok(await syncVault(mine))
      expect(second.held).toBeNull()
      expect(git(mine, 'branch', '--show-current')).toBe('main')
      expect(readFileSync(join(mine, 'wiki', 'plan.md'), 'utf8')).toContain('팀이 덧붙임')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('승인 대기 중인 위키화 브랜치는 손대지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      workOn(mine, 'app/ingest-2026-09-16', 'wiki/new.md', '# 위키화 결과\n')
      const head = git(mine, 'rev-parse', 'HEAD')
      writeFileSync(join(mate, 'wiki', 'mate.md'), '# 동료 문서\n')
      commit(mate, 'mate page')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = ok(await syncVault(mine))
      expect(result).toMatchObject({ received: 0, skipped: 'review-pending' })
      expect(git(mine, 'rev-parse', 'HEAD')).toBe(head)
      expect(git(mine, 'branch', '--show-current')).toBe('app/ingest-2026-09-16')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('옮기려는데 새 파일이 팀 문서와 이름이 겹치면 그 자리에 남고 이유를 말한다', async () => {
    const { root, mine, mate } = await team()
    try {
      // 작업 브랜치에서 문서를 지웠고, 팀도 같은 삭제를 머지했다
      git(mine, 'switch', '-q', '-c', 'docs/cleanup')
      git(mine, 'rm', '-q', 'wiki/INDEX.md')
      commit(mine, 'drop index')
      git(mate, 'rm', '-q', 'wiki/INDEX.md')
      commit(mate, 'squash: drop index')
      git(mate, 'push', '-q', 'origin', 'main')
      // 로컬 main 은 아직 INDEX.md 를 갖고 있다 — 같은 이름의 새 파일이 옮기기를 막는다
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 새로 쓴 INDEX\n')

      const result = ok(await syncVault(mine))
      expect(result).toMatchObject({ skipped: 'switch-blocked', held: 'docs/cleanup' })
      expect(git(mine, 'branch', '--show-current')).toBe('docs/cleanup')
      expect(readFileSync(join(mine, 'wiki', 'INDEX.md'), 'utf8')).toBe('# 새로 쓴 INDEX\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 이름 겹침이 아닌 이유로 옮기지 못하면 "새 파일" 탓으로 돌리지 않는다
  it('옮기기가 다른 이유로 실패하면 그 이유를 말하고 그 자리에 남는다', async () => {
    const { root, mine, mate } = await team()
    try {
      workOn(mine, 'docs/plan', 'wiki/plan.md', '# 계획\n')
      writeFileSync(join(mate, 'wiki', 'plan.md'), '# 계획\n')
      commit(mate, 'squash: plan')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, '.git', 'index.lock'), '')

      const result = await syncVault(mine)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('팀 최신으로 옮기지 못했어요. 잠시 뒤 다시 받아 주세요')
      expect(git(mine, 'branch', '--show-current')).toBe('docs/plan')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('브랜치 밖(분리된 상태)이면 건너뛰고 평소 상태가 아니라고 말한다', async () => {
    const { root, mine } = await team()
    try {
      git(mine, 'switch', '-q', '--detach', 'HEAD')
      const result = ok(await syncVault(mine))
      expect(result.skipped).toBe('stuck')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('syncVault — 받기 전 자동 저장', () => {
  it('저장 안 한 편집을 경로 지정 커밋으로 저장한 뒤 받는다 — 커밋 전 파일은 건드리지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'mate.md'), '# 동료 문서\n')
      commit(mate, 'mate page')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 고치는 중\n')
      writeFileSync(join(mine, 'scratch.png'), 'not a doc')

      const result = ok(await syncVault(mine))
      expect(result).toMatchObject({ received: 1, conflicts: [], skipped: null })
      expect(existsSync(join(mine, 'wiki', 'mate.md'))).toBe(true)
      expect(readFileSync(join(mine, 'wiki', 'INDEX.md'), 'utf8')).toBe('# 고치는 중\n')
      const saved = git(mine, 'log', '--format=%s', '--grep=^save: ')
      expect(saved).toMatch(/^save: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
      expect(git(mine, 'show', '--name-only', '--format=', ':/^save: ')).toBe('wiki/INDEX.md')
      expect(git(mine, 'status', '--porcelain')).toBe('?? scratch.png')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 파일명의 `[1]` 을 패턴으로 읽으면 `plan1.md` 같은 커밋 전 파일까지 딸려 온다
  it('자동 저장은 파일명의 괄호를 패턴으로 읽지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'plan[1].md'), '# 계획\n')
      commit(mine, 'plan')
      writeFileSync(join(mine, 'wiki', 'plan[1].md'), '# 계획 고침\n')
      writeFileSync(join(mine, 'wiki', 'plan1.md'), '# 커밋 전\n')
      // 자동 저장은 받을 팀 변경이 있을 때만 돈다
      writeFileSync(join(mate, 'wiki', 'from-mate.md'), '# 동료\n')
      commit(mate, 'mate page')
      git(mate, 'push', '-q', 'origin', 'main')
      ok(await syncVault(mine))
      expect(git(mine, 'status', '--porcelain')).toBe('?? wiki/plan1.md')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('자동 저장한 내용은 squash 지름길에 지워지지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      // 내 커밋은 squash 로 들어갔고, 저장 안 한 편집이 따로 있다
      writeFileSync(join(mine, 'wiki', 'mine.md'), '# 내 문서\n')
      commit(mine, 'my page')
      writeFileSync(join(mate, 'wiki', 'mine.md'), '# 내 문서\n')
      commit(mate, 'squashed: my page')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 아직 저장 안 한 편집\n')

      ok(await syncVault(mine))
      expect(readFileSync(join(mine, 'wiki', 'INDEX.md'), 'utf8')).toBe('# 아직 저장 안 한 편집\n')
      expect(git(mine, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD')).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('자동 저장은 git 이 커밋 못 하는 자리(심링크가 폴더로 풀린 곳)를 건너뛴다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'save-edits-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
      mkdirSync(join(dir, 'wiki'), { recursive: true })
      mkdirSync(join(dir, 'target'), { recursive: true })
      writeFileSync(join(dir, 'wiki', 'a.md'), '# 가\n')
      writeFileSync(join(dir, 'target', 'SKILL.md'), '# 스킬\n')
      symlinkSync(join('target'), join(dir, 'link-skill'))
      commit(dir, 'seed')
      // 심링크를 실제 폴더로 바꾼다 — cp -r 로 복사한 볼트에서 생기는 모양
      rmSync(join(dir, 'link-skill'))
      mkdirSync(join(dir, 'link-skill'), { recursive: true })
      writeFileSync(join(dir, 'link-skill', 'SKILL.md'), '# 풀린 스킬\n')
      writeFileSync(join(dir, 'wiki', 'a.md'), '# 가 고침\n')

      expect(() => saveEdits(dir)).not.toThrow()
      expect(git(dir, 'show', '--name-only', '--format=', ':/^save: ')).toBe('wiki/a.md')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('가져오기가 상한을 넘기면 실패로 끝낸다 — 10분을 기다리지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sync-timeout-'))
    try {
      expect(createVault(dir).ok).toBe(true)
      // 닿지 않는 주소 — 연결이 매달리면 상한이 잘라야 한다
      setRemote(dir, 'https://10.255.255.1/team.git')
      const started = Date.now()
      const result = await syncVault(dir, { fetchTimeoutMs: 1500 })
      expect(Date.now() - started).toBeLessThan(30_000)
      expect(result.ok).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('남아 있는 작업 브랜치에서는 되감기(reset)를 하지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      workOn(mine, 'docs/plan', 'wiki/plan.md', '# 계획\n')
      git(mine, 'push', '-q', 'origin', 'docs/plan')
      // 원격 작업 브랜치에는 이미 같은 내용 — 기본 브랜치 지름길 판정이면 reset 으로 간다
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 저장 안 한 편집\n')
      writeFileSync(join(mate, 'wiki', 'mate.md'), '# 동료 문서\n')
      commit(mate, 'mate page')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = ok(await syncVault(mine))
      expect(result.held).toBe('docs/plan')
      expect(readFileSync(join(mine, 'wiki', 'INDEX.md'), 'utf8')).toBe('# 저장 안 한 편집\n')
      expect(git(mine, 'status', '--porcelain', '--untracked-files=no')).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('위키화·확정이 보관함을 잡고 있으면 저장도 받기도 미룬다', async () => {
    const { root, mine } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 고치는 중\n')
      const head = git(mine, 'rev-parse', 'HEAD')
      const end = vaultActivity.begin('ingest', mine)
      if (typeof end !== 'function') throw new Error('begin 실패')
      try {
        expect(ok(await syncVault(mine)).skipped).toBe('busy')
      } finally {
        end()
      }
      mkdirSync(join(mine, '.locks'), { recursive: true })
      writeFileSync(join(mine, INGEST_LOCK), '')
      expect(ok(await syncVault(mine)).skipped).toBe('busy')
      expect(git(mine, 'rev-parse', 'HEAD')).toBe(head)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 되감기는 커밋 전 파일을 말없이 덮는다 — 내 커밋이 없을 때는 병합만 한다
  it('내 커밋이 없으면 되감지 않는다 — 이름이 겹치는 커밋 전 파일을 덮지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'draft.md'), '# 동료 문서\n')
      commit(mate, 'mate draft')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, 'wiki', 'draft.md'), '# 내 초안\n')

      expect((await syncVault(mine)).ok).toBe(false)
      expect(readFileSync(join(mine, 'wiki', 'draft.md'), 'utf8')).toBe('# 내 초안\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('고르기를 기다리는 충돌이 있으면 자동 저장하지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# 동료가 고친 INDEX\n')
      commit(mate, 'mate edits index')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 내가 고친 INDEX\n')
      commit(mine, 'i edit index')
      ok(await syncVault(mine))
      const head = git(mine, 'rev-parse', 'HEAD')

      expect(ok(await syncVault(mine)).conflicts).toEqual(['wiki/INDEX.md'])
      expect(git(mine, 'rev-parse', 'HEAD')).toBe(head)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('unpushedCount', () => {
  it('아직 올리지 않은 내 작업 수를 센다', async () => {
    const { root, mine } = await team()
    try {
      expect(await unpushedCount(mine)).toBe(0)
      writeFileSync(join(mine, 'wiki', 'note.md'), '# 메모\n')
      commit(mine, 'my note')
      expect(await unpushedCount(mine)).toBe(1)
      writeFileSync(join(mine, 'wiki', 'note2.md'), '# 메모 둘\n')
      commit(mine, 'my second note')
      expect(await unpushedCount(mine)).toBe(2)

      git(mine, 'push', '-q', 'origin', 'main')
      expect(await unpushedCount(mine)).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('팀 저장소에 연결돼 있지 않으면 셀 것이 없다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ahead-local-'))
    try {
      const dir = join(root, 'vault')
      mkdirSync(dir)
      expect(createVault(dir).ok).toBe(true)
      expect(await unpushedCount(dir)).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('unpushedFiles', () => {
  it('자동 저장한 편집을 포함해 아직 올리지 않은 파일 이름을 돌려준다', async () => {
    const { root, mine } = await team()
    try {
      expect(await unpushedFiles(mine)).toEqual([])
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 고치는 중\n')
      await syncVault(mine) // 받기 전 자동 저장
      writeFileSync(join(mine, 'wiki', '한글 메모.md'), '# 메모\n')
      commit(mine, 'memo')
      expect((await unpushedFiles(mine)).sort()).toEqual(['wiki/INDEX.md', 'wiki/한글 메모.md'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('resolveConflict', () => {
  /** 같은 파일을 둘이 고쳐 고르기를 기다리는 상태를 만든다 */
  const conflicted = async (): Promise<{ root: string; mine: string }> => {
    const { root, mine, mate } = await team()
    writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# 팀이 고친 INDEX\n')
    commit(mate, 'mate edits index')
    git(mate, 'push', '-q', 'origin', 'main')
    writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 내가 고친 INDEX\n')
    commit(mine, 'i edit index')
    const result = await syncVault(mine)
    expect(result.ok && result.conflicts).toEqual(['wiki/INDEX.md'])
    return { root, mine }
  }

  it('팀 것을 고르면 팀 내용이 남고 내 것은 옆에 남겨 둔다', async () => {
    const { root, mine } = await conflicted()
    try {
      const result = resolveConflict(mine, 'wiki/INDEX.md', 'team')
      expect(result).toEqual({ ok: true, remaining: [] })
      expect(readFileSync(join(mine, 'wiki', 'INDEX.md'), 'utf8')).toContain('팀이 고친')
      const kept = join(
        mine,
        'wiki',
        `INDEX-충돌-내것-${new Date().toLocaleDateString('sv-SE')}.md`
      )
      expect(readFileSync(kept, 'utf8')).toContain('내가 고친')
      // 고르기가 끝나면 보관함은 평소 상태로 돌아온다
      expect(git(mine, 'status', '--porcelain', '--untracked-files=no')).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('내 것을 고르면 내 내용이 남고 팀 것은 옆에 남겨 둔다', async () => {
    const { root, mine } = await conflicted()
    try {
      expect(resolveConflict(mine, 'wiki/INDEX.md', 'mine')).toEqual({ ok: true, remaining: [] })
      expect(readFileSync(join(mine, 'wiki', 'INDEX.md'), 'utf8')).toContain('내가 고친')
      const kept = join(
        mine,
        'wiki',
        `INDEX-충돌-팀것-${new Date().toLocaleDateString('sv-SE')}.md`
      )
      expect(readFileSync(kept, 'utf8')).toContain('팀이 고친')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 팀이 문서를 지우고 나는 고쳤다 — 한쪽에 내용이 없어도 고를 수 있어야 한다
  it('한쪽이 지운 문서도 고를 수 있다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'topic.md'), '# 주제\n\n첫 내용\n')
      commit(mate, 'add topic')
      git(mate, 'push', '-q', 'origin', 'main')
      expect((await syncVault(mine)).ok).toBe(true)

      git(mate, 'rm', '-q', 'wiki/topic.md')
      commit(mate, 'mate removes topic')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, 'wiki', 'topic.md'), '# 주제\n\n내가 고친 내용\n')
      commit(mine, 'i edit topic')

      const synced = await syncVault(mine)
      expect(synced.ok && synced.conflicts).toEqual(['wiki/topic.md'])
      const sides = conflictSides(mine, 'wiki/topic.md')
      expect('error' in sides).toBe(false)
      if ('error' in sides) return
      expect(sides.team).toBeNull()
      expect(sides.mine).toContain('내가 고친 내용')

      expect(resolveConflict(mine, 'wiki/topic.md', 'team')).toEqual({ ok: true, remaining: [] })
      expect(existsSync(join(mine, 'wiki', 'topic.md'))).toBe(false)
      // 팀이 지운 쪽을 골라도 내가 쓴 것은 옆에 남는다
      const kept = join(
        mine,
        'wiki',
        `topic-충돌-내것-${new Date().toLocaleDateString('sv-SE')}.md`
      )
      expect(readFileSync(kept, 'utf8')).toContain('내가 고친 내용')
      expect(git(mine, 'status', '--porcelain', '--untracked-files=no')).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('같은 날 두 번 고르면 먼저 남긴 것을 덮지 않는다', async () => {
    const { root, mine } = await conflicted()
    try {
      const date = new Date().toLocaleDateString('sv-SE')
      expect(resolveConflict(mine, 'wiki/INDEX.md', 'team')).toEqual({ ok: true, remaining: [] })
      const first = join(mine, 'wiki', `INDEX-충돌-내것-${date}.md`)
      expect(readFileSync(first, 'utf8')).toContain('내가 고친 INDEX')

      // 같은 이름이 이미 있으면 뒤엣것은 비켜 간다 — 앞서 남긴 것을 덮지 않는다
      expect(keptAsideName('wiki/INDEX.md', 'team', (name) => existsSync(join(mine, name)))).toBe(
        `wiki/INDEX-충돌-내것-${date}-2.md`
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('고르기를 기다리지 않는 파일은 거절한다', async () => {
    const { root, mine } = await conflicted()
    try {
      const result = resolveConflict(mine, 'wiki/other.md', 'team')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toContain('고를')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('고를 것이 여럿이면 남은 목록을 돌려준다', async () => {
    const { root, mine, mate } = await team()
    try {
      for (const [file, text] of [
        ['INDEX.md', '팀 INDEX'],
        ['VAULT_MEMORY.md', '팀 메모리']
      ]) {
        writeFileSync(join(mate, 'wiki', file!), `# ${text}\n`)
      }
      commit(mate, 'mate edits two')
      git(mate, 'push', '-q', 'origin', 'main')
      for (const [file, text] of [
        ['INDEX.md', '내 INDEX'],
        ['VAULT_MEMORY.md', '내 메모리']
      ]) {
        writeFileSync(join(mine, 'wiki', file!), `# ${text}\n`)
      }
      commit(mine, 'i edit two')
      const synced = await syncVault(mine)
      expect(synced.ok && synced.conflicts.length).toBe(2)

      const first = resolveConflict(mine, 'wiki/INDEX.md', 'team')
      expect(first).toEqual({ ok: true, remaining: ['wiki/VAULT_MEMORY.md'] })
      expect(resolveConflict(mine, 'wiki/VAULT_MEMORY.md', 'mine')).toEqual({
        ok: true,
        remaining: []
      })
      expect(git(mine, 'status', '--porcelain', '--untracked-files=no')).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // 파일명에 glob 문자([ ])가 있어도 고르기는 그 파일만 건드린다 — 패턴으로 풀리면 형제가 딸려 온다
  it('glob 문자가 든 파일명을 패턴으로 풀지 않고 글자로 더한다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'note [d].md'), '# 팀 메모\n')
      writeFileSync(join(mate, 'wiki', 'note d.md'), '# 형제\n')
      commit(mate, 'mate adds bracket file and sibling')
      git(mate, 'push', '-q', 'origin', 'main')
      expect((await syncVault(mine)).ok).toBe(true)

      writeFileSync(join(mine, 'wiki', 'note [d].md'), '# 내 메모\n')
      commit(mine, 'i edit bracket file')
      writeFileSync(join(mate, 'wiki', 'note [d].md'), '# 팀이 다시 고친 메모\n')
      commit(mate, 'mate edits bracket file')
      git(mate, 'push', '-q', 'origin', 'main')

      const synced = await syncVault(mine)
      expect(synced.ok && synced.conflicts).toEqual(['wiki/note [d].md'])

      // 고르기를 앞둔 사이 앱 밖에서 형제를 고쳤다 — 아직 커밋 전이다
      writeFileSync(join(mine, 'wiki', 'note d.md'), '# 형제\n\n밖에서 덧붙임\n')
      expect(resolveConflict(mine, 'wiki/note [d].md', 'team')).toEqual({
        ok: true,
        remaining: []
      })
      // 형제 변경은 머지 커밋에 타지 않고 작업대에 남는다
      expect(git(mine, 'status', '--porcelain', 'wiki/note d.md')).toContain('M')
      expect(readFileSync(join(mine, 'wiki/note d.md'), 'utf8')).toContain('밖에서 덧붙임')
      const committed = git(mine, 'diff', '--name-only', 'HEAD~1', 'HEAD').split('\n')
      expect(committed).not.toContain('wiki/note d.md')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

/** 다른 도구(CLI promote)가 만든 브랜치를 올려 PR 로 둔다 — 그 위에 앱이 편집을 자동 저장했다 */
const promoteWithAppEdit = (mine: string): void => {
  workOn(mine, 'ingest/promote', 'wiki/promoted.md', '# 올린 문서\n')
  git(mine, 'push', '-q', '-u', 'origin', 'ingest/promote')
  writeFileSync(join(mine, 'Clippings', 'draft.md'), '# 앱에서 쓴 글\n')
  commit(mine, 'edit: draft')
}

const mergePr = (mate: string, branch: string): void => {
  git(mate, 'fetch', '-q', 'origin')
  git(mate, 'merge', '-q', '--no-ff', '-m', 'merge pr', `origin/${branch}`)
  git(mate, 'push', '-q', 'origin', 'main')
}

describe('syncVault — 앱이 남의 브랜치에 남긴 편집', () => {
  it('PR 이 머지되면 기본 줄기로 돌아가며 앱 편집을 챙겨 온다', async () => {
    const { root, mine, mate } = await team()
    try {
      promoteWithAppEdit(mine)
      mergePr(mate, 'ingest/promote')

      const result = ok(await syncVault(mine))
      expect(result.held).toBeNull()
      expect(git(mine, 'branch', '--show-current')).toBe('main')
      expect(existsSync(join(mine, 'wiki', 'promoted.md'))).toBe(true)
      expect(readFileSync(join(mine, 'Clippings', 'draft.md'), 'utf8')).toBe('# 앱에서 쓴 글\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('팀이 앱 편집까지 squash 로 머지했으면 빈 커밋은 버리고 기본 줄기로 돌아간다', async () => {
    const { root, mine, mate } = await team()
    try {
      promoteWithAppEdit(mine)
      git(mate, 'pull', '-q', 'origin', 'main')
      writeFileSync(join(mate, 'wiki', 'promoted.md'), '# 올린 문서\n')
      writeFileSync(join(mate, 'Clippings', 'draft.md'), '# 앱에서 쓴 글\n')
      commit(mate, 'squash: promote (#7)')
      git(mate, 'push', '-q', 'origin', 'main')

      const result = ok(await syncVault(mine))
      expect(result.held).toBeNull()
      // 돌아가며 당겨 온 팀 커밋이 받은 수다
      expect(result.received).toBeGreaterThan(0)
      expect(git(mine, 'branch', '--show-current')).toBe('main')
      expect(git(mine, 'status', '--porcelain')).toBe('')
      expect(readFileSync(join(mine, 'Clippings', 'draft.md'), 'utf8')).toBe('# 앱에서 쓴 글\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('PR 이 아직이면 그 자리에 남는다', async () => {
    const { root, mine } = await team()
    try {
      promoteWithAppEdit(mine)
      expect(ok(await syncVault(mine)).held).toBe('ingest/promote')
      expect(git(mine, 'branch', '--show-current')).toBe('ingest/promote')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('restoreVault', () => {
  it('팀이 확인 중인 작업이 있으면 먼저 무엇이 안 보이게 되는지 돌려주고 떠나지 않는다', async () => {
    const { root, mine } = await team()
    try {
      promoteWithAppEdit(mine)
      expect(await restoreVault(mine, false)).toEqual({
        status: 'confirm',
        carried: ['Clippings/draft.md'],
        awaiting: ['wiki/promoted.md']
      })
      expect(git(mine, 'branch', '--show-current')).toBe('ingest/promote')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('확인하면 기본 줄기로 가며 앱 편집을 챙기고, 원래 브랜치는 남긴다', async () => {
    const { root, mine } = await team()
    try {
      promoteWithAppEdit(mine)
      expect((await restoreVault(mine, true)).status).toBe('done')
      expect(git(mine, 'branch', '--show-current')).toBe('main')
      expect(existsSync(join(mine, 'Clippings', 'draft.md'))).toBe(true)
      expect(existsSync(join(mine, 'wiki', 'promoted.md'))).toBe(false)
      expect(git(mine, 'branch', '--list', 'ingest/promote')).toContain('ingest/promote')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('저장 안 한 편집도 저장해 챙겨 온다', async () => {
    const { root, mine } = await team()
    try {
      promoteWithAppEdit(mine)
      writeFileSync(join(mine, 'Clippings', 'draft.md'), '# 고쳐 쓴 글\n')
      expect((await restoreVault(mine, true)).status).toBe('done')
      expect(readFileSync(join(mine, 'Clippings', 'draft.md'), 'utf8')).toBe('# 고쳐 쓴 글\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('팀에 이미 들어간 작업이면 묻지 않고 되돌린다', async () => {
    const { root, mine, mate } = await team()
    try {
      promoteWithAppEdit(mine)
      mergePr(mate, 'ingest/promote')
      expect(await restoreVault(mine, false)).toEqual({
        status: 'done',
        carried: ['Clippings/draft.md'],
        awaiting: []
      })
      expect(existsSync(join(mine, 'wiki', 'promoted.md'))).toBe(true)
      expect(existsSync(join(mine, 'Clippings', 'draft.md'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('이 컴퓨터에만 있는 남의 작업이 있으면 되돌리지 않는다', async () => {
    const { root, mine } = await team()
    try {
      workOn(mine, 'docs/local', 'wiki/local.md', '# 안 올린 문서\n')
      const result = await restoreVault(mine, true)
      expect(result.status).toBe('refused')
      expect(result.status === 'refused' && result.reason).toContain('wiki/local.md')
      expect(git(mine, 'branch', '--show-current')).toBe('docs/local')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('챙길 편집이 확인 중인 문서를 고친 것이면 떠나지 않는다', async () => {
    const { root, mine } = await team()
    try {
      workOn(mine, 'ingest/promote', 'wiki/promoted.md', '# 올린 문서\n')
      git(mine, 'push', '-q', '-u', 'origin', 'ingest/promote')
      writeFileSync(join(mine, 'wiki', 'promoted.md'), '# 올린 문서\n\n고친 줄\n')
      commit(mine, 'edit: promoted')
      const head = git(mine, 'rev-parse', 'HEAD')

      expect((await restoreVault(mine, true)).status).toBe('refused')
      expect(git(mine, 'branch', '--show-current')).toBe('ingest/promote')
      expect(git(mine, 'rev-parse', 'HEAD')).toBe(head)
      expect(git(mine, 'status', '--porcelain')).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('syncVault — 앱이 올린 요청을 팀이 squash 로 머지한 뒤', () => {
  /** 내 커밋을 `app/edits-…` 로 올리고 팀이 그것을 squash 로 머지한다 — 앱의 확인 요청과 같은 길 */
  const squashRequest = (mine: string, mate: string, branch: string): void => {
    git(mine, 'push', '-q', 'origin', `main:${branch}`)
    git(mate, 'fetch', '-q', 'origin')
    git(mate, 'merge', '-q', '--squash', `origin/${branch}`)
    commit(mate, `squash ${branch}`)
    git(mate, 'push', '-q', 'origin', 'main')
  }

  it('요청 뒤에 더 고친 문서가 내 변경끼리 충돌하지 않고 팀 최신 위에 남는다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 목차\n\n첫 수정\n')
      commit(mine, 'edit: INDEX')
      squashRequest(mine, mate, 'app/edits-2026-09-30-1000')
      // 요청을 보낸 뒤 같은 문서를 더 고쳤다 — 팀이 머지하기 전이다
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 목차\n\n첫 수정\n둘째 수정\n')
      commit(mine, 'edit: INDEX')

      const result = await syncVault(mine)
      expect(result).toMatchObject({ ok: true, conflicts: [] })
      expect(readFileSync(join(mine, 'wiki', 'INDEX.md'), 'utf8')).toBe(
        '# 목차\n\n첫 수정\n둘째 수정\n'
      )
      // 팀 최신 위에 둘째 수정 하나만 남는다 — 안 올린 작업 수가 이미 들어간 것을 세지 않는다
      expect(git(mine, 'rev-list', '--count', 'origin/main..main')).toBe('1')
      expect(await unpushedCount(mine)).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('요청 뒤 사람이 고른 병합이 있으면 다시 얹지 않고 평소처럼 합친다 — 고른 결과를 버리지 않는다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'a.md'), '# a\n')
      commit(mine, 'edit: a')
      git(mine, 'push', '-q', 'origin', 'main:app/edits-2026-09-30-1000')
      // 요청 뒤 동료와 같은 문서를 고쳐 충돌 → 내 것을 골랐다
      writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# 팀\n')
      commit(mate, 'mate index')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 나\n')
      commit(mine, 'edit: INDEX')
      const first = await syncVault(mine)
      expect(first).toMatchObject({ ok: true, conflicts: ['wiki/INDEX.md'] })
      expect(resolveConflict(mine, 'wiki/INDEX.md', 'mine').ok).toBe(true)
      // 이제 팀이 첫 요청을 squash 로 머지한다
      git(mate, 'fetch', '-q', 'origin')
      git(mate, 'merge', '-q', '--squash', 'origin/app/edits-2026-09-30-1000')
      commit(mate, 'squash a')
      git(mate, 'push', '-q', 'origin', 'main')

      expect(await syncVault(mine)).toMatchObject({ ok: true, conflicts: [] })
      expect(readFileSync(join(mine, 'wiki', 'INDEX.md'), 'utf8')).toBe('# 나\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('들어간 요청 뒤에 아직 팀 확인 중인 요청이 있으면 다시 얹지 않는다 — 그 요청을 기본 줄기가 계속 품는다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'a.md'), '# a\n')
      commit(mine, 'edit: a')
      git(mine, 'push', '-q', 'origin', 'main:app/edits-2026-09-30-1000')
      // 그 뒤 위키화를 승인해 팀 확인 요청으로 올려 두었다
      writeFileSync(join(mine, 'wiki', 'w.md'), '# w\n')
      commit(mine, 'ingest: w')
      git(mine, 'push', '-q', 'origin', 'main:app/ingest-2026-09-30')
      // 팀은 첫 요청만 squash 로 머지했다
      git(mate, 'fetch', '-q', 'origin')
      git(mate, 'merge', '-q', '--squash', 'origin/app/edits-2026-09-30-1000')
      commit(mate, 'squash a')
      git(mate, 'push', '-q', 'origin', 'main')

      expect(await syncVault(mine)).toMatchObject({ ok: true, conflicts: [] })
      expect(git(mine, 'merge-base', '--is-ancestor', 'origin/app/ingest-2026-09-30', 'main')).toBe(
        ''
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('받을 팀 변경이 없으면 앱 밖에서 고친 문서를 커밋하지 않는다', async () => {
    const { root, mine } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 밖에서 고치는 중\n')
      const head = git(mine, 'rev-parse', 'HEAD')
      expect(await syncVault(mine)).toMatchObject({ ok: true, received: 0 })
      expect(git(mine, 'rev-parse', 'HEAD')).toBe(head)
      expect(git(mine, 'status', '--porcelain')).toBe('M wiki/INDEX.md')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('앱 밖에서 새로 만든 문서', () => {
  it('git 이 모르는 보관함 문서만 센다 — 무시 목록·숨김 폴더·문서가 아닌 것은 뺀다', async () => {
    const { root, mine } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'new-note.md'), '# 새 노트\n')
      mkdirSync(join(mine, 'outputs', 'weekly'), { recursive: true })
      writeFileSync(join(mine, 'outputs', 'weekly', 'w.md'), '# 주간\n')
      mkdirSync(join(mine, '.claude'), { recursive: true })
      writeFileSync(join(mine, '.claude', 'x.md'), '# 숨김\n')
      writeFileSync(join(mine, 'wiki', 'image.png'), 'png')
      writeFileSync(join(mine, 'wiki', 'secret.md'), '# 비밀\n')
      writeFileSync(
        join(mine, '.gitignore'),
        `${readFileSync(join(mine, '.gitignore'), 'utf8')}\nwiki/secret.md\n`
      )
      expect(await newDocs(mine)).toEqual(['outputs/weekly/w.md', 'wiki/new-note.md'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('미추적 이름이 200KB를 넘으면 짤림으로 보고 빈 목록 — 경계 안은 정상 목록', async () => {
    const { root, mine } = await team()
    try {
      // 190자 이름 × 1200개 ≈ 230KB > cap 200_000 (실측). 짧은 이름이면 같은 경로로 목록이 나온다
      const long = (i: number): string => `wiki/long-${String(i).padStart(180, '0')}.md`
      for (let i = 0; i < 1200; i += 1) writeFileSync(join(mine, long(i)), '# 긴 이름\n')
      expect(await newDocs(mine)).toEqual([])
      for (let i = 0; i < 1200; i += 1) rmSync(join(mine, long(i)))
      writeFileSync(join(mine, 'wiki', 'short.md'), '# 짧은 이름\n')
      expect(await newDocs(mine)).toEqual(['wiki/short.md'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('고른 것만 앱 커밋으로 저장한다 — 목록에 없는 경로는 버린다', async () => {
    const { root, mine } = await team()
    try {
      writeFileSync(join(mine, 'wiki', 'a.md'), '# a\n')
      writeFileSync(join(mine, 'wiki', 'b.md'), '# b\n')
      expect(await commitNewDocs(mine, ['wiki/a.md', 'wiki/INDEX.md', '../x.md'])).toBeNull()
      expect(git(mine, 'log', '-1', '--format=%s')).toBe('edit: wiki/a.md')
      expect(git(mine, 'show', '--name-only', '--format=', 'HEAD')).toBe('wiki/a.md')
      expect(await newDocs(mine)).toEqual(['wiki/b.md'])
      expect(await unpushedCount(mine)).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('고르기를 기다리는 충돌이 있으면 저장하지 않고 사유를 준다', async () => {
    const { root, mine, mate } = await team()
    try {
      writeFileSync(join(mate, 'wiki', 'INDEX.md'), '# 팀\n')
      commit(mate, 'mate index')
      git(mate, 'push', '-q', 'origin', 'main')
      writeFileSync(join(mine, 'wiki', 'INDEX.md'), '# 나\n')
      commit(mine, 'mine')
      expect(await syncVault(mine)).toMatchObject({ conflicts: ['wiki/INDEX.md'] })
      writeFileSync(join(mine, 'wiki', 'a.md'), '# a\n')
      expect(await commitNewDocs(mine, ['wiki/a.md'])).toContain('승인에서 고른')
      expect(git(mine, 'status', '--porcelain', '--', 'wiki/a.md')).toBe('?? wiki/a.md')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
