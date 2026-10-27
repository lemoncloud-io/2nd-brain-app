import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname as root, join } from 'node:path'
import { createVaultFromTemplate, type TemplateVaultDeps } from './template-vault'
import { cloneVault } from './clone-service'
import { createVault } from './vault-service'

type Call = { path: string; method: string; body: unknown }

/** GitHub 대역 — 경로마다 차례로 줄 응답. 다 쓰면 마지막 것을 되풀이한다 */
const fakeGithub = (
  replies: Record<string, { status: number; body: unknown }[]>
): { fetch: typeof globalThis.fetch; calls: Call[] } => {
  const calls: Call[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path: url.pathname, method, body })
    const queue = replies[`${method} ${url.pathname}`] ?? []
    const reply = queue.length > 1 ? queue.shift() : queue[0]
    if (!reply) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

const commit = (dir: string): void => {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'x'],
    {
      cwd: dir
    }
  )
}

/** 템플릿에서 만든 저장소를 흉내낸다 — 기본 브랜치 master 인 보관함 bare 저장소 */
const templateRepo = (root: string, opts: { drop?: string[] } = {}): string => {
  const source = join(root, `source-${Math.random().toString(36).slice(2)}`)
  const bare = join(root, `made-${Math.random().toString(36).slice(2)}.git`)
  mkdirSync(source)
  expect(createVault(source).ok).toBe(true)
  execFileSync('git', ['branch', '-m', 'main', 'master'], { cwd: source })
  for (const entry of opts.drop ?? []) rmSync(join(source, entry), { recursive: true, force: true })
  commit(source)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'master', bare])
  execFileSync('git', ['push', '-q', bare, 'master'], { cwd: source })
  return bare
}

const made = (name: string): { status: number; body: unknown } => ({
  status: 201,
  body: { full_name: `me/${name}`, clone_url: `https://github.com/me/${name}.git` }
})
const exists = {
  status: 422,
  body: {
    message: 'Repository creation failed.',
    errors: [
      { resource: 'Repository', field: 'name', message: 'name already exists on this account' }
    ]
  }
}

const GENERATE = 'POST /repos/lemoncloud-io/2nd-brain-template/generate'

type Harness = {
  deps: TemplateVaultDeps
  calls: Call[]
  pending: { value: string | undefined }
  cloned: string[]
  connected: { dir: string; url: string }[]
}

/** 받기는 GitHub 주소를 로컬 bare 로 돌려 진짜 cloneVault 를 탄다 */
const harness = (
  replies: Record<string, { status: number; body: unknown }[]>,
  bareFor: (url: string) => string,
  opts: { pending?: string; connect?: { ok: true } | { ok: false; reason: string } } = {}
): Harness => {
  const { fetch, calls } = fakeGithub(replies)
  const pending = { value: opts.pending }
  const cloned: string[] = []
  const connected: { dir: string; url: string }[] = []
  return {
    calls,
    pending,
    cloned,
    connected,
    deps: {
      github: { token: 'tok', fetch },
      template: 'lemoncloud-io/2nd-brain-template',
      clone: (url, dir) => {
        cloned.push(url)
        return cloneVault(bareFor(url), root(dir), { into: dir })
      },
      wait: async () => undefined,
      pending: { get: () => pending.value, set: (v) => (pending.value = v) },
      skeleton: (dir) => createVault(dir),
      connect: async (dir, url) => {
        connected.push({ dir, url })
        return opts.connect ?? { ok: true }
      }
    }
  }
}

const withRoot = async (fn: (root: string) => Promise<void>): Promise<void> => {
  const root = mkdtempSync(join(tmpdir(), 'template-vault-'))
  try {
    await fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('createVaultFromTemplate', () => {
  it('로그인 계정에 비공개 2nd-brain 저장소를 템플릿으로 만들고 기본 위치에 받는다', () =>
    withRoot(async (root) => {
      const bare = templateRepo(root)
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      const h = harness({ [GENERATE]: [made('2nd-brain')] }, () => bare)

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result).toEqual({
        ok: true,
        dir: join(parent, '2nd-brain'),
        repo: 'me/2nd-brain',
        via: 'template'
      })
      expect(h.calls[0]).toEqual({
        path: '/repos/lemoncloud-io/2nd-brain-template/generate',
        method: 'POST',
        body: expect.objectContaining({ owner: 'me', name: '2nd-brain', private: true })
      })
      expect(h.cloned).toEqual(['https://github.com/me/2nd-brain.git'])
      expect(existsSync(join(parent, '2nd-brain', 'wiki', 'INDEX.md'))).toBe(true)
      // 열기에 성공하면 만들던 저장소 기록을 지운다
      expect(h.pending.value).toBeUndefined()
    }))

  it('이름이 겹치면 2nd-brain-2 로 다시 만든다', () =>
    withRoot(async (root) => {
      const bare = templateRepo(root)
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      const h = harness({ [GENERATE]: [exists, made('2nd-brain-2')] }, () => bare)

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result).toMatchObject({ ok: true, repo: 'me/2nd-brain-2' })
      expect(h.calls.map((c) => (c.body as { name: string }).name)).toEqual([
        '2nd-brain',
        '2nd-brain-2'
      ])
    }))

  it('이름 중복이 상한까지 이어지면 멈추고 할 일을 말한다', () =>
    withRoot(async (root) => {
      const h = harness({ [GENERATE]: [exists] }, () => '')

      const result = await createVaultFromTemplate(h.deps, { parentDir: root, login: 'me' })

      expect(result).toEqual({ ok: false, reason: expect.stringContaining('이미') })
      expect(h.calls.length).toBe(10)
    }))

  it('받은 저장소에 필수 항목이 없으면 폴더를 지우고 빠진 이름을 말한다', () =>
    withRoot(async (root) => {
      const bare = templateRepo(root, { drop: ['templates', 'VAULT_RULES.md'] })
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      const h = harness({ [GENERATE]: [made('2nd-brain')] }, () => bare)

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toContain('VAULT_RULES.md')
      expect(result.reason).toContain('templates')
      expect(readdirSync(join(parent, '2nd-brain'))).toEqual([])
    }))

  it('Documents 에 같은 이름 폴더가 있으면 2nd-brain-2 폴더로 받는다', () =>
    withRoot(async (root) => {
      const bare = templateRepo(root)
      const parent = join(root, 'Documents')
      mkdirSync(join(parent, '2nd-brain'), { recursive: true })
      writeFileSync(join(parent, '2nd-brain', 'mine.txt'), 'keep')
      const h = harness({ [GENERATE]: [made('2nd-brain')] }, () => bare)

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result).toMatchObject({ ok: true, dir: join(parent, '2nd-brain-2') })
      expect(existsSync(join(parent, '2nd-brain', 'mine.txt'))).toBe(true)
    }))

  it('만든 직후 저장소가 아직 비어 있으면 잠시 뒤 다시 받는다', () =>
    withRoot(async (root) => {
      const full = templateRepo(root)
      const empty = join(root, 'empty.git')
      execFileSync('git', ['init', '-q', '--bare', '-b', 'master', empty])
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      let tries = 0
      const h = harness({ [GENERATE]: [made('2nd-brain')] }, () => (++tries < 2 ? empty : full))

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result).toMatchObject({ ok: true, dir: join(parent, '2nd-brain') })
      expect(tries).toBe(2)
    }))

  it('받기가 끝내 실패하면 만든 저장소를 기억해 두고, 다시 누르면 새로 만들지 않고 그것을 받는다', () =>
    withRoot(async (root) => {
      const full = templateRepo(root)
      const empty = join(root, 'empty.git')
      execFileSync('git', ['init', '-q', '--bare', '-b', 'master', empty])
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      let ready = false
      const h = harness({ [GENERATE]: [made('2nd-brain')] }, () => (ready ? full : empty))

      const first = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })
      expect(first.ok).toBe(false)
      expect(h.pending.value).toBe('me/2nd-brain')

      ready = true
      const second = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })
      expect(second).toMatchObject({ ok: true, repo: 'me/2nd-brain' })
      // generate 는 처음 한 번뿐이다
      expect(h.calls.filter((c) => c.path.endsWith('/generate')).length).toBe(1)
      expect(h.pending.value).toBeUndefined()
    }))

  it('기억해 둔 저장소 이름이 저장소 이름 모양이 아니면 받지 않고 새로 만든다', () =>
    withRoot(async (root) => {
      const bare = templateRepo(root)
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      const h = harness({ [GENERATE]: [made('2nd-brain')] }, () => bare, {
        pending: 'me/../../evil'
      })
      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })
      expect(result).toMatchObject({ ok: true, repo: 'me/2nd-brain' })
      expect(h.calls.filter((c) => c.path.endsWith('/generate')).length).toBe(1)
    }))

  it('기억해 둔 저장소를 더는 받을 수 없으면 기록을 지우고, 다시 누르면 새로 만든다', () =>
    withRoot(async (root) => {
      const bare = templateRepo(root)
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      // 사람이 GitHub 에서 그 저장소를 지웠다 — 받기가 "없다" 로 끝난다
      const h = harness(
        { [GENERATE]: [made('2nd-brain-2')] },
        (url) => (url.endsWith('/2nd-brain.git') ? join(root, 'gone.git') : bare),
        { pending: 'me/2nd-brain' }
      )

      const first = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })
      expect(first.ok).toBe(false)
      expect(h.pending.value).toBeUndefined()

      const second = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })
      expect(second).toMatchObject({ ok: true, repo: 'me/2nd-brain-2' })
    }))

  it('방금 만든 저장소가 끝내 안 보여도 기록은 남긴다 — 다시 누르면 새로 만들지 않는다', () =>
    withRoot(async (root) => {
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      const h = harness({ [GENERATE]: [made('2nd-brain')] }, () => join(root, 'not-yet.git'))

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result.ok).toBe(false)
      expect(h.pending.value).toBe('me/2nd-brain')
    }))

  it('기억해 둔 저장소가 보관함이 아니면 기록을 지운다', () =>
    withRoot(async (root) => {
      const broken = templateRepo(root, { drop: ['wiki'] })
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      const h = harness({}, () => broken, { pending: 'me/2nd-brain' })

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result.ok).toBe(false)
      expect(h.pending.value).toBeUndefined()
    }))

  it('다른 계정이 만들던 저장소 기록은 쓰지 않고 새로 만든다', () =>
    withRoot(async (root) => {
      const bare = templateRepo(root)
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      const h = harness({ [GENERATE]: [made('2nd-brain')] }, () => bare, {
        pending: 'someone/2nd-brain'
      })

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result).toMatchObject({ ok: true, repo: 'me/2nd-brain' })
      expect(h.calls.filter((c) => c.path.endsWith('/generate')).length).toBe(1)
    }))

  it('템플릿을 볼 수 없으면(404) 앱 뼈대로 만들고 내 비공개 저장소를 만들어 올린다', () =>
    withRoot(async (root) => {
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      const h = harness(
        {
          [GENERATE]: [{ status: 404, body: { message: 'Not Found' } }],
          'POST /user/repos': [
            exists,
            {
              status: 201,
              body: { clone_url: 'https://github.com/me/2nd-brain-2.git' }
            }
          ]
        },
        () => ''
      )

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result).toEqual({
        ok: true,
        dir: join(parent, '2nd-brain'),
        repo: 'me/2nd-brain-2',
        via: 'skeleton'
      })
      expect(existsSync(join(parent, '2nd-brain', 'VAULT_RULES.md'))).toBe(true)
      const created = h.calls.filter((c) => c.path === '/user/repos')
      expect(created.map((c) => (c.body as { name: string; private: boolean }).private)).toEqual([
        true,
        true
      ])
      expect(h.connected).toEqual([
        { dir: join(parent, '2nd-brain'), url: 'https://github.com/me/2nd-brain-2.git' }
      ])
      expect(h.cloned).toEqual([])
    }))

  it('뼈대로 만든 뒤 올리기가 실패해도 보관함은 열고 무엇이 안 됐는지 같이 돌려준다', () =>
    withRoot(async (root) => {
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      const h = harness(
        {
          [GENERATE]: [{ status: 404, body: { message: 'Not Found' } }],
          'POST /user/repos': [
            { status: 201, body: { clone_url: 'https://github.com/me/2nd-brain.git' } }
          ]
        },
        () => '',
        { connect: { ok: false, reason: '올리지 못했어요' } }
      )

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result).toMatchObject({
        ok: true,
        via: 'skeleton',
        publishError: expect.stringContaining('올리지 못했어요')
      })
    }))

  it('뼈대 보관함을 저장소에 잇다가 예외가 나도 보관함은 열고 올리지 못했다고 말한다', () =>
    withRoot(async (root) => {
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      const h = harness(
        {
          [GENERATE]: [{ status: 404, body: { message: 'Not Found' } }],
          'POST /user/repos': [
            { status: 201, body: { clone_url: 'https://github.com/me/2nd-brain.git' } }
          ]
        },
        () => ''
      )
      h.deps.connect = async () => {
        throw new Error('git remote add failed')
      }

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result).toMatchObject({
        ok: true,
        dir: join(parent, '2nd-brain'),
        repo: 'me/2nd-brain',
        via: 'skeleton',
        publishError: expect.any(String)
      })
    }))

  it('로그인이 풀렸으면(401) 다시 로그인하라고 말하고 폴더를 만들지 않는다', () =>
    withRoot(async (root) => {
      const parent = join(root, 'Documents')
      mkdirSync(parent)
      writeFileSync(join(parent, 'other.txt'), 'x')
      const h = harness(
        { [GENERATE]: [{ status: 401, body: { message: 'Bad credentials' } }] },
        () => ''
      )

      const result = await createVaultFromTemplate(h.deps, { parentDir: parent, login: 'me' })

      expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('로그인') })
      expect(readdirSync(parent)).toEqual(['other.txt'])
    }))
})
