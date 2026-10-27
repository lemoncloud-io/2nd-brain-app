import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AppSettings } from '../settings'
import { chatSessionBase, createEngineFactory, engineCliOf } from './create-engine'
import type { ChatPermissionMode } from '../../shared/chat-permission'
import type { Engine } from './engine'

const ARGS_CLI = resolve('test/fixtures/fake-claude/args/claude')
const CODEX_ARGS_CLI = resolve('test/fixtures/fake-codex/args/codex')
const CLAUDE = { kind: 'claude', path: ARGS_CLI } as const
const CODEX = { kind: 'codex', path: CODEX_ARGS_CLI } as const

const argsOf = async (engine: Engine, mode?: ChatPermissionMode): Promise<string[]> => {
  const dir = mkdtempSync(join(tmpdir(), 'create-engine-'))
  try {
    for await (const event of engine.run({ vaultDir: dir, prompt: 'p', mode })) void event
    return readFileSync(join(dir, 'args.txt'), 'utf8').trim().split('\n')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const valueOf = (args: string[], flag: string): string | undefined =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined

describe('engineCliOf', () => {
  it('설치된 CLI 에 로그인돼 있으면 그 엔진 종류와 경로다', () => {
    expect(
      engineCliOf({ engine: 'claude', cli: { path: '/c', version: '1' }, auth: { loggedIn: true } })
    ).toEqual({ kind: 'claude', path: '/c' })
  })

  it('CLI 가 없으면 탐지 사유, 미로그인이면 엔진 이름을 담은 사유다', () => {
    expect(
      engineCliOf({
        engine: 'codex',
        cli: { missing: true, reason: 'codex 실행 파일을 찾지 못했다' },
        auth: { loggedIn: false }
      })
    ).toEqual({ error: 'codex 실행 파일을 찾지 못했다' })
    expect(
      engineCliOf({ engine: 'codex', cli: { path: '/x', version: '1' }, auth: { loggedIn: false } })
    ).toEqual({ error: 'Codex 로그인이 필요해요' })
    expect(
      engineCliOf({
        engine: 'claude',
        cli: { path: '/c', version: '1' },
        auth: { loggedIn: false }
      })
    ).toEqual({ error: 'Claude 로그인이 필요해요' })
  })
})

describe('createEngineFactory', () => {
  it('켠 MCP 서버는 선택 영역 고치기에만 넘긴다 — 위키화·점검은 받지 않는다', async () => {
    const settings: AppSettings = {
      mcpServers: [
        {
          name: 'docs',
          enabled: true,
          kind: 'http',
          command: '',
          args: [],
          env: {},
          url: 'https://d.example/mcp'
        },
        { name: 'off', enabled: false, kind: 'stdio', command: 'x', args: [], env: {}, url: '' }
      ]
    }
    const create = createEngineFactory(() => settings)
    const aside = await argsOf(create('aside', CLAUDE))
    expect(valueOf(aside, '--allowedTools')).toBe('Read,Glob,Grep,mcp__docs__*')
    expect(JSON.parse(valueOf(aside, '--mcp-config') ?? '{}')).toEqual({
      mcpServers: { docs: { type: 'http', url: 'https://d.example/mcp' } }
    })
    for (const use of ['ingest', 'lint', 'draft'] as const) {
      expect(await argsOf(create(use, CLAUDE))).not.toContain('--mcp-config')
    }
    expect(await argsOf(create('aside', CODEX))).toContain(
      'mcp_servers.docs.url="https://d.example/mcp"'
    )
    expect((await argsOf(create('ingest', CODEX))).join(' ')).not.toContain('mcp_servers')
  })

  it('용도에 맞는 프로필로 Claude 엔진을 만든다 — 점검·초안·곁일은 보관함 읽기뿐, 위키화는 쓰기, 웹 도구는 없다', async () => {
    const create = createEngineFactory(() => ({}))
    expect(valueOf(await argsOf(create('lint', CLAUDE)), '--allowedTools')).toBe('Read,Glob,Grep')
    expect(valueOf(await argsOf(create('draft', CLAUDE)), '--allowedTools')).toBe('Read,Glob,Grep')
    // 선택 영역 고치기는 채팅 모델로 돌지만 웹 도구는 없다
    expect(valueOf(await argsOf(create('aside', CLAUDE)), '--allowedTools')).toBe('Read,Glob,Grep')
    const ingest = await argsOf(create('ingest', CLAUDE))
    expect(valueOf(ingest, '--allowedTools')).toBe('Read,Write,Edit,Glob,Grep,Bash(git:*)')
    for (const use of ['lint', 'draft', 'aside', 'ingest'] as const) {
      expect((await argsOf(create(use, CLAUDE))).join(' ')).not.toMatch(/WebFetch|WebSearch/)
    }
    expect(valueOf(await argsOf(create('ingest', CLAUDE)), '--permission-mode')).toBe('acceptEdits')
  })

  it('한 번 도는 실행은 보관함 설정만 읽고 승인을 주고받지 않는다', async () => {
    const create = createEngineFactory(() => ({}))
    for (const use of ['aside', 'ingest', 'lint', 'draft'] as const) {
      const args = await argsOf(create(use, CLAUDE))
      expect(valueOf(args, '--setting-sources')).toBe('project')
      expect(args).not.toContain('--permission-prompt-tool')
    }
  })

  it('모델 하나를 모든 용도가 --model 로 쓰고, 없으면 플래그를 붙이지 않는다', async () => {
    const create = createEngineFactory(() => ({ model: 'sonnet' }))
    for (const use of ['aside', 'ingest', 'lint', 'draft'] as const) {
      expect(valueOf(await argsOf(create(use, CLAUDE)), '--model')).toBe('sonnet')
    }
    const none = createEngineFactory(() => ({}))
    expect(await argsOf(none('ingest', CLAUDE))).not.toContain('--model')
  })

  it('위키 초안만 draftModel 로 돈다 — 없으면 위 모델, 다른 용도는 무시한다', async () => {
    const create = createEngineFactory(() => ({ model: 'sonnet', draftModel: 'haiku' }))
    expect(valueOf(await argsOf(create('draft', CLAUDE)), '--model')).toBe('haiku')
    for (const use of ['aside', 'ingest', 'lint'] as const) {
      expect(valueOf(await argsOf(create(use, CLAUDE)), '--model')).toBe('sonnet')
    }
    const codex = createEngineFactory(() => ({ model: 'sonnet', draftModel: 'haiku' }))
    expect(valueOf(await argsOf(codex('draft', CODEX)), '-m')).toBe('haiku')
    expect(valueOf(await argsOf(codex('aside', CODEX)), '-m')).toBe('sonnet')
  })

  it('초안 모델이 위 모델과 같으면 지운 것과 같다', async () => {
    const create = createEngineFactory(() => ({ model: 'sonnet', draftModel: 'sonnet' }))
    expect(valueOf(await argsOf(create('draft', CLAUDE)), '--model')).toBe('sonnet')
  })

  it('옛 용도별 설정만 있으면 채팅 모델을 모든 용도가 쓴다', async () => {
    const create = createEngineFactory(() => ({ models: { chat: 'opus', ingest: 'sonnet' } }))
    expect(valueOf(await argsOf(create('ingest', CLAUDE)), '--model')).toBe('opus')
    expect(valueOf(await argsOf(create('aside', CLAUDE)), '--model')).toBe('opus')
  })

  it('만들 때마다 설정을 다시 읽는다 — 저장한 모델이 재시작 없이 다음 실행에 쓰인다', async () => {
    let settings: AppSettings = {}
    const create = createEngineFactory(() => settings)
    expect(await argsOf(create('ingest', CLAUDE))).not.toContain('--model')
    settings = { model: 'opus' }
    expect(valueOf(await argsOf(create('ingest', CLAUDE)), '--model')).toBe('opus')
  })

  it('설정 파일에 잘못 들어간 모델 이름은 CLI 로 넘기지 않는다', async () => {
    const create = createEngineFactory(() => ({
      model: '--dangerously-skip-permissions'
    }))
    const args = await argsOf(create('ingest', CLAUDE))
    expect(args).not.toContain('--model')
    expect(args).not.toContain('--dangerously-skip-permissions')
  })

  it('Codex CLI 로 확인된 실행이면 Codex 엔진을 만들고 모델을 -m 으로 넘긴다', async () => {
    const create = createEngineFactory(() => ({ engine: 'codex', model: 'gpt-5.1-codex' }))
    const aside = await argsOf(create('aside', CODEX))
    // 웹 검색은 켜 둔 채팅 세션만 쓴다 — 여기서는 기본값에 기대지 않고 끈다
    expect(aside.slice(0, 2)).toEqual(['exec', '--json'])
    expect(valueOf(aside, '-s')).toBe('read-only')
    expect(valueOf(aside, '-m')).toBe('gpt-5.1-codex')
    for (const use of ['ingest', 'lint', 'draft', 'aside'] as const) {
      const args = await argsOf(create(use, CODEX))
      expect(args).toContain('web_search="disabled"')
      expect(args).not.toContain('web_search="live"')
    }
    const ingest = await argsOf(create('ingest', CODEX))
    expect(valueOf(ingest, '-s')).toBe('workspace-write')
    expect(valueOf(ingest, '-m')).toBe('gpt-5.1-codex')
  })

  it('IPC 핸들러는 엔진을 직접 만들지 않는다 — 팩토리만 쓴다', () => {
    const dir = resolve('src/main/ipc')
    const offenders = readdirSync(dir)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .filter((name) => /create(Claude|Codex)CliEngine/.test(readFileSync(join(dir, name), 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('chatSessionBase', () => {
  const cli = { path: '/bin/claude', kind: 'claude' as const }

  it('reads the user claude settings unless the chat default turns them off', () => {
    expect(chatSessionBase({}, cli).userSettings).toBe(true)
    expect(
      chatSessionBase({ chatDefaults: { permissionMode: 'ask', userSettings: false } }, cli)
        .userSettings
    ).toBe(false)
  })
})
