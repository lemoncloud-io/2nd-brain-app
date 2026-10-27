import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { EngineEvent } from '../../shared/ipc-contract'
import { INGEST_LOCK, createClaudeCliEngine, toolTarget, userContent } from './claude-engine'
import type { Engine } from './engine'

const fakeClaude = (name: string): string => resolve('test/fixtures/fake-claude', name, 'claude')

const withDir = async (body: (dir: string) => Promise<void>): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), 'engine-'))
  try {
    await body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const collect = async (engine: Engine, dir: string): Promise<EngineEvent[]> => {
  const events: EngineEvent[] = []
  for await (const event of engine.run({ vaultDir: dir, prompt: 'job' })) events.push(event)
  return events
}

const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<void> => {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, 20))
  }
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('ClaudeCliEngine', () => {
  // 서브에이전트·스킬 승인이 빈칸으로 오면 사람은 내용을 모른 채 눌러야 한다
  it('Task·Skill 도구 입력에서도 승인 카드의 대상을 뽑는다', () => {
    expect(toolTarget({ description: '관련 파일 찾기', prompt: '긴 지시…' })).toBe('관련 파일 찾기')
    expect(toolTarget({ skill: 'vault-ingest-agent', args: 'x' })).toBe('vault-ingest-agent')
    expect(toolTarget({ command: 'date' })).toBe('date')
    expect(toolTarget({})).toBe('')
  })

  it('녹화된 stream-json 을 text·tool·file-change 이벤트로 바꾸고 성공 done 으로 끝낸다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('run')), dir)
      expect(events).toContainEqual({ type: 'tool', name: 'Bash', target: 'git status --short' })
      expect(events).toContainEqual({ type: 'file-change', path: '/vault/note.md' })
      expect(events.some((e) => e.type === 'text')).toBe(true)
      expect(events.at(-1)).toEqual({ type: 'done', ok: true, canceled: false })
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(false)
    })
  })

  // 녹화본(test/fixtures/claude-ndjson/thinking.ndjson) 그대로다: modelUsage 에는 제목용 haiku 가
  // 늘 같이 와 항목이 둘이라, init 줄이 말한 모델 키로 맞추지 않으면 사용률이 영영 안 뜬다
  it('모델명과 컨텍스트 사용률을 usage 이벤트로 낸다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('usage')), dir)
      expect(events).toContainEqual({
        type: 'usage',
        usage: { model: 'claude-opus-5[1m]', contextPercent: null }
      })
      // 마지막 요청 2+16+10351+4853 = 15222 ÷ 1000000 = 2%
      expect(events).toContainEqual({
        type: 'usage',
        usage: { model: 'claude-opus-5[1m]', contextPercent: 2 }
      })
    })
  })

  // 창 크기를 모르는데 비율을 만들어 내면, 사람은 없는 수를 믿고 대화를 버리거나 붙든다
  it('창 크기가 없으면 사용률을 꾸며내지 않는다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('usage-nowindow')), dir)
      const percents = events
        .filter((e) => e.type === 'usage')
        .map((e) => (e.type === 'usage' ? e.usage.contextPercent : undefined))
      expect(percents).toEqual([null, null])
    })
  })

  it('어느 모델이 돌았는지 모르고 항목이 여럿이면 사용률을 보내지 않는다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('usage-twomodels')), dir)
      expect(events.filter((e) => e.type === 'usage')).toEqual([])
    })
  })

  // 이 줄이 와야 실제로 가벼워진 것이다 — 없으면 압축은 일어나지 않았다
  it('compact_boundary 줄을 compacted 이벤트로 낸다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('compact')), dir)
      expect(events).toContainEqual({ type: 'compacted' })
      expect(events).toContainEqual({
        type: 'usage',
        usage: { model: 'claude-opus-5[1m]', contextPercent: 15 }
      })
    })
  })

  it('청크 경계에서 잘린 줄도 이벤트 하나로 한 번만 나온다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('chunked')), dir)
      expect(events).toEqual([
        { type: 'text', text: 'hello' },
        { type: 'done', ok: true, canceled: false }
      ])
    })
  })

  it('파싱할 수 없는 줄은 error 이벤트가 되고 실행은 계속된다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('badline')), dir)
      expect(events[0]).toMatchObject({
        type: 'error',
        message: expect.stringContaining('not json')
      })
      expect(events.at(-1)).toEqual({ type: 'done', ok: true, canceled: false })
    })
  })

  it('exit≠0 이면 stderr 를 담은 error 와 실패 done 을 내고 lock 을 푼다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('fail')), dir)
      expect(events).toContainEqual({
        type: 'error',
        message: expect.stringMatching(/exit 3.*boom/)
      })
      expect(events.at(-1)).toEqual({ type: 'done', ok: false, canceled: false })
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(false)
    })
  })

  it('result 줄 없이 끝나면 실패다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('noresult')), dir)
      expect(events).toContainEqual({ type: 'error', message: expect.stringContaining('result') })
      expect(events.at(-1)).toEqual({ type: 'done', ok: false, canceled: false })
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(false)
    })
  })

  it('실행 파일이 없으면 실패 done 으로 끝난다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(join(dir, 'missing-claude')), dir)
      expect(events[0]?.type).toBe('error')
      expect(events.at(-1)).toEqual({ type: 'done', ok: false, canceled: false })
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(false)
    })
  })

  it('실행 중인 볼트의 두 번째 실행은 거절되고 첫 실행의 lock 은 유지된다', async () => {
    await withDir(async (dir) => {
      const engine = createClaudeCliEngine(fakeClaude('slow'))
      const first = collect(engine, dir)
      await waitFor(() => existsSync(join(dir, 'child.pid')))

      const second = await collect(createClaudeCliEngine(fakeClaude('run')), dir)
      expect(second).toEqual([
        { type: 'error', message: expect.stringContaining('진행 중') },
        { type: 'done', ok: false, canceled: false }
      ])
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(true)

      engine.cancel()
      await first
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(false)
    })
  })

  it('CLI 에 권한 경계 인자를 넘긴다 — push·merge 거부, 사용자 설정 제외', async () => {
    await withDir(async (dir) => {
      await collect(createClaudeCliEngine(fakeClaude('args')), dir)
      const args = readFileSync(join(dir, 'args.txt'), 'utf8').trim().split('\n')
      const valueOf = (flag: string): string | undefined => args[args.indexOf(flag) + 1]
      expect(args[0]).toBe('-p')
      // 프롬프트는 argv 가 아니라 stdin 으로 간다
      expect(args).not.toContain('job')
      expect(readFileSync(join(dir, 'stdin.txt'), 'utf8')).toBe('job')
      expect(args).toContain('--verbose')
      expect(valueOf('--setting-sources')).toBe('project')
      expect(valueOf('--disallowedTools')).toBe('Bash(git push:*),Bash(git merge:*)')
    })
  })

  it('시작 전에 취소하면 CLI 를 띄우지 않고 취소 done 으로 끝낸다', async () => {
    await withDir(async (dir) => {
      const engine = createClaudeCliEngine(fakeClaude('slow'))
      engine.cancel()
      const events = await collect(engine, dir)
      expect(events).toEqual([{ type: 'done', ok: false, canceled: true }])
      expect(existsSync(join(dir, 'child.pid'))).toBe(false)
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(false)
    })
  })

  it('죽은 프로세스가 남긴 lock 은 회수하고 실행한다', async () => {
    await withDir(async (dir) => {
      const deadPid = spawnSync('true').pid
      mkdirSync(join(dir, '.locks'))
      writeFileSync(join(dir, INGEST_LOCK), `${deadPid}\n`)
      const events = await collect(createClaudeCliEngine(fakeClaude('chunked')), dir)
      expect(events.at(-1)).toEqual({ type: 'done', ok: true, canceled: false })
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(false)
    })
  })

  it('살아 있는 프로세스의 lock 은 건드리지 않고 거절한다', async () => {
    await withDir(async (dir) => {
      mkdirSync(join(dir, '.locks'))
      writeFileSync(join(dir, INGEST_LOCK), `${process.pid}\n`)
      const events = await collect(createClaudeCliEngine(fakeClaude('chunked')), dir)
      expect(events.at(-1)).toEqual({ type: 'done', ok: false, canceled: false })
      expect(readFileSync(join(dir, INGEST_LOCK), 'utf8')).toBe(`${process.pid}\n`)
    })
  })

  it('취소하면 취소 done 을 내고 엔진이 띄운 자식 프로세스까지 끝낸다', async () => {
    await withDir(async (dir) => {
      const engine = createClaudeCliEngine(fakeClaude('slow'))
      const running = collect(engine, dir)
      await waitFor(() => existsSync(join(dir, 'child.pid')))
      const grandchild = Number(readFileSync(join(dir, 'child.pid'), 'utf8'))
      expect(isAlive(grandchild)).toBe(true)

      engine.cancel()
      const events = await running
      expect(events.at(-1)).toEqual({ type: 'done', ok: false, canceled: true })
      await waitFor(() => !isAlive(grandchild))
    })
  })
})

describe('query 프로필 — 채팅 (slice 10)', () => {
  it('query 프로필은 읽기 전용 인자로 띄우고 프롬프트를 stdin 으로 넘기며 lock 을 잡지 않는다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('args'), 'query'), dir)
      const args = readFileSync(join(dir, 'args.txt'), 'utf8').trim().split('\n')
      expect(args).toEqual([
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--setting-sources',
        'project',
        '--allowedTools',
        'Read,Glob,Grep',
        '--disallowedTools',
        'Write,Edit,MultiEdit,NotebookEdit,Bash'
      ])
      expect(readFileSync(join(dir, 'stdin.txt'), 'utf8')).toBe('job')
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(false)
      expect(events.at(-1)).toEqual({ type: 'done', ok: true, canceled: false })
    })
  })

  it('system/init 의 session_id 를 session 이벤트로 낸다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createClaudeCliEngine(fakeClaude('query'), 'query'), dir)
      expect(events).toContainEqual({ type: 'session', id: 'sess-query-1' })
    })
  })
})

describe('붙인 그림 — 채팅 질문', () => {
  const image = { mediaType: 'image/png' as const, data: 'iVBORw0KGgo=' }

  it('켜 둔 세션에 보내는 메시지 본문 — 그림이 없으면 글 하나, 있으면 그림 블록 뒤에 질문 글', () => {
    expect(userContent({ prompt: 'q' })).toBe('q')
    expect(userContent({ prompt: '이게 뭐야', images: [image] })).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image.data } },
      { type: 'text', text: '이게 뭐야' }
    ])
  })
})

describe('thinking — 슬라이스 13', () => {
  it('thinking 블록은 문구가 있을 때만 thinking 이벤트로 낸다 — 녹화본은 문구가 비어 있다', async () => {
    await withDir(async (dir) => {
      const recorded = await collect(createClaudeCliEngine(fakeClaude('thinking'), 'query'), dir)
      expect(recorded.some((e) => e.type === 'thinking')).toBe(false)
      expect(recorded).toContainEqual({ type: 'text', text: '410' })
      expect(recorded.at(-1)).toEqual({ type: 'done', ok: true, canceled: false })

      const filled = await collect(createClaudeCliEngine(fakeClaude('markdown'), 'query'), dir)
      expect(filled).toContainEqual({ type: 'thinking', text: '먼저 페이지를 떠올린다' })
    })
  })
})
