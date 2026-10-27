import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { EngineEvent } from '../../shared/ipc-contract'
import type { Engine, IngestJob } from '../engine/engine'
import { type ChatEngineUse, type ChatService, createChatService } from './chat-service'
import type { NoteRuns, PrepareResult } from '../note/note-run'
import type { ChangeSet } from '../../shared/ipc-contract'
import { createChatStore } from './chat-store'
import { createChatSessions } from './session/chat-sessions'
import { openClaudeSession } from './session/claude-session'
import { openCodexSession } from './session/codex-session'
import type { ChatEvent } from '../../shared/ipc-contract'

// 호출 기록을 남기는 fake 엔진 — events 를 그대로 재생한다
const fakeEngine = (events: EngineEvent[], jobs: IngestJob[] = []): Engine => ({
  async *run(job) {
    jobs.push(job)
    yield* events
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- fake 엔진, 취소 없음
  cancel(): void {}
})

const withStore = (
  events: EngineEvent[],
  jobs: IngestJob[] = []
): { store: ReturnType<typeof createChatStore>; service: ChatService } => {
  const store = createChatStore(mkdtempSync(join(tmpdir(), 'chat-svc-')))
  const service = createChatService(() => fakeEngine(events, jobs), store)
  return { store, service }
}

const withService = (
  events: EngineEvent[],
  jobs: IngestJob[] = []
): {
  service: ChatService
  seen: { conversationId: string; event: ChatEvent }[]
  jobs: IngestJob[]
} => {
  const service = createChatService(() => fakeEngine(events, jobs))
  const seen: { conversationId: string; event: ChatEvent }[] = []
  service.onEvent((conversationId, event) => seen.push({ conversationId, event }))
  return { service, seen, jobs }
}

const askFirst = async (
  service: ReturnType<typeof createChatService>,
  question = '첫 질문'
): Promise<string> => {
  const result = service.ask({ vaultDir: '/vault', question })
  if ('error' in result) throw new Error(result.error)
  await result.finished
  return result.conversationId
}

describe('ChatService — test: chat-service.ts', () => {
  const replyEvents: EngineEvent[] = [
    { type: 'session', id: 'sess-1' },
    { type: 'text', text: '답' },
    { type: 'tool', name: 'Read', target: '/vault/wiki/apple.md' },
    { type: 'tool', name: 'Read', target: '/vault/projects/cloud-voucher/README.md' },
    { type: 'tool', name: 'Read', target: '/vault/.obsidian/workspace.md' },
    { type: 'tool', name: 'Read', target: '/outside/note.md' },
    { type: 'tool', name: 'Bash', target: 'ls' },
    { type: 'done', ok: true, canceled: false }
  ]

  it('질문 → 답 스트리밍 이벤트를 내고 참조 칩은 보관함 문서 Read 대상을 담는다', async () => {
    const { service, seen } = withService(replyEvents)
    const id = await askFirst(service)
    expect(seen.filter((s) => s.event.type === 'text')).toContainEqual({
      conversationId: id,
      event: { type: 'text', text: '답' }
    })
    const refs = seen.find((s) => s.event.type === 'refs')
    expect(refs).toEqual({
      conversationId: id,
      event: { type: 'refs', rels: ['wiki/apple.md', 'projects/cloud-voucher/README.md'] }
    })
    const conversation = service.conversation(id)
    expect(conversation?.messages).toEqual([
      { role: 'user', text: '첫 질문', refs: [] },
      { role: 'assistant', text: '답', refs: ['wiki/apple.md', 'projects/cloud-voucher/README.md'] }
    ])
    expect(conversation?.running).toBe(false)
    expect(conversation?.title).toBe('첫 질문')
  })

  // EngineEvent 와 ChatEvent 는 다른 union 이다 — 한쪽에만 넣으면 사용량이 조용히 사라진다
  it('엔진이 알려 온 모델·사용률을 그대로 화면으로 넘긴다', async () => {
    const { service, seen } = withService([
      { type: 'session', id: 'sess-1' },
      { type: 'usage', usage: { model: 'claude-opus-5[1m]', contextPercent: null } },
      { type: 'text', text: '답' },
      { type: 'usage', usage: { model: 'claude-opus-5[1m]', contextPercent: 31 } },
      { type: 'done', ok: true, canceled: false }
    ])
    await askFirst(service)

    expect(seen.filter((s) => s.event.type === 'usage').map((s) => s.event)).toEqual([
      { type: 'usage', usage: { model: 'claude-opus-5[1m]', contextPercent: null } },
      { type: 'usage', usage: { model: 'claude-opus-5[1m]', contextPercent: 31 } }
    ])
  })

  describe('대화 압축', () => {
    it('이어가던 세션에 /compact 를 한 번 보내고 대화에는 아무 말도 안 남긴다', async () => {
      const jobs: IngestJob[] = []
      const { service } = withService(replyEvents, jobs)
      const id = await askFirst(service)
      const result = service.compact('/vault', id)
      if ('error' in result) throw new Error(result.error)
      await result.finished

      expect(jobs.at(-1)).toMatchObject({ prompt: '/compact', resume: 'sess-1' })
      expect(service.conversation(id)?.messages).toHaveLength(2)
    })

    it('경계 줄이 오면 compacted 로 알린다', () => {
      // 같은 fake 엔진이 두 실행에 같은 줄을 낸다 — 질문 때 온 compacted 는 무시되고
      // 압축 실행에서만 뜻을 갖는다
      return (async () => {
        const { service, seen } = withService([...replyEvents, { type: 'compacted' }])
        const id = await askFirst(service)
        seen.length = 0

        const result = service.compact('/vault', id)
        if ('error' in result) throw new Error(result.error)
        await result.finished

        expect(seen.some((s) => s.event.type === 'compacted')).toBe(true)
        expect(seen.at(-1)?.event).toEqual({ type: 'done', ok: true, canceled: false })
      })()
    })

    // 경계 줄 없이 끝난 실행을 줄었다고 말하면, 사람은 줄지 않은 대화를 계속 끌고 간다
    it('경계 줄이 없으면 줄었다고 말하지 않는다', async () => {
      const { service, seen } = withService(replyEvents)
      const id = await askFirst(service)
      seen.length = 0

      const result = service.compact('/vault', id)
      if ('error' in result) throw new Error(result.error)
      await result.finished

      expect(seen.some((s) => s.event.type === 'compacted')).toBe(false)
      expect(seen.some((s) => s.event.type === 'notice')).toBe(true)
      expect(seen.at(-1)?.event).toEqual({ type: 'done', ok: false, canceled: false })
    })

    // 답이 오는 중에 압축을 걸면 같은 세션에 엔진 실행 둘이 붙는다
    it('진행 중인 대화에는 걸 수 없다', async () => {
      const { service } = withService([
        { type: 'session', id: 'sess-1' },
        { type: 'text', text: '답' },
        { type: 'done', ok: true, canceled: false }
      ])
      const id = await askFirst(service)
      const again = service.ask({ vaultDir: '/vault', question: '두 번째', conversationId: id })
      if ('error' in again) throw new Error(again.error)

      expect(service.compact('/vault', id)).toEqual({ error: '이미 진행 중인 질문이 있어요' })
      await again.finished
    })

    // 앱을 다시 열면 대화는 디스크에만 있다 — 복원하지 않으면 세션이 있는데도 "없는 대화다" 다
    it('메모리에 없는 대화는 저장소에서 되살려 그 세션을 잇는다', async () => {
      const jobs: IngestJob[] = []
      const { store, service } = withStore(replyEvents, jobs)
      const id = await askFirst(service)

      // 앱 재시작 — 같은 저장소로 새 서비스를 세운다
      const restarted = createChatService(() => fakeEngine(replyEvents, jobs), store)
      const result = restarted.compact('/vault', id)
      if ('error' in result) throw new Error(result.error)
      await result.finished

      expect(jobs.at(-1)).toMatchObject({ prompt: '/compact', resume: 'sess-1' })
    })

    it('이어갈 세션이 없으면 거절한다', async () => {
      const { service } = withService([
        { type: 'text', text: '답' },
        { type: 'done', ok: true, canceled: false }
      ])
      const id = await askFirst(service)

      expect(service.compact('/vault', id)).toEqual({ error: '아직 이어갈 대화가 없어요' })
      expect(service.compact('/vault', '없는-id')).toEqual({ error: '없는 대화예요' })
    })
  })

  it('붙인 그림은 엔진으로 가고, 대화에는 그림 수만 남는다', async () => {
    const { service, jobs } = withService(replyEvents)
    const image = { mediaType: 'image/png' as const, data: 'iVBORw0KGgo=' }
    const started = service.ask({ vaultDir: '/vault', question: '이게 뭐야', images: [image] })
    if ('error' in started) throw new Error(started.error)
    await started.finished
    expect(jobs[0]?.images).toEqual([image])
    expect(service.conversation(started.conversationId)?.messages[0]).toEqual({
      role: 'user',
      text: '이게 뭐야',
      refs: [],
      images: 1
    })
  })

  it('후속 질문은 앞 턴 session id 를 resume 으로 넘긴다', async () => {
    const { service, jobs } = withService(replyEvents)
    const id = await askFirst(service)
    service.ask({ vaultDir: '/vault', question: '후속', conversationId: id })
    expect(jobs[0].resume).toBeUndefined()
    expect(jobs[1].resume).toBe('sess-1')
  })

  it('대화 제목은 첫 질문 앞 40자고 없는 대화 id 는 에러다', async () => {
    const { service } = withService(replyEvents)
    expect(service.ask({ vaultDir: '/vault', question: 'x', conversationId: 'nope' })).toEqual({
      error: '없는 대화예요'
    })
    const id = await askFirst(service, '가'.repeat(50))
    expect(service.conversation(id)?.title).toBe('가'.repeat(40))
  })

  it('진행 중인 대화에 다시 ask 하면 거절한다', async () => {
    const service = createChatService(() => ({
      async *run() {
        yield { type: 'session', id: 's' }
        await new Promise((r) => setTimeout(r, 50))
        yield { type: 'done', ok: true, canceled: false }
      },
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- fake 엔진, 취소 없음
      cancel(): void {}
    }))
    const result = service.ask({ vaultDir: '/vault', question: 'q1' })
    if ('error' in result) throw new Error(result.error)
    const again = service.ask({
      vaultDir: '/vault',
      question: 'q2',
      conversationId: result.conversationId
    })
    expect(again).toEqual({ error: '이미 진행 중인 질문이 있어요' })
    await result.finished
  })

  const cancelableFake = (): {
    engine: { run: () => AsyncGenerator<EngineEvent>; cancel: () => void }
    count: () => number
  } => {
    let cancelCount = 0
    let release: () => void
    const canceled = new Promise<void>((r) => {
      release = r
    })
    const engine = {
      async *run(): AsyncGenerator<EngineEvent> {
        await canceled
        yield { type: 'done' as const, ok: false, canceled: true }
      },
      cancel(): void {
        cancelCount++
        release()
      }
    }
    return { engine, count: (): number => cancelCount }
  }

  it('stop 은 취소 done 으로 끝낸다', async () => {
    const { engine, count } = cancelableFake()
    const service = createChatService(() => engine)
    const result = service.ask({ vaultDir: '/vault', question: 'q' })
    if ('error' in result) throw new Error(result.error)
    service.stop(result.conversationId)
    expect(count()).toBe(1)
    await result.finished
    const conversation = service.conversation(result.conversationId)
    expect(conversation?.running).toBe(false)
    expect(conversation?.messages.at(-1)?.text).toBe('(멈춤)')
  })

  it('cancelAll 로 모든 실행을 끝낸다 — 볼트 전환·앱 종료', async () => {
    const { engine, count } = cancelableFake()
    const service = createChatService(() => engine)
    const result = service.ask({ vaultDir: '/vault', question: 'q' })
    if ('error' in result) throw new Error(result.error)
    service.cancelAll()
    expect(count()).toBe(1)
    await result.finished
  })

  it('forgetAll 은 묶인 대화를 잊는다 — 볼트 전환', () => {
    const { engine } = cancelableFake()
    const service = createChatService(() => engine)
    const result = service.ask({ vaultDir: '/vault', question: 'q' })
    if ('error' in result) throw new Error(result.error)
    expect(service.conversation(result.conversationId)).not.toBeNull()
    service.cancelAll()
    service.forgetAll()
    expect(service.conversation(result.conversationId)).toBeNull()
  })
})

describe('ChatService 영속화 — test: chat-store.ts 연동 (슬라이스 11)', () => {
  const replyEvents: EngineEvent[] = [
    { type: 'session', id: 'sess-1' },
    { type: 'text', text: '답' },
    { type: 'done', ok: true, canceled: false }
  ]

  it('ask 가 끝나면 대화 제목·메시지·session id 가 저장된다', async () => {
    const { store, service } = withStore(replyEvents)
    const id = await askFirst(service)
    const summary = store.list('/vault')
    expect(summary.map((c) => c.title)).toEqual(['첫 질문'])
    const loaded = store.load('/vault', id)
    expect(loaded?.messages).toEqual([
      { role: 'user', text: '첫 질문', refs: [] },
      { role: 'assistant', text: '답', refs: [] }
    ])
    expect(loaded?.sessionId).toBe('sess-1')
  })

  it('메모리에 없는 대화 id 는 저장소에서 복원해 resume 으로 잇는다', async () => {
    const { store, service } = withStore(replyEvents)
    const id = await askFirst(service)
    const revived = createChatService(() => fakeEngine(replyEvents, []), store)
    const result = revived.ask({ vaultDir: '/vault', question: '후속', conversationId: id })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    // 복원된 서비스는 저장소의 기록 위에 이어 쌓는다
    expect(revived.conversation(id)?.messages).toHaveLength(4)
    expect(revived.conversation(id)?.messages[0].text).toBe('첫 질문')
    expect(revived.conversation(id)?.sessionId).toBe('sess-1')
  })

  it('저장소에도 없는 대화 id 는 에러다', () => {
    const { service } = withStore(replyEvents)
    expect(service.ask({ vaultDir: '/vault', question: 'x', conversationId: 'ghost' })).toEqual({
      error: '없는 대화예요'
    })
  })

  it('세션이 사라졌으면 새 세션으로 다시 묻고, 답이 아니라 알림으로 말한다', async () => {
    const store = createChatStore(mkdtempSync(join(tmpdir(), 'chat-svc-')))
    const seen: (string | undefined)[] = []
    const notices: string[] = []
    const service = createChatService(
      () => ({
        async *run(job) {
          const first = seen.length === 0
          seen.push(job.resume)
          if (first) {
            yield { type: 'error', message: '세션을 찾을 수 없다' }
            yield { type: 'done', ok: false, canceled: false }
          } else {
            yield { type: 'text', text: '새 답' }
            yield { type: 'done', ok: true, canceled: false }
          }
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- fake 엔진, 취소 없음
        cancel(): void {}
      }),
      store
    )
    // 세션 있는 대화 복원
    const conv = store.create('/vault', '제목')
    store.append('/vault', conv.id, { role: 'user', text: '옛 질문', refs: [] })
    store.saveSession('/vault', conv.id, 'sess-old')
    service.onEvent((_id, event) => {
      if (event.type === 'notice') notices.push(event.text)
    })
    const result = service.ask({ vaultDir: '/vault', question: '후속', conversationId: conv.id })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    expect(seen).toEqual(['sess-old', undefined])
    // 알림은 답과 섞이지 않는다 — 답에 섞으면 다시 열 때 답 안에 남는다
    expect(notices.join(' ')).toContain('기억하지 못해요')
    const messages = service.conversation(conv.id)?.messages ?? []
    expect(messages.at(-1)?.text).toBe('새 답')
    expect(store.load('/vault', conv.id)?.sessionId).toBeNull()
  })

  it('한도에 걸린 재개는 다시 보내지 않고 그대로 알린다', async () => {
    const store = createChatStore(mkdtempSync(join(tmpdir(), 'chat-svc-limit-')))
    const seen: (string | undefined)[] = []
    const errors: string[] = []
    const service = createChatService(
      () => ({
        async *run(job) {
          seen.push(job.resume)
          yield { type: 'error', message: 'Claude AI usage limit reached|1758067200' }
          yield { type: 'done', ok: false, canceled: false }
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- fake 엔진, 취소 없음
        cancel(): void {}
      }),
      store
    )
    const conv = store.create('/vault', '제목')
    store.saveSession('/vault', conv.id, 'sess-old')
    service.onEvent((_id, event) => {
      if (event.type === 'error') errors.push(event.message)
    })
    const result = service.ask({ vaultDir: '/vault', question: '후속', conversationId: conv.id })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    // 한 번만 보낸다 — 예전에는 세션 만료로 오해해 같은 한도에 두 번 부딪쳤다
    expect(seen).toEqual(['sess-old'])
    expect(errors.join(' ')).toContain('usage limit')
  })
})

describe('ChatService thinking — 슬라이스 13', () => {
  it('생각 블록을 이벤트로 흘리고 답과 함께 저장해 다시 열어도 남는다', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'chat-thinking-'))
    const store = createChatStore(userData)
    const events: EngineEvent[] = [
      { type: 'session', id: 'sess-t' },
      { type: 'thinking', text: '먼저 ' },
      { type: 'thinking', text: '페이지를 떠올린다' },
      { type: 'text', text: '답' },
      { type: 'done', ok: true, canceled: false }
    ]
    const service = createChatService(() => fakeEngine(events), store)
    const seen: ChatEvent[] = []
    service.onEvent((_id, event) => seen.push(event))
    const id = await askFirst(service)

    expect(seen.filter((e) => e.type === 'thinking')).toEqual([
      { type: 'thinking', text: '먼저 ' },
      { type: 'thinking', text: '페이지를 떠올린다' }
    ])
    expect(service.conversation(id)?.messages.at(-1)).toEqual({
      role: 'assistant',
      text: '답',
      refs: [],
      thinking: '먼저 페이지를 떠올린다'
    })
    const reloaded = createChatStore(userData).load('/vault', id)
    expect(reloaded?.messages.at(-1)?.thinking).toBe('먼저 페이지를 떠올린다')
  })

  describe('GitHub 주소 읽기', () => {
    const answered: EngineEvent[] = [
      { type: 'session', id: 'sess-g' },
      { type: 'text', text: '답' },
      { type: 'done', ok: true, canceled: false }
    ]
    const PR_URL = 'https://github.com/team/vault/pull/693'
    const pr = { url: PR_URL, text: '제목: 카메라 롤 내려받기', truncated: false }

    it('질문 속 주소에서 읽어 온 것을 엔진 프롬프트에 싣는다 — 근거 칩에는 넣지 않는다', async () => {
      const jobs: IngestJob[] = []
      const asked: string[] = []
      const service = createChatService(() => fakeEngine(answered, jobs), undefined, {
        links: async (question) => {
          asked.push(question)
          return { docs: [pr], notices: [] }
        }
      })
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      const id = await askFirst(service, `${PR_URL} 이거할까함`)

      expect(asked).toEqual([`${PR_URL} 이거할까함`])
      expect(jobs[0]?.prompt).toContain('<linked-docs>')
      expect(jobs[0]?.prompt).toContain('제목: 카메라 롤 내려받기')
      expect(seen.flatMap((event) => (event.type === 'refs' ? event.rels : []))).toEqual([])
      expect(service.conversation(id)?.messages.at(-1)?.refs).toEqual([])
    })

    it('다시 답하기도 같은 질문으로 주소를 다시 읽는다', async () => {
      const jobs: IngestJob[] = []
      const asked: string[] = []
      const store = createChatStore(mkdtempSync(join(tmpdir(), 'chat-svc-')))
      const service = createChatService(() => fakeEngine(answered, jobs), store, {
        links: async (question) => {
          asked.push(question)
          return { docs: [pr], notices: [] }
        }
      })
      const id = await askFirst(service, `${PR_URL} 이거할까함`)
      const result = service.regenerate({ vaultDir: '/vault', conversationId: id })
      if ('error' in result) throw new Error(result.error)
      await result.finished

      expect(asked).toEqual([`${PR_URL} 이거할까함`, `${PR_URL} 이거할까함`])
      expect(jobs[1]?.prompt).toContain('제목: 카메라 롤 내려받기')
    })

    it('못 읽은 이유를 알리고 답은 그대로 낸다', async () => {
      const jobs: IngestJob[] = []
      const service = createChatService(() => fakeEngine(answered, jobs), undefined, {
        links: async () => ({ docs: [], notices: ['GitHub 로그인이 필요해요'] })
      })
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      const id = await askFirst(service, `${PR_URL} 이거할까함`)

      expect(seen).toContainEqual({ type: 'notice', text: 'GitHub 로그인이 필요해요' })
      expect(service.conversation(id)?.messages.at(-1)?.text).toBe('답')
    })

    it('알림이 여럿이면 한 번에 낸다 — 뒤 알림이 GitHub 알림을 덮지 않는다', async () => {
      const service = createChatService(() => fakeEngine(answered), undefined, {
        links: async () => ({ docs: [], notices: ['GitHub 로그인이 필요해요', '3개까지 읽어요'] })
      })
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      const result = service.ask({ vaultDir: '/vault', question: PR_URL })
      if ('error' in result) throw new Error(result.error)
      await result.finished

      const notices = seen.filter((event) => event.type === 'notice')
      expect(notices).toHaveLength(1)
      expect(notices[0]).toHaveProperty('text', 'GitHub 로그인이 필요해요 · 3개까지 읽어요')
    })

    it('읽기가 죽어도 답은 나오고, 못 읽었다고 알린다', async () => {
      const jobs: IngestJob[] = []
      const service = createChatService(() => fakeEngine(answered, jobs), undefined, {
        links: async () => {
          throw new Error('boom')
        }
      })
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      const id = await askFirst(service, `${PR_URL} 이거할까함`)

      expect(jobs[0]?.prompt).not.toContain('<linked-docs>')
      expect(service.conversation(id)?.messages.at(-1)?.text).toBe('답')
      expect(seen.find((event) => event.type === 'notice')).toHaveProperty(
        'text',
        expect.stringContaining('주소를 읽지 못해')
      )
    })
  })

  describe('질문 그대로 보내기', () => {
    const answered: EngineEvent[] = [
      { type: 'session', id: 'sess-r' },
      { type: 'text', text: '답' },
      { type: 'done', ok: true, canceled: false }
    ]
    const noteRun = (): NoteRuns => ({
      prepare: async () => ({
        run: {
          id: 'run-1',
          ignoredOnly: false,
          saw: () => undefined,
          used: () => undefined,
          finish: async () => null
        }
      }),
      undo: async () => ({ ok: false, reason: 'x' }),
      recover: async () => [],
      has: () => false,
      review: async () => ({ unavailable: 'x' }),
      rejectHunk: async () => ({ ok: false, reason: 'x' })
    })

    // 사람 확인(2026-10-23): 데스크탑 Claude 는 "hello?" 에 인사만 하는데, 앱은 질문 앞 지시문과 검색 문서 때문에
    // 볼트 문서를 요약했다 — 노트를 쓸 수 있는 기본 턴은 질문 그대로, 앱 규칙은 시스템 프롬프트로 간다
    it('기본 턴은 질문을 그대로 보내고 앱 규칙은 시스템 프롬프트로 싣는다', async () => {
      const jobs: IngestJob[] = []
      const service = createChatService(() => fakeEngine(answered, jobs), undefined, {
        notes: noteRun()
      })
      await askFirst(service, 'hello?')
      expect(jobs[0]?.prompt).toBe('hello?')
      expect(jobs[0]?.system).toContain('private/, outputs/, projects/<이름>/outputs/')
      expect(jobs[0]?.system).not.toContain('<vault-docs>')
    })

    it('이어 묻는 턴도 질문 그대로이고 같은 시스템 프롬프트를 싣는다', async () => {
      const jobs: IngestJob[] = []
      const service = createChatService(() => fakeEngine(answered, jobs), undefined, {
        notes: noteRun()
      })
      const id = await askFirst(service, 'hello?')
      const again = service.ask({ vaultDir: '/vault', question: '왜?', conversationId: id })
      if ('error' in again) throw new Error(again.error)
      await again.finished
      expect(jobs[1]?.resume).toBe('sess-r')
      expect(jobs[1]?.prompt).toBe('왜?')
      expect(jobs[1]?.system).toBe(jobs[0]?.system)
    })

    it('붙인 문서 본문을 싣고 칩은 답이 인용한 것만 붙인 순서대로', async () => {
      const jobs: IngestJob[] = []
      const citing: EngineEvent[] = [
        { type: 'session', id: 'sess-a' },
        { type: 'text', text: '`wiki/c.md` 와 `wiki/b.md` 를 보았다.' },
        { type: 'done', ok: true, canceled: false }
      ]
      const service = createChatService(() => fakeEngine(citing, jobs))
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      const result = service.ask({
        vaultDir: '/vault',
        question: '이 문서 요약',
        attached: [
          { rel: 'wiki/b.md', text: '비 본문', truncated: false },
          { rel: 'wiki/c.md', text: '씨 본문', truncated: true },
          { rel: 'wiki/d.md', text: '디 본문', truncated: false }
        ]
      })
      if ('error' in result) throw new Error(result.error)
      await result.finished

      expect(jobs[0]?.prompt).toContain('비 본문')
      expect(jobs[0]?.prompt).toContain('씨 본문')
      expect(seen).toContainEqual({ type: 'refs', rels: ['wiki/b.md', 'wiki/c.md'] })
    })

    it('답이 인용하지 않은 붙인 문서는 칩이 아니다 — 답 전에도 칩을 내지 않는다', async () => {
      const service = createChatService(() => fakeEngine(answered))
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      const result = service.ask({
        vaultDir: '/vault',
        question: '요약',
        attached: [{ rel: 'wiki/apple.md', text: '사과 본문', truncated: false }]
      })
      if ('error' in result) throw new Error(result.error)
      await result.finished
      expect(seen.flatMap((event) => (event.type === 'refs' ? event.rels : []))).toEqual([])
      expect(service.conversation(result.conversationId)?.messages.at(-1)?.refs).toEqual([])
    })

    it('붙인 문서를 엔진이 또 Read 해도 참조 칩은 한 번만 담는다', async () => {
      const events: EngineEvent[] = [
        { type: 'session', id: 'sess-d' },
        { type: 'tool', name: 'Read', target: '/vault/wiki/apple.md' },
        { type: 'text', text: '답' },
        { type: 'done', ok: true, canceled: false }
      ]
      const service = createChatService(() => fakeEngine(events))
      const result = service.ask({
        vaultDir: '/vault',
        question: '사과가 뭐야',
        attached: [{ rel: 'wiki/apple.md', text: '사과 본문', truncated: false }]
      })
      if ('error' in result) throw new Error(result.error)
      await result.finished
      expect(service.conversation(result.conversationId)?.messages.at(-1)?.refs).toEqual([
        'wiki/apple.md'
      ])
    })

    it('답이 실패하면 붙인 문서만 남은 빈 풍선을 남기지 않는다', async () => {
      const failed: EngineEvent[] = [
        { type: 'session', id: 'sess-f' },
        { type: 'error', message: '한도에 걸렸다' },
        { type: 'done', ok: false, canceled: false }
      ]
      const service = createChatService(() => fakeEngine(failed))
      const result = service.ask({
        vaultDir: '/vault',
        question: '사과가 뭐야',
        attached: [{ rel: 'wiki/apple.md', text: '사과 본문', truncated: false }]
      })
      if ('error' in result) throw new Error(result.error)
      await result.finished
      expect(service.conversation(result.conversationId)?.messages.map((m) => m.role)).toEqual([
        'user'
      ])
    })
  })

  describe('노트 쓰기', () => {
    const CHANGES: ChangeSet = {
      id: '11111111-1111-1111-1111-111111111111',
      files: [{ rel: 'private/2026-09-17.md', kind: 'created', tracked: false, afterHash: 'h' }],
      blocked: []
    }

    const fakeNotes = (
      prepared: PrepareResult | 'run',
      log: string[] = []
    ): NoteRuns & { saw: string[] } => {
      const saw: string[] = []
      return {
        saw,
        prepare: async () => {
          log.push('prepare')
          if (prepared !== 'run') return prepared
          return {
            run: {
              id: CHANGES.id,
              ignoredOnly: false,
              saw: (path) => void saw.push(path),
              used: (tool) => void saw.push(`tool:${tool}`),
              finish: async () => {
                log.push('finish')
                return CHANGES
              }
            }
          }
        },
        undo: async () => ({ ok: false, reason: 'x' }),
        recover: async () => [],
        has: () => true,
        review: async () => ({ unavailable: 'x' }),
        rejectHunk: async () => ({ ok: false, reason: 'x' })
      }
    }

    it('노트 엔진으로 돌고, 쓰려던 경로를 넘기고, 변경 카드를 답 끝보다 먼저 보내 저장한다', async () => {
      const uses: ChatEngineUse[] = []
      const jobs: IngestJob[] = []
      const notes = fakeNotes('run')
      const store = createChatStore(mkdtempSync(join(tmpdir(), 'chat-note-')))
      const service = createChatService(
        (use) => {
          uses.push(use)
          return fakeEngine(
            [
              { type: 'text', text: '오늘 노트를 만들었다' },
              { type: 'file-change', path: '/vault/private/2026-09-17.md' },
              { type: 'done', ok: true, canceled: false }
            ],
            jobs
          )
        },
        store,
        { notes }
      )
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      const result = service.ask({
        vaultDir: '/vault',
        question: '오늘 노트 만들어 줘'
      })
      if ('error' in result) throw new Error(result.error)
      await result.finished

      expect(uses).toEqual(['note'])
      expect(notes.saw).toEqual(['/vault/private/2026-09-17.md'])
      expect(jobs[0]?.system).toContain('private/<오늘 날짜 YYYY-MM-DD>.md')
      const types = seen.map((e) => e.type)
      expect(types.indexOf('changes')).toBeLessThan(types.indexOf('done'))
      expect(seen).toContainEqual({ type: 'changes', changes: CHANGES })
      const saved = store.load('/vault', result.conversationId)
      expect(saved?.messages.at(-1)?.changes).toEqual(CHANGES)
    })

    it('노트를 못 쓰면 읽기 전용 엔진으로 답하고 이유를 한 줄 알린다', async () => {
      const uses: ChatEngineUse[] = []
      const jobs: IngestJob[] = []
      const service = createChatService(
        (use) => {
          uses.push(use)
          return fakeEngine([{ type: 'done', ok: true, canceled: false }], jobs)
        },
        undefined,
        { notes: fakeNotes({ readonly: '위키화가 끝나면 노트를 쓸 수 있다' }) }
      )
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      await askFirst(service)
      expect(uses).toEqual(['chat'])
      expect(jobs[0]?.prompt).toContain('파일을 쓰거나 고치지 마라')
      expect(seen).toContainEqual({ type: 'notice', text: '위키화가 끝나면 노트를 쓸 수 있다' })
    })

    it('엔진이 실패해도 판정을 돌려 반쯤 쓴 파일의 카드가 남는다', async () => {
      const log: string[] = []
      const service = createChatService(
        () =>
          fakeEngine([
            { type: 'error', message: '사용 한도에 닿았다' },
            { type: 'done', ok: false, canceled: false }
          ]),
        undefined,
        { notes: fakeNotes('run', log) }
      )
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      const id = await askFirst(service)
      expect(log).toEqual(['prepare', 'finish'])
      expect(seen.map((e) => e.type)).toEqual(['error', 'changes', 'refs', 'done'])
      expect(service.conversation(id)?.messages.at(-1)?.changes).toEqual(CHANGES)
    })

    it('엔진을 만들지 못해도 판정을 돌리고 실패로 끝낸다', async () => {
      const log: string[] = []
      const service = createChatService(
        () => {
          throw new Error('엔진 CLI 가 아직 확인되지 않았다')
        },
        undefined,
        { notes: fakeNotes('run', log) }
      )
      const seen: ChatEvent[] = []
      service.onEvent((_id, event) => seen.push(event))
      const id = await askFirst(service)
      expect(log).toEqual(['prepare', 'finish'])
      expect(seen.at(-1)).toEqual({ type: 'done', ok: false, canceled: false })
      expect(seen.find((e) => e.type === 'error')).toBeDefined()
      expect(service.conversation(id)?.running).toBe(false)
    })

    it('노트 준비 중에 누른 멈춤도 엔진에 닿는다', async () => {
      let canceled = false
      let release: () => void = () => undefined
      const gate = new Promise<void>((done) => (release = done))
      const notes = fakeNotes('run')
      const slowNotes: NoteRuns = {
        ...notes,
        prepare: async (vaultDir, conversationId) => {
          await gate
          return notes.prepare(vaultDir, conversationId)
        }
      }
      const service = createChatService(
        () => ({
          async *run() {
            yield { type: 'done', ok: false, canceled } as EngineEvent
          },
          cancel(): void {
            canceled = true
          }
        }),
        undefined,
        { notes: slowNotes }
      )
      const result = service.ask({ vaultDir: '/vault', question: 'q' })
      if ('error' in result) throw new Error(result.error)
      service.stop(result.conversationId)
      release()
      await result.finished
      expect(canceled).toBe(true)
    })

    it('되돌리기 결과는 같은 카드를 바꾸고, 끊긴 실행 카드는 새 답으로 붙는다', async () => {
      const service = createChatService(
        () => fakeEngine([{ type: 'done', ok: true, canceled: false }]),
        undefined,
        { notes: fakeNotes('run') }
      )
      const id = await askFirst(service)
      service.applyChanges(id, { ...CHANGES, undone: true })
      const messages = service.conversation(id)!.messages
      expect(messages.filter((m) => m.changes)).toHaveLength(1)
      expect(messages.at(-1)?.changes?.undone).toBe(true)
      service.applyChanges(id, { ...CHANGES, id: 'other', interrupted: true })
      expect(service.conversation(id)!.messages.at(-1)).toEqual({
        role: 'assistant',
        text: '',
        refs: [],
        changes: { ...CHANGES, id: 'other', interrupted: true }
      })
    })
  })
})

describe('ChatService 다시 답하기', () => {
  /** 부를 때마다 다음 답을 내는 엔진 — 마지막 답 이후로는 그 답을 되풀이한다 */
  const answering = (
    answers: EngineEvent[][],
    jobs: IngestJob[]
  ): { store: ReturnType<typeof createChatStore>; service: ChatService } => {
    const store = createChatStore(mkdtempSync(join(tmpdir(), 'chat-regen-')))
    let n = 0
    const service = createChatService(() => {
      const events = answers[Math.min(n, answers.length - 1)]
      n += 1
      return fakeEngine(events, jobs)
    }, store)
    return { store, service }
  }
  const reply = (text: string): EngineEvent[] => [
    { type: 'session', id: 'sess-1' },
    { type: 'text', text },
    { type: 'done', ok: true, canceled: false }
  ]

  it('마지막 답을 지우고 같은 세션에 같은 질문을 다시 묻는다 — 질문은 한 번만 남는다', async () => {
    const jobs: IngestJob[] = []
    const { store, service } = answering([reply('첫 답'), reply('새 답')], jobs)
    const id = await askFirst(service, '사과는 무엇인가')
    const result = service.regenerate({ vaultDir: '/vault', conversationId: id })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    expect(jobs[1].resume).toBe('sess-1')
    // CLI 세션에는 지운 답이 남아 있다 — 새로 답하라는 한 줄을 붙여 같은 질문으로 읽히게 한다
    expect(jobs[1].prompt).toContain('사과는 무엇인가')
    expect(jobs[1].prompt).toContain('새로 답해')
    const expected = [
      { role: 'user', text: '사과는 무엇인가', refs: [] },
      { role: 'assistant', text: '새 답', refs: [] }
    ]
    expect(service.conversation(id)?.messages).toEqual(expected)
    expect(store.load('/vault', id)?.messages).toEqual(expected)
  })

  it('답이 실패해 질문으로 끝났으면 아무것도 지우지 않고, 질문을 더하지도 않고 다시 묻는다', async () => {
    const jobs: IngestJob[] = []
    const failed: EngineEvent[] = [
      { type: 'error', message: '연결이 끊겼다' },
      { type: 'done', ok: false, canceled: false }
    ]
    const { store, service } = answering([reply('첫 답'), failed, reply('다시 받은 답')], jobs)
    const id = await askFirst(service, 'q1')
    const second = service.ask({ vaultDir: '/vault', question: 'q2', conversationId: id })
    if ('error' in second) throw new Error(second.error)
    await second.finished
    expect(store.load('/vault', id)?.messages.map((m) => m.text)).toEqual(['q1', '첫 답', 'q2'])

    const result = service.regenerate({ vaultDir: '/vault', conversationId: id })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    // 지운 답이 없으니 새로 답하라는 줄도 없다
    expect(jobs[2].prompt).not.toContain('새로 답해')
    expect(store.load('/vault', id)?.messages.map((m) => m.text)).toEqual([
      'q1',
      '첫 답',
      'q2',
      '다시 받은 답'
    ])
  })

  it('새 답이 실패하거나 멈추면 지운 답을 되살린다 — 지운 답을 잃지 않는다', async () => {
    const failed: EngineEvent[] = [
      { type: 'text', text: '반쯤' },
      { type: 'error', message: '한도에 걸렸다' },
      { type: 'done', ok: false, canceled: false }
    ]
    const stopped: EngineEvent[] = [{ type: 'done', ok: false, canceled: true }]
    const { store, service } = answering([reply('첫 답'), failed, stopped], [])
    const id = await askFirst(service, 'q1')
    for (let i = 0; i < 2; i += 1) {
      const result = service.regenerate({ vaultDir: '/vault', conversationId: id })
      if ('error' in result) throw new Error(result.error)
      await result.finished
      expect(service.conversation(id)?.messages.map((m) => m.text)).toEqual(['q1', '첫 답'])
      expect(store.load('/vault', id)?.messages.map((m) => m.text)).toEqual(['q1', '첫 답'])
    }
  })

  it('새 답이 끝까지 왔는데 비었으면 앞 답을 두고 그 이유를 알린다', async () => {
    const empty: EngineEvent[] = [{ type: 'done', ok: true, canceled: false }]
    const { store, service } = answering([reply('첫 답'), empty], [])
    const notices: string[] = []
    service.onEvent((_id, event) => {
      if (event.type === 'notice') notices.push(event.text)
    })
    const id = await askFirst(service, 'q1')
    const result = service.regenerate({ vaultDir: '/vault', conversationId: id })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    expect(store.load('/vault', id)?.messages.map((m) => m.text)).toEqual(['q1', '첫 답'])
    expect(notices).toEqual(['새 답을 받지 못해 앞의 답을 그대로 두었어요'])
  })

  it('세션이 사라져 새로 물을 때는 "앞의 답을 지웠다" 는 줄을 빼고 보낸다 — 새 세션에는 앞 답이 없다', async () => {
    const jobs: IngestJob[] = []
    const store = createChatStore(mkdtempSync(join(tmpdir(), 'chat-regen-')))
    let n = 0
    const service = createChatService(
      () => ({
        async *run(job) {
          jobs.push(job)
          n += 1
          if (n === 2) {
            yield { type: 'error', message: '세션을 찾을 수 없다' }
            yield { type: 'done', ok: false, canceled: false }
            return
          }
          yield* reply(n === 1 ? '첫 답' : '새 세션의 답')
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- fake 엔진, 취소 없음
        cancel(): void {}
      }),
      store
    )
    const id = await askFirst(service, 'q1')
    const result = service.regenerate({ vaultDir: '/vault', conversationId: id })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    expect(jobs[1].resume).toBe('sess-1')
    expect(jobs[1].prompt).toContain('새로 답해')
    expect(jobs[2].resume).toBeUndefined()
    expect(jobs[2].prompt).not.toContain('새로 답해')
    expect(store.load('/vault', id)?.messages.map((m) => m.text)).toEqual(['q1', '새 세션의 답'])
  })

  it('메모리에 없는 대화는 저장소에서 되살려 다시 답한다', async () => {
    const jobs: IngestJob[] = []
    const { store, service } = answering([reply('첫 답')], jobs)
    const id = await askFirst(service, 'q1')
    const revived = createChatService(() => fakeEngine(reply('새 답'), jobs), store)
    const result = revived.regenerate({ vaultDir: '/vault', conversationId: id })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    expect(jobs[1].resume).toBe('sess-1')
    expect(store.load('/vault', id)?.messages.map((m) => m.text)).toEqual(['q1', '새 답'])
  })

  it('없는 대화·도는 대화·질문 없는 끝은 거절한다', async () => {
    const { service } = answering([reply('답')], [])
    expect(service.regenerate({ vaultDir: '/vault', conversationId: 'ghost' })).toEqual({
      error: '없는 대화예요'
    })
    const id = await askFirst(service, 'q1')
    const running = service.ask({ vaultDir: '/vault', question: 'q2', conversationId: id })
    expect(service.regenerate({ vaultDir: '/vault', conversationId: id })).toEqual({
      error: '이미 진행 중인 질문이 있어요'
    })
    if ('error' in running) throw new Error(running.error)
    await running.finished
    service.applyChanges(id, { id: 'run-9', files: [], blocked: [], interrupted: true })
    expect(service.regenerate({ vaultDir: '/vault', conversationId: id })).toEqual({
      error: '다시 답할 질문이 없어요'
    })
  })

  it('답이 만든 파일이 남아 있으면 거절하고 답을 지우지 않는다', async () => {
    const { service } = answering([reply('답')], [])
    const id = await askFirst(service, 'q1')
    const changes: ChangeSet = {
      id: '22222222-2222-2222-2222-222222222222',
      files: [{ rel: 'private/a.md', kind: 'created', tracked: false, afterHash: 'h' }],
      blocked: []
    }
    // 노트를 쓴 답 — 실행이 끝나면 카드가 그 답에 붙는다
    const conversation = service.conversation(id)
    if (conversation === null) throw new Error('대화가 없다')
    conversation.messages = [conversation.messages[0], { ...conversation.messages[1], changes }]
    const result = service.regenerate({ vaultDir: '/vault', conversationId: id })
    expect(result).toEqual({
      error: '이 답이 만든 파일이 아직 있어요 — 답 아래 카드에서 되돌린 뒤 다시 답하게 해 주세요'
    })
    expect(conversation.messages).toHaveLength(2)
  })
})

describe('ChatService 보관함별 취소 — test: chat-service vault scope', () => {
  const gateEngine = (): {
    engine: Engine
    cancelCount: () => number
  } => {
    let cancelCount = 0
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    return {
      engine: {
        async *run(): AsyncGenerator<EngineEvent> {
          await gate
          yield { type: 'done' as const, ok: false, canceled: true }
        },
        cancel(): void {
          cancelCount += 1
          release()
        }
      },
      cancelCount: (): number => cancelCount
    }
  }

  it('cancelForVault는 그 보관함 실행만 끝낸다', async () => {
    const a = gateEngine()
    const b = gateEngine()
    const engines = [a.engine, b.engine]
    let n = 0
    const service = createChatService(() => engines[n++]!)
    const ra = service.ask({ vaultDir: '/a', question: 'qa' })
    const rb = service.ask({ vaultDir: '/b', question: 'qb' })
    if ('error' in ra || 'error' in rb) throw new Error('ask 실패')
    service.cancelForVault('/a')
    expect(a.cancelCount()).toBe(1)
    expect(b.cancelCount()).toBe(0)
    service.cancelAll()
    await ra.finished
    await rb.finished
  })

  it('forgetForVault는 그 보관함 대화만 잊는다', () => {
    const service = createChatService(() => fakeEngine([]))
    const ra = service.ask({ vaultDir: '/a', question: 'qa' })
    const rb = service.ask({ vaultDir: '/b', question: 'qb' })
    if ('error' in ra || 'error' in rb) throw new Error('ask 실패')
    service.forgetForVault('/a')
    expect(service.conversation(ra.conversationId)).toBeNull()
    expect(service.conversation(rb.conversationId)).not.toBeNull()
  })
})

describe('ChatService 승인 왕복 — test: chat-service permission', () => {
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  const permissionEngine = (
    permissions: { id: string; tool: string; target: string; rule?: string }[],
    jobs: IngestJob[] = []
  ): { engine: Engine; responds: { id: string; allow: boolean }[] } => {
    const responds: { id: string; allow: boolean }[] = []
    const waiters = new Map<string, () => void>()
    const engine: Engine = {
      async *run(job): AsyncGenerator<EngineEvent> {
        jobs.push(job)
        for (const p of permissions) {
          yield { type: 'permission', ...p }
          if (responds.some((r) => r.id === p.id)) continue
          await new Promise<void>((resolve) => {
            if (responds.some((r) => r.id === p.id)) resolve()
            else waiters.set(p.id, resolve)
          })
        }
        yield { type: 'text', text: '답' }
        yield { type: 'done', ok: true, canceled: false } as EngineEvent
      },
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- fake 엔진, 취소 없음
      cancel(): void {},
      respond(id: string, allow: boolean): void {
        responds.push({ id, allow })
        waiters.get(id)?.()
        waiters.delete(id)
      }
    }
    return { engine, responds }
  }

  it('질문의 권한 모드를 엔진에 그대로 넘긴다', async () => {
    const jobs: IngestJob[] = []
    const events: EngineEvent[] = [
      { type: 'text', text: '답' },
      { type: 'done', ok: true, canceled: false }
    ]
    const service = createChatService(() => fakeEngine(events, jobs))
    const result = service.ask({ vaultDir: '/vault', question: 'q', permissionMode: 'all' })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    expect(jobs[0]).toMatchObject({ mode: 'all' })
  })

  it('도구 진행을 화면으로 내보낸다 — Read 근거 칩은 그대로 둔다', async () => {
    const toolEvents: EngineEvent[] = [
      { type: 'session', id: 'sess-1' },
      { type: 'text', text: '답' },
      { type: 'tool', name: 'Read', target: '/vault/wiki/apple.md' },
      { type: 'tool', name: 'Bash', target: 'ls' },
      { type: 'done', ok: true, canceled: false }
    ]
    const { service, seen } = withService(toolEvents)
    await askFirst(service)
    expect(seen).toContainEqual(
      expect.objectContaining({
        event: { type: 'tool', name: 'Bash', target: 'ls' }
      })
    )
    // Read 는 근거 칩으로도 남는다
    expect(service.conversation(seen[0].conversationId)?.messages.at(-1)?.refs).toContain(
      'wiki/apple.md'
    )
  })

  it('승인 요청을 화면에 내고 답을 엔진에 돌려준다', async () => {
    const jobs: IngestJob[] = []
    const { engine, responds } = permissionEngine(
      [{ id: 'req-1', tool: 'Bash', target: 'date' }],
      jobs
    )
    const service = createChatService(() => engine)
    const seen: ChatEvent[] = []
    service.onEvent((_id, event) => seen.push(event))
    const result = service.ask({ vaultDir: '/vault', question: '셸로 date 실행해 줘' })
    if ('error' in result) throw new Error(result.error)
    await tick()
    await tick()
    expect(seen).toContainEqual({
      type: 'permission',
      id: 'req-1',
      tool: 'Bash',
      target: 'date'
    })
    service.answerPermission(result.conversationId, 'req-1', 'allow')
    await result.finished
    expect(responds).toEqual([{ id: 'req-1', allow: true }])
  })

  it('거절하면 실행하지 말라고 돌려준다', async () => {
    const { engine, responds } = permissionEngine([{ id: 'req-1', tool: 'Bash', target: 'rm' }])
    const service = createChatService(() => engine)
    const result = service.ask({ vaultDir: '/vault', question: 'q' })
    if ('error' in result) throw new Error(result.error)
    await tick()
    await tick()
    service.answerPermission(result.conversationId, 'req-1', 'deny')
    await result.finished
    expect(responds).toEqual([{ id: 'req-1', allow: false }])
  })

  it('셸이 아닌 도구는 이 대화에서 계속 허용 뒤 다시 묻지 않는다', async () => {
    const { engine, responds } = permissionEngine([
      { id: 'req-1', tool: 'WebFetch', target: 'https://a.example' },
      { id: 'req-2', tool: 'WebFetch', target: 'https://b.example' }
    ])
    const service = createChatService(() => engine)
    const seen: ChatEvent[] = []
    service.onEvent((_id, event) => seen.push(event))
    const result = service.ask({ vaultDir: '/vault', question: 'q' })
    if ('error' in result) throw new Error(result.error)
    await tick()
    await tick()
    service.answerPermission(result.conversationId, 'req-1', 'session')
    await result.finished
    expect(responds).toEqual([
      { id: 'req-1', allow: true },
      { id: 'req-2', allow: true }
    ])
    // 두 번째 조회는 묻지 않고 바로 허용됐다 — 승인 카드는 한 번만 떴다
    expect(seen.filter((e) => e.type === 'permission')).toHaveLength(1)
  })

  // 셸을 도구 단위로 기억하면 `git status` 하나를 허용한 뒤 아무 명령이나 묻지 않고 돈다
  it('셸의 계속 허용은 그 명령(CLI 제안 규칙)만 — 다른 명령은 다시 묻는다', async () => {
    const { engine, responds } = permissionEngine([
      { id: 'req-1', tool: 'Bash', target: 'git status', rule: 'git status *' },
      { id: 'req-2', tool: 'Bash', target: 'git status --short' },
      { id: 'req-3', tool: 'Bash', target: 'rm notes.md' }
    ])
    const service = createChatService(() => engine)
    const seen: ChatEvent[] = []
    service.onEvent((_id, event) => seen.push(event))
    const result = service.ask({ vaultDir: '/vault', question: 'q' })
    if ('error' in result) throw new Error(result.error)
    await tick()
    await tick()
    service.answerPermission(result.conversationId, 'req-1', 'session')
    await tick()
    await tick()
    expect(responds).toEqual([
      { id: 'req-1', allow: true },
      { id: 'req-2', allow: true }
    ])
    expect(service.pendingFor(result.conversationId)).toEqual({
      id: 'req-3',
      tool: 'Bash',
      target: 'rm notes.md'
    })
    service.answerPermission(result.conversationId, 'req-3', 'deny')
    await result.finished
    expect(responds.at(-1)).toEqual({ id: 'req-3', allow: false })
    expect(seen.filter((e) => e.type === 'permission')).toHaveLength(2)
    expect(service.pendingFor(result.conversationId)).toBeNull()
  })

  it('대기 중이 아닌 id 의 답은 무시한다', async () => {
    const { engine, responds } = permissionEngine([{ id: 'req-1', tool: 'Bash', target: 'date' }])
    const service = createChatService(() => engine)
    const result = service.ask({ vaultDir: '/vault', question: 'q' })
    if ('error' in result) throw new Error(result.error)
    await tick()
    await tick()
    service.answerPermission(result.conversationId, '없는-id', 'allow')
    expect(responds).toEqual([])
    service.answerPermission(result.conversationId, 'req-1', 'allow')
    await result.finished
    expect(responds).toEqual([{ id: 'req-1', allow: true }])
  })
})

// 켜 둔 세션 풀과 가짜 claude 를 그대로 잇는다 — 프로세스를 열 때 한 번만 resume 하는지 띄운 인자로 본다
describe('ChatService + 세션 풀 — test: chat-service.ts · session/chat-sessions.ts', () => {
  const FAKE = resolve('test/fixtures/fake-claude/session/claude')
  const spawned = (log: string): string[] => {
    try {
      return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
  const boot = (
    store: ReturnType<typeof createChatStore>
  ): { service: ChatService; seen: ChatEvent[]; close: () => void } => {
    const sessions = createChatSessions({ open: (spec) => openClaudeSession(spec) })
    const base = { engine: 'claude' as const, cliPath: FAKE, mcp: [], userSettings: true }
    const service = createChatService((use, id) => sessions.engineFor(id, base, use), store)
    const seen: ChatEvent[] = []
    service.onEvent((_id, event) => seen.push(event))
    return { service, seen, close: () => sessions.closeAll() }
  }
  const ask = async (
    service: ChatService,
    vaultDir: string,
    question: string,
    id?: string
  ): Promise<string> => {
    const result = service.ask({ vaultDir, question, conversationId: id })
    if ('error' in result) throw new Error(result.error)
    await result.finished
    return result.conversationId
  }

  it('resume once — 프로세스를 열 때만 앞 세션을 붙이고, 사라진 세션이면 새로 묻는다', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'chat-pool-')))
    const vaultDir = join(root, 'vault')
    mkdirSync(vaultDir)
    const log = join(root, 'spawn.log')
    process.env.FAKE_CLAUDE_SPAWN_LOG = log
    const store = createChatStore(join(root, 'user'))
    try {
      const first = boot(store)
      const id = await ask(first.service, vaultDir, 'q1')
      await ask(first.service, vaultDir, 'q2', id)
      expect(spawned(log)).toHaveLength(1)
      expect(spawned(log)[0]).not.toContain('--resume')
      first.close()

      // 다시 켠 앱 — 저장된 세션으로 한 번 열고, 다음 질문은 그 프로세스가 받는다
      const second = boot(store)
      await ask(second.service, vaultDir, 'q3', id)
      await ask(second.service, vaultDir, 'q4', id)
      expect(spawned(log)).toHaveLength(2)
      expect(spawned(log)[1]).toContain('--resume=sess-fake')
      expect(store.load(vaultDir, id)?.messages.at(-1)?.text).toMatch(/q4 \(이어짐\)$/)
      second.close()

      // claude 가 세션을 잊었다 — 알리고 새 세션으로 다시 묻는다
      store.saveSession(vaultDir, id, 'gone')
      const third = boot(store)
      await ask(third.service, vaultDir, 'q5', id)
      expect(
        spawned(log)
          .slice(2)
          .map((line) => line.includes('--resume='))
      ).toEqual([true, false])
      expect(third.seen.some((e) => e.type === 'notice')).toBe(true)
      expect(third.seen.some((e) => e.type === 'error')).toBe(false)
      expect(store.load(vaultDir, id)?.messages.at(-1)?.text).toMatch(/q5$/)
      third.close()
    } finally {
      delete process.env.FAKE_CLAUDE_SPAWN_LOG
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('ChatService + Codex 세션 — test: chat-service.ts · session/codex-session.ts', () => {
  it('사라진 thread 면 알리고 같은 대화에서 새 thread 로 답한다 — 다음 질문도 그 thread 로 간다', async () => {
    const FAKE_CODEX = resolve('test/fixtures/fake-codex/session/codex')
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'chat-codex-')))
    const vaultDir = join(root, 'vault')
    mkdirSync(vaultDir)
    const log = join(root, 'requests.log')
    process.env.FAKE_CODEX_REQUEST_LOG = log
    const store = createChatStore(join(root, 'user'))
    const sessions = createChatSessions({ open: (spec) => openCodexSession(spec) })
    const base = { engine: 'codex' as const, cliPath: FAKE_CODEX, mcp: [], userSettings: true }
    const service = createChatService((use, id) => sessions.engineFor(id, base, use), store)
    const seen: ChatEvent[] = []
    service.onEvent((_id, event) => seen.push(event))
    try {
      const created = store.create(vaultDir, '대화')
      store.saveSession(vaultDir, created.id, 'gone')
      for (const question of ['q1', 'q2']) {
        const result = service.ask({ vaultDir, question, conversationId: created.id })
        if ('error' in result) throw new Error(result.error)
        await result.finished
      }
      expect(seen.some((e) => e.type === 'notice')).toBe(true)
      expect(seen.some((e) => e.type === 'error')).toBe(false)
      expect(store.load(vaultDir, created.id)?.messages.at(-1)?.text).toMatch(/q2$/)
      const threads = readFileSync(log, 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('thread/'))
        .map((l) => l.split(' ')[0])
      expect(threads).toEqual(['thread/resume', 'thread/start'])
    } finally {
      sessions.closeAll()
      delete process.env.FAKE_CODEX_REQUEST_LOG
      rmSync(root, { recursive: true, force: true })
    }
  })
})
