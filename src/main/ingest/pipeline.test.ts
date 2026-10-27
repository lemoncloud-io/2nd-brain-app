import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EngineEvent } from '../../shared/ipc-contract'
import { createVault } from '../vault/vault-service'
import {
  BATCH_MAX_CHARS,
  BATCH_MAX_SOURCES,
  chunkForBatch,
  runPipeline,
  type DraftRunner
} from './pipeline'
import type { PreparedClipping } from './prepare'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

const withVault = async (body: (dir: string) => Promise<void>): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-'))
  try {
    expect(createVault(dir).ok).toBe(true)
    await body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const DRAFT_OUTPUT = [
  '```',
  '@@ wiki/backpressure.md',
  '---',
  'type: concept',
  'topics: []',
  'status: draft',
  '---',
  '# 백프레셔',
  '',
  '## Summary',
  '',
  '압력이다.',
  '```'
].join('\n')

/** 가짜 초안 엔진 — 텍스트 한 번과 done 으로 답한다 */
const fakeRunner = (output: string, events: EngineEvent[] = []): DraftRunner => ({
  run: async function* () {
    yield { type: 'session', id: 'sess-test' }
    for (const e of events) yield e
    if (output) yield { type: 'text', text: output }
    yield { type: 'done', ok: true, canceled: false }
  },
  isCanceled: () => false
})

describe('runPipeline', () => {
  it('준비→초안→조립으로 작업 브랜치 성공을 낸다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑 본문.\n')
      const seen: EngineEvent[] = []
      const outcome = await runPipeline(dir, fakeRunner(DRAFT_OUTPUT), (e) => seen.push(e))
      expect(outcome).toMatchObject({ status: 'succeeded' })
      expect(git(dir, 'branch', '--show-current')).toMatch(/^app\/ingest-/)
      expect(seen.map((e) => e.type)).toContain('phase')
      expect(git(dir, 'log', '--format=%s')).toContain('feat: ingest 1 clippings into wiki')
    }))

  it('run-log 에 준비·초안 소요와 초안 입력량이 남는다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑 본문.\n')
      const outcome = await runPipeline(dir, fakeRunner(DRAFT_OUTPUT), () => {})
      expect(outcome).toMatchObject({ status: 'succeeded' })
      const runLog = readdirSync(join(dir, 'outputs', 'runs')).find((n) => n.includes('-ingest-'))
      expect(runLog).toBeTruthy()
      const log = readFileSync(join(dir, 'outputs', 'runs', runLog!), 'utf8')
      expect(log).toContain('- 소요: 준비')
      expect(log).toContain('· 초안')
      expect(log).toContain('- 초안 입력:')
      expect(log).toContain('(호출 1회)')
    }))

  it('초안 진행은 main 이 센 수(마친 자료/전체·페이지 초안)로 알린다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑 본문.\n')
      writeFileSync(join(dir, 'Clippings', 'b.md'), '---\ntitle: 을\n---\n\n을 본문.\n')
      const seen: EngineEvent[] = []
      await runPipeline(dir, fakeRunner(DRAFT_OUTPUT), (e) => seen.push(e))
      const progress = seen.flatMap((e) => (e.type === 'phase' && e.progress ? [e.progress] : []))
      expect(progress.map((p) => [p.done, p.total])).toEqual([
        [0, 2],
        [1, 2],
        [2, 2]
      ])
      expect(progress.at(-1)!.pages).toBeGreaterThan(0)
      // 초안 호출이 둘이어도 호출마다의 끝은 화면으로 가지 않는다
      expect(seen.some((e) => e.type === 'done')).toBe(false)
    }))

  it('다시 묻는 실패한 초안 호출의 끝도 화면으로 흘리지 않는다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑.\n')
      let calls = 0
      const runner: DraftRunner = {
        run: async function* () {
          calls += 1
          if (calls === 1) {
            yield { type: 'done', ok: false, canceled: false }
            return
          }
          yield { type: 'text', text: DRAFT_OUTPUT }
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const seen: EngineEvent[] = []
      const outcome = await runPipeline(dir, runner, (e) => seen.push(e))
      expect(calls).toBe(2)
      expect(outcome).toMatchObject({ status: 'succeeded' })
      expect(seen.some((e) => e.type === 'done')).toBe(false)
    }))

  it('초안이 계약을 어기면 한 번 다시 묻고, 그래도 안 되면 실패한다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑.\n')
      let calls = 0
      const runner: DraftRunner = {
        run: async function* () {
          calls += 1
          yield { type: 'text', text: '그냥 문장' }
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(calls).toBe(2)
      expect(outcome).toMatchObject({ status: 'failed' })
    }))

  it('Clippings 가 비면 엔진을 부르지 않는다', () =>
    withVault(async (dir) => {
      let called = false
      const runner: DraftRunner = {
        run: async function* () {
          called = true
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(outcome).toMatchObject({ status: 'failed' })
      expect(called).toBe(false)
    }))

  it('소량(3개)은 건당 호출을 유지한다', () =>
    withVault(async (dir) => {
      for (const name of ['a.md', 'b.md', 'c.md']) {
        writeFileSync(join(dir, 'Clippings', name), `---\ntitle: ${name}\n---\n\n본문.\n`)
      }
      let calls = 0
      let pages = 0
      const runner: DraftRunner = {
        run: async function* () {
          calls += 1
          pages += 1
          yield {
            type: 'text',
            text: [
              '```',
              `@@ wiki/single-${pages}.md`,
              '---',
              'type: concept',
              'topics: []',
              'status: draft',
              '---',
              `# 제목 ${pages}`,
              '',
              '## Summary',
              '',
              '본문이다.',
              '```'
            ].join('\n')
          }
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(outcome).toMatchObject({ status: 'succeeded' })
      expect(calls).toBe(3)
      expect(git(dir, 'log', '--format=%s')).toContain('feat: ingest 3 clippings into wiki')
    }))

  it('대량(5개)은 묶음 호출로 청크 수만큼만 엔진을 부른다', () =>
    withVault(async (dir) => {
      for (const name of ['a.md', 'b.md', 'c.md', 'd.md', 'e.md']) {
        writeFileSync(join(dir, 'Clippings', name), `---\ntitle: ${name}\n---\n\n본문.\n`)
      }
      let calls = 0
      let pages = 0
      const runner: DraftRunner = {
        run: async function* (prompt: string) {
          calls += 1
          const count = [...prompt.matchAll(/^## SOURCE (\d+):/gm)].length || 1
          const sections: string[] = []
          for (let i = 0; i < count; i += 1) {
            pages += 1
            sections.push(
              [
                `## SOURCE ${i + 1}: raw/x.md`,
                '```',
                `@@ wiki/bulk-${pages}.md`,
                '---',
                'type: concept',
                'topics: []',
                'status: draft',
                '---',
                `# 제목 ${pages}`,
                '',
                '## Summary',
                '',
                '본문이다.',
                '```'
              ].join('\n')
            )
          }
          yield { type: 'text', text: sections.join('\n') }
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(outcome).toMatchObject({ status: 'succeeded' })
      // 5개 → 3+2 청크 → 2호출 (건당이면 5호출)
      expect(calls).toBe(2)
      expect(git(dir, 'log', '--format=%s')).toContain('feat: ingest 5 clippings into wiki')
    }))

  it('묶음 실패는 낱개로 폴백해 결과를 낸다', () =>
    withVault(async (dir) => {
      for (const name of ['a.md', 'b.md', 'c.md', 'd.md']) {
        writeFileSync(join(dir, 'Clippings', name), `---\ntitle: ${name}\n---\n\n본문.\n`)
      }
      let calls = 0
      let pages = 0
      const runner: DraftRunner = {
        run: async function* (prompt: string) {
          calls += 1
          // 묶음 프롬프트에는 고의로 계약 위반을, 낱개에는 정상 초안을
          if (prompt.includes('## SOURCE')) {
            yield { type: 'text', text: '그냥 문장' }
          } else {
            pages += 1
            yield {
              type: 'text',
              text: [
                '```',
                `@@ wiki/fallback-${pages}.md`,
                '---',
                'type: concept',
                'topics: []',
                'status: draft',
                '---',
                `# 제목 ${pages}`,
                '',
                '## Summary',
                '',
                '본문이다.',
                '```'
              ].join('\n')
            }
          }
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(outcome).toMatchObject({ status: 'succeeded' })
      // 4개 → [3,1] 청크: 첫 청크 묶음 2회 실패 후 낱개 3회 + 둘째 청크 단독 1회
      expect(calls).toBe(2 + 3 + 1)
      expect(git(dir, 'log', '--format=%s')).toContain('feat: ingest 4 clippings into wiki')
    }))

  it('같은 내용은 LLM 호출 없이 건너뛰고 새 것만 쓴다', () =>
    withVault(async (dir) => {
      // 먼저 한 벌을 확정해 raw/에 남긴다
      writeFileSync(join(dir, 'Clippings', 'old.md'), '---\ntitle: 같음\n---\n\n같은 본문.\n')
      expect(await runPipeline(dir, fakeRunner(DRAFT_OUTPUT), () => {})).toMatchObject({
        status: 'succeeded'
      })
      const branch = git(dir, 'branch', '--show-current')
      git(dir, 'checkout', '-q', 'main')
      git(dir, 'merge', '-q', '--no-ff', branch, '-m', 'merge test')
      writeFileSync(join(dir, 'Clippings', 'same.md'), '---\ntitle: 같음\n---\n\n같은 본문.\n')
      writeFileSync(join(dir, 'Clippings', 'new.md'), '---\ntitle: 새로움\n---\n\n새 본문.\n')
      let calls = 0
      const marks: Array<[string, string]> = []
      const NEW_OUTPUT = DRAFT_OUTPUT.replaceAll('backpressure', 'fresh-note').replaceAll(
        '백프레셔',
        '새 글'
      )
      const runner: DraftRunner = {
        run: async function* () {
          calls += 1
          yield { type: 'text', text: NEW_OUTPUT }
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {}, {
        mark: (name, status) => marks.push([name, status])
      })
      expect(outcome).toMatchObject({ status: 'succeeded' })
      // 새 것만 1호출 — 같은 것은 스킵
      expect(calls).toBe(1)
      expect(marks).toContainEqual(['same.md', 'skipped'])
      expect(marks).toContainEqual(['new.md', 'done'])
    }))

  it('전부 같은 내용이면 엔진을 부르지 않고 성공한다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'old.md'), '---\ntitle: 같음\n---\n\n같은 본문.\n')
      expect(await runPipeline(dir, fakeRunner(DRAFT_OUTPUT), () => {})).toMatchObject({
        status: 'succeeded'
      })
      const branch = git(dir, 'branch', '--show-current')
      git(dir, 'checkout', '-q', 'main')
      git(dir, 'merge', '-q', '--no-ff', branch, '-m', 'merge test')
      writeFileSync(join(dir, 'Clippings', 'same.md'), '---\ntitle: 같음\n---\n\n같은 본문.\n')
      let called = false
      const runner: DraftRunner = {
        run: async function* () {
          called = true
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(called).toBe(false)
      expect(outcome).toMatchObject({ status: 'succeeded' })
    }))

  it('purpose.md가 없어도 빈 컨텍스트로 계속 간다', () =>
    withVault(async (dir) => {
      // 구 볼트 흉내 — purpose.md를 역사에서 지우고 깨끗한 상태로 둔다
      git(dir, 'rm', '-q', 'purpose.md')
      git(dir, 'commit', '-q', '-m', 'test: drop purpose')
      expect(existsSync(join(dir, 'purpose.md'))).toBe(false)
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑 본문.\n')
      const outcome = await runPipeline(dir, fakeRunner(DRAFT_OUTPUT), () => {})
      expect(outcome).toMatchObject({ status: 'succeeded' })
    }))
})

const CLIP = '---\ntitle: 갑\n---\n\n갑 본문.\n'

const pending = (dir: string): string[] =>
  readdirSync(join(dir, 'Clippings')).filter((name) => !name.startsWith('.'))

const workBranches = (dir: string): string => git(dir, 'branch', '--list', 'app/ingest-*')

/** 되감긴 보관함 — 기본 브랜치, 작업 브랜치 없음, 커밋 전 변경은 대기함뿐 */
const expectRewound = (dir: string): void => {
  expect(git(dir, 'branch', '--show-current')).toBe('main')
  expect(workBranches(dir)).toBe('')
  expect(git(dir, 'status', '--porcelain', '--', 'raw', 'wiki', 'outputs')).toBe('')
}

describe('runPipeline 되감기', () => {
  it('초안 단계에서 취소하면 자료가 대기함에 그대로 돌아온다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'it’s 갑.md'), CLIP)
      const runner: DraftRunner = { ...fakeRunner(DRAFT_OUTPUT), isCanceled: () => true }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(outcome).toEqual({
        status: 'canceled',
        reason: '위키 초안 만들기를 취소했어요 — 자료는 위키 초안 대기함에 그대로 있어요'
      })
      expectRewound(dir)
      expect(pending(dir)).toEqual(['it’s 갑.md'])
      expect(readFileSync(join(dir, 'Clippings', 'it’s 갑.md'), 'utf8')).toBe(CLIP)
    }))

  it('엔진이 취소로 끝나도 되감는다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      const runner: DraftRunner = {
        run: async function* () {
          yield { type: 'done', ok: false, canceled: true }
        },
        isCanceled: () => false
      }
      expect(await runPipeline(dir, runner, () => {})).toMatchObject({ status: 'canceled' })
      expectRewound(dir)
      expect(pending(dir)).toEqual(['a.md'])
    }))

  it('추적 중이던 대기함 파일은 중복·수정 표시 없이 돌아온다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'track clipping')
      const runner: DraftRunner = { ...fakeRunner(DRAFT_OUTPUT), isCanceled: () => true }
      expect(await runPipeline(dir, runner, () => {})).toMatchObject({ status: 'canceled' })
      expectRewound(dir)
      expect(pending(dir)).toEqual(['a.md'])
      expect(git(dir, 'status', '--porcelain')).toBe('')
    }))

  it('초안이 하나도 없어 실패하면 되감기고 곧바로 다시 위키화할 수 있다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      const outcome = await runPipeline(dir, fakeRunner('그냥 문장'), () => {})
      expect(outcome).toEqual({
        status: 'failed',
        reason: 'AI가 위키 초안을 하나도 쓰지 못했어요 (자료 1개) — 다시 만들어 주세요'
      })
      expectRewound(dir)
      expect(pending(dir)).toEqual(['a.md'])
      expect(await runPipeline(dir, fakeRunner(DRAFT_OUTPUT), () => {})).toMatchObject({
        status: 'succeeded'
      })
    }))

  it('초안이 전부 탈락하면 실행 기록을 남기지 않고 되감는다', () =>
    withVault(async (dir) => {
      // 갱신 대상이 아닌 기존 페이지 — 초안이 같은 경로를 쓰면 탈락한다
      writeFileSync(join(dir, 'wiki', 'backpressure.md'), '# zzz\n\nqqq\n')
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'seed page')
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      const outcome = await runPipeline(dir, fakeRunner(DRAFT_OUTPUT), () => {})
      expect(outcome).toEqual({
        status: 'failed',
        reason: 'AI 초안이 모두 기존 페이지와 겹쳐 새로 넣지 못했어요'
      })
      expectRewound(dir)
      expect(pending(dir)).toEqual(['a.md'])
    }))

  it('초안 엔진이 던져도 되감고 원래 예외를 올린다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      const runner: DraftRunner = {
        // eslint-disable-next-line require-yield -- 던지기만 하는 가짜 엔진
        run: async function* () {
          throw new Error('엔진이 죽었다')
        },
        isCanceled: () => false
      }
      await expect(runPipeline(dir, runner, () => {})).rejects.toThrow('엔진이 죽었다')
      expectRewound(dir)
      expect(pending(dir)).toEqual(['a.md'])
    }))

  it('위키화 도중 같은 이름의 자료가 다시 들어오면 둘 다 남긴다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      const runner: DraftRunner = {
        run: async function* () {
          writeFileSync(join(dir, 'Clippings', 'a.md'), '새로 넣은 자료\n')
          yield { type: 'done', ok: false, canceled: true }
        },
        isCanceled: () => false
      }
      expect(await runPipeline(dir, runner, () => {})).toMatchObject({ status: 'canceled' })
      expectRewound(dir)
      expect(pending(dir).sort()).toEqual(['a-1.md', 'a.md'])
      expect(readFileSync(join(dir, 'Clippings', 'a.md'), 'utf8')).toBe('새로 넣은 자료\n')
      expect(readFileSync(join(dir, 'Clippings', 'a-1.md'), 'utf8')).toBe(CLIP)
    }))

  it('되감지 못하면 작업 브랜치와 원문을 남기고 승인으로 안내한다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      const runner: DraftRunner = {
        run: async function* () {
          // 커밋 전 위키 수정 — 기본 브랜치로 딸려 가면 안 된다
          writeFileSync(join(dir, 'wiki', 'INDEX.md'), '밖에서 고침\n')
          yield { type: 'done', ok: false, canceled: true }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(outcome).toEqual({
        status: 'canceled',
        reason: '위키 초안 만들기를 취소했어요 — 승인에서 정리한 뒤 다시 만들어 주세요'
      })
      expect(git(dir, 'branch', '--show-current')).toMatch(/^app\/ingest-/)
      expect(readFileSync(join(dir, 'raw', 'a.md'), 'utf8')).toBe(CLIP)
    }))

  it('기본 브랜치로 옮기지 못하면 작업 브랜치도 원문도 지우지 않는다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      git(dir, 'add', '-A')
      git(dir, 'commit', '-q', '-m', 'track clipping')
      const runner: DraftRunner = {
        run: async function* () {
          // 기본 브랜치가 추적하는 이름으로 커밋 전 파일이 다시 들어왔다 — checkout 이 덮어쓰기를 거절한다
          writeFileSync(join(dir, 'Clippings', 'a.md'), '새로 넣은 자료\n')
          yield { type: 'done', ok: false, canceled: true }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(outcome).toEqual({
        status: 'canceled',
        reason: '위키 초안 만들기를 취소했어요 — 승인에서 정리한 뒤 다시 만들어 주세요'
      })
      expect(git(dir, 'branch', '--show-current')).toMatch(/^app\/ingest-/)
      expect(readFileSync(join(dir, 'raw', 'a.md'), 'utf8')).toBe(CLIP)
      expect(readFileSync(join(dir, 'Clippings', 'a.md'), 'utf8')).toBe('새로 넣은 자료\n')
    }))

  it('작업 브랜치에 다른 커밋이 더 있으면 취소해도 지우지 않는다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      const runner: DraftRunner = {
        run: async function* () {
          // 초안이 도는 동안 앱 밖 도구가 작업 브랜치에 커밋했다
          writeFileSync(join(dir, 'raw', 'extra.md'), '밖에서 넣음\n')
          git(dir, 'add', '-A')
          git(dir, 'commit', '-q', '-m', 'outside commit')
          yield { type: 'done', ok: false, canceled: true }
        },
        isCanceled: () => false
      }
      expect(await runPipeline(dir, runner, () => {})).toMatchObject({ status: 'canceled' })
      expect(git(dir, 'branch', '--show-current')).toMatch(/^app\/ingest-/)
      expect(git(dir, 'log', '--format=%s', '-1')).toBe('outside commit')
    }))

  it('던진 뒤 되감지도 못하면 원래 사유에 승인 안내를 붙여 올린다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      const runner: DraftRunner = {
        // eslint-disable-next-line require-yield -- 던지기만 하는 가짜 엔진
        run: async function* () {
          writeFileSync(join(dir, 'wiki', 'INDEX.md'), '밖에서 고침\n')
          throw new Error('엔진이 죽었다')
        },
        isCanceled: () => false
      }
      await expect(runPipeline(dir, runner, () => {})).rejects.toThrow(
        '엔진이 죽었다 — 승인에서 정리한 뒤 다시 만들어 주세요'
      )
      expect(git(dir, 'branch', '--show-current')).toMatch(/^app\/ingest-/)
    }))

  it('페이지가 커밋된 뒤의 실패는 작업 브랜치를 남긴다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), CLIP)
      const runner: DraftRunner = {
        run: async function* () {
          // 위키화하는 동안 기본 브랜치가 움직였다 — 결과 검사가 실패한다
          git(dir, 'branch', '-f', 'main', 'HEAD')
          yield { type: 'text', text: DRAFT_OUTPUT }
          yield { type: 'done', ok: true, canceled: false }
        },
        isCanceled: () => false
      }
      const outcome = await runPipeline(dir, runner, () => {})
      expect(outcome).toMatchObject({ status: 'failed' })
      expect(git(dir, 'branch', '--show-current')).toMatch(/^app\/ingest-/)
      expect(git(dir, 'log', '--format=%s')).toContain('feat: ingest 1 clippings into wiki')
    }))
})

describe('chunkForBatch', () => {
  const item = (
    bodyLen: number,
    name: string
  ): { clipping: PreparedClipping; ctx: { updateTargets: []; bodies: []; updatable: [] } } => ({
    clipping: {
      clippingName: name,
      rawName: name,
      title: name,
      body: 'x'.repeat(bodyLen)
    } as PreparedClipping,
    ctx: { updateTargets: [], bodies: [], updatable: [] }
  })

  it('개수 상한으로 나눈다', () => {
    const chunks = chunkForBatch([
      item(10, 'a.md'),
      item(10, 'b.md'),
      item(10, 'c.md'),
      item(10, 'd.md')
    ])
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(BATCH_MAX_SOURCES)
    expect(chunks[1]).toHaveLength(1)
  })

  it('큰 클리핑은 단독 청크가 된다', () => {
    const chunks = chunkForBatch([
      item(10, 'a.md'),
      item(BATCH_MAX_CHARS, 'big.md'),
      item(10, 'c.md')
    ])
    expect(chunks).toHaveLength(3)
    expect(chunks[1]).toHaveLength(1)
  })
})

describe('runPipeline 묶음 목록 읽기', () => {
  it(
    '묶음 수집은 목록을 한 번만 읽는다',
    () =>
      withVault(async (dir) => {
        mkdirSync(join(dir, 'wiki'), { recursive: true })
        for (let i = 0; i < 30; i++)
          writeFileSync(
            join(dir, 'wiki', `doc-${i}.md`),
            `---\ntitle: 문서${i}\n---\n\n본문 ${i}.\n`
          )
        for (let i = 0; i < 5; i++)
          writeFileSync(
            join(dir, 'Clippings', `c${i}.md`),
            `---\ntitle: 클리핑${i}\n---\n\n클리핑 본문.\n`
          )
        const { WikiService } = await import('../wiki/wiki-service')
        const spy = vi.fn(WikiService.listDocs)
        vi.spyOn(WikiService, 'listDocs').mockImplementation(spy)
        try {
          const outcome = await runPipeline(dir, fakeRunner(DRAFT_OUTPUT), () => {})
          expect(outcome).toMatchObject({ status: 'succeeded' })
          // 묶음 5건이 목록을 나눠 쓰면 전체 8회를 넘지 않는다 (미공유 시 11회)
          expect(spy.mock.calls.length).toBeLessThanOrEqual(8)
        } finally {
          vi.restoreAllMocks()
        }
      }),
    120_000
  )

  it('파서 재시도 소진은 empty가 아니라 failed로 기록한다', () =>
    withVault(async (dir) => {
      writeFileSync(join(dir, 'Clippings', 'a.md'), '---\ntitle: 갑\n---\n\n갑 본문.\n')
      const marks: Array<[string, string]> = []
      await runPipeline(dir, fakeRunner('펜스 없는 그냥 글자다'), () => {}, {
        mark: (name, status) => marks.push([name, status])
      })
      expect(marks).toContainEqual(['a.md', 'processing'])
      expect(marks).toContainEqual(['a.md', 'failed'])
      expect(marks).not.toContainEqual(['a.md', 'empty'])
    }))
})
