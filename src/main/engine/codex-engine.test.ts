import { describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { EngineEvent } from '../../shared/ipc-contract'
import { INGEST_LOCK } from './claude-engine'
import { createCodexCliEngine } from './codex-engine'
import type { Engine, IngestJob } from './engine'

const fakeCodex = (name: string): string => resolve('test/fixtures/fake-codex', name, 'codex')

const withDir = async (body: (dir: string) => Promise<void>): Promise<void> => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'codex-engine-')))
  try {
    await body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const collect = async (engine: Engine, job: IngestJob): Promise<EngineEvent[]> => {
  const events: EngineEvent[] = []
  for await (const event of engine.run(job)) events.push(event)
  return events
}

const argsIn = (dir: string): string[] =>
  readFileSync(join(dir, 'args.txt'), 'utf8').trim().split('\n')

describe('CodexCliEngine — 녹화한 codex exec --json', () => {
  it('thread·명령·답·턴 완료를 session·tool·text 이벤트와 성공 done 으로 바꾼다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createCodexCliEngine(fakeCodex('run'), 'query'), {
        vaultDir: dir,
        prompt: 'p'
      })
      expect(events[0]).toEqual({ type: 'session', id: '01a0a3c6-e87b-7180-9581-f0f385e21f01' })
      const tools = events.filter((e) => e.type === 'tool')
      expect(tools).toHaveLength(1)
      expect(tools[0]).toMatchObject({ type: 'tool', name: 'command' })
      expect(tools[0]!.type === 'tool' && tools[0]!.target).toContain('note.md')
      expect(events).toContainEqual({ type: 'text', text: 'hello vault' })
      expect(events.at(-1)).toEqual({ type: 'done', ok: true, canceled: false })
    })
  })

  it('turn.failed 는 안쪽 오류 문구를 담은 error 하나와 실패 done 이다 — 경고 항목은 오류로 치지 않는다', async () => {
    await withDir(async (dir) => {
      const events = await collect(createCodexCliEngine(fakeCodex('fail'), 'query'), {
        vaultDir: dir,
        prompt: 'p'
      })
      const errors = events.filter((e) => e.type === 'error')
      expect(errors).toHaveLength(1)
      expect(errors[0]!.type === 'error' && errors[0]!.message).toContain(
        "The 'no-such-model-xyz' model is not supported"
      )
      expect(events.at(-1)).toEqual({ type: 'done', ok: false, canceled: false })
    })
  })
})

describe('CodexCliEngine — 녹화한 workspace-write 실행', () => {
  it('file_change 항목의 경로마다 file-change 이벤트를 한 번씩 낸다(started 기준)', async () => {
    await withDir(async (dir) => {
      const events = await collect(createCodexCliEngine(fakeCodex('write'), 'ingest'), {
        vaultDir: dir,
        prompt: 'p'
      })
      const changes = events.filter((e) => e.type === 'file-change')
      expect(changes).toHaveLength(1)
      expect(changes[0]!.type === 'file-change' && changes[0]!.path).toMatch(/\/note\.md$/)
      expect(events.filter((e) => e.type === 'tool').length).toBe(3)
      expect(events.at(-1)).toEqual({ type: 'done', ok: true, canceled: false })
    })
  })
})

describe('CodexCliEngine — CLI 호출 계약', () => {
  it('채팅(query)은 read-only sandbox 로 볼트를 작업 루트 삼고 프롬프트를 stdin 으로 넘긴다', async () => {
    await withDir(async (dir) => {
      await collect(createCodexCliEngine(fakeCodex('args'), 'query'), {
        vaultDir: dir,
        prompt: '질문'
      })
      expect(argsIn(dir)).toEqual([
        'exec',
        '--json',
        '--skip-git-repo-check',
        '-s',
        'read-only',
        '-C',
        dir,
        // 채팅이 아닌 실행은 웹 검색을 기본값에 맡기지 않고 끈다
        '-c',
        'web_search="disabled"',
        '-'
      ])
      expect(readFileSync(join(dir, 'stdin.txt'), 'utf8')).toBe('질문')
      expect(readFileSync(join(dir, 'cwd.txt'), 'utf8').trim()).toBe(dir)
      expect(existsSync(join(dir, INGEST_LOCK))).toBe(false)
    })
  })

  it('위키화(ingest)는 workspace-write sandbox, 모델이 있으면 -m 으로 넘긴다', async () => {
    await withDir(async (dir) => {
      await collect(createCodexCliEngine(fakeCodex('args'), 'ingest', { model: 'gpt-5.1-codex' }), {
        vaultDir: dir,
        prompt: 'job'
      })
      const args = argsIn(dir)
      expect(args[args.indexOf('-s') + 1]).toBe('workspace-write')
      // 작업 브랜치·커밋을 위해 .git 쓰기를 연다
      expect(args[args.indexOf('--add-dir') + 1]).toBe(join(dir, '.git'))
      expect(args[args.indexOf('-m') + 1]).toBe('gpt-5.1-codex')
      expect(args.at(-1)).toBe('-')
    })
  })

  it('AI 점검도 read-only sandbox 다', async () => {
    for (const profile of ['lint'] as const) {
      await withDir(async (dir) => {
        await collect(createCodexCliEngine(fakeCodex('args'), profile), {
          vaultDir: dir,
          prompt: 'p'
        })
        const args = argsIn(dir)
        expect(args[args.indexOf('-s') + 1], profile).toBe('read-only')
        expect(args, profile).not.toContain('--add-dir')
      })
    }
  })

  it('살아 있는 위키화 lock 이 있으면 ingest 는 CLI 를 띄우지 않고 거절한다', async () => {
    await withDir(async (dir) => {
      mkdirSync(join(dir, '.locks'), { recursive: true })
      writeFileSync(join(dir, INGEST_LOCK), `${process.pid}\n`)
      const events = await collect(createCodexCliEngine(fakeCodex('args'), 'ingest'), {
        vaultDir: dir,
        prompt: 'job'
      })
      expect(events).toEqual([
        { type: 'error', message: '이 보관함에서 진행 중인 위키 초안 만들기가 있어요' },
        { type: 'done', ok: false, canceled: false }
      ])
      expect(existsSync(join(dir, 'args.txt'))).toBe(false)
    })
  })

  it('취소하면 취소 done 을 내고 엔진이 띄운 자식 프로세스까지 끝낸다', async () => {
    await withDir(async (dir) => {
      const engine = createCodexCliEngine(fakeCodex('slow'), 'query')
      const running = collect(engine, { vaultDir: dir, prompt: 'p' })
      const pidFile = join(dir, 'child.pid')
      const started = Date.now()
      while (!existsSync(pidFile) || readFileSync(pidFile, 'utf8').trim() === '') {
        if (Date.now() - started > 5000) throw new Error('child.pid 를 기다리다 시간 초과')
        await new Promise((r) => setTimeout(r, 20))
      }
      const child = Number(readFileSync(pidFile, 'utf8'))
      engine.cancel()
      expect((await running).at(-1)).toEqual({ type: 'done', ok: false, canceled: true })
      await new Promise((r) => setTimeout(r, 200))
      expect(() => process.kill(child, 0)).toThrow()
    })
  })
})
