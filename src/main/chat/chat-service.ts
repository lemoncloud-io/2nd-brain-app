// 채팅 서비스 — 대화별 엔진 실행 1개, 스트리밍 이벤트·참조 칩·resume 을 맡는다 (슬라이스 10).
// 영속화는 슬라이스 11의 ChatStore. 여기선 메모리만.
import type {
  ChatImage,
  ChangeSet,
  ChatEvent,
  ChatMessage,
  ChatPermissionRequest,
  EngineUsage
} from '../../shared/ipc-contract'
import type { ChatPermissionAnswer, ChatPermissionMode } from '../../shared/chat-permission'
import { sessionAllows, sessionRuleOf, type SessionRule } from './session-allow'
import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Engine } from '../engine/engine'
import type { NoteRuns, PreparedRun } from '../note/note-run'
import { citedRels } from './cited-refs'
import { chatMessage, chatSystemPrompt, type Attached } from './prompts'
import { isVaultDoc } from '../vault/vault-scope'
import { classifyEngineFailure } from '../../shared/engine-failure'
import type { ChatStore } from './chat-store'
import { keepsFiles, keepsNewAnswer, lastTurn, STOPPED_MARK } from '../../shared/chat-turn'
import { type LinkDoc, type LinkContext } from '../github/link-context'
import { mainT } from '../i18n'

export type ChatConversation = {
  id: string
  title: string
  messages: ChatMessage[]
  sessionId: string | null
  running: boolean
  /** 실행 시작 시점에 잡은 볼트 — 실행 중 볼트가 바뀌어도 이 값으로 돈다 */
  vaultDir: string
}

export type AskChatInput = {
  vaultDir: string
  question: string
  conversationId?: string
  /** 이 질문에 `@` 로 붙인 문서 본문 — 핸들러가 읽어 예산 안에서 자른다 */
  attached?: Attached[]
  /** 입력칸의 권한 모드 — 핸들러가 검증해 넘긴다. 없으면 물어보기 */
  permissionMode?: ChatPermissionMode
  /** 입력칸에 붙여 넣은 그림 — 핸들러가 모양을 확인해 넘긴다 */
  images?: ChatImage[]
}

export type RegenerateChatInput = {
  vaultDir: string
  conversationId: string
  attached?: Attached[]
  /** 입력칸의 권한 모드 — 핸들러가 검증해 넘긴다. 없으면 물어보기 */
  permissionMode?: ChatPermissionMode
}

/** 채팅이 만드는 엔진 — 노트를 쓸 수 있으면 note, 아니면 읽기 전용 chat. 대화 압축은 웹 도구 없는 aside */
export type ChatEngineUse = 'chat' | 'note' | 'aside'

export type ChatServiceOptions = {
  /** 없으면 노트를 쓰지 않는다 — 예전처럼 읽기 전용 */
  notes?: NoteRuns
  /** 질문에 든 주소(GitHub·웹)를 읽어 온다 — 없으면 읽지 않는다 */
  links?: (question: string) => Promise<LinkContext>
}

export type ChatService = {
  conversation: (id: string) => ChatConversation | null
  ask: (
    input: AskChatInput
  ) => { conversationId: string; finished: Promise<void> } | { error: string }
  /**
   * 다시 답하기 — 마지막 답을 지우고 같은 질문을 같은 세션에 다시 묻는다. 질문은 대화에 한 번만 남는다.
   * 답이 실패해 질문으로 끝났으면 지울 것 없이 그 질문을 다시 묻는다
   */
  regenerate: (input: RegenerateChatInput) => { finished: Promise<void> } | { error: string }
  stop: (conversationId: string) => void
  /**
   * 승인 카드의 답 — 대기 중인 요청이 아니면 아무 일도 하지 않는다.
   * session 이면 이 대화가 끝날 때까지 같은 도구를 다시 묻지 않는다(메모리에만 둔다)
   */
  answerPermission: (
    conversationId: string,
    requestId: string,
    answer: ChatPermissionAnswer
  ) => void
  /** 화면의 답을 기다리는 승인 요청 — 대화를 다시 열면 카드를 되살린다. 없으면 null */
  pendingFor: (conversationId: string) => ChatPermissionRequest | null
  /**
   * 대화 압축 — 이어가던 세션에 `/compact` 를 한 번 보낸다.
   * 대화 목록에는 아무 말도 남기지 않는다: 이것은 질문이 아니라 살림이다
   */
  compact: (
    vaultDir: string,
    conversationId: string
  ) => { finished: Promise<void> } | { error: string }
  /** 진행 중이면 취소하고 메모리에서 잊는다 — 저장소 삭제는 핸들러가 함께 한다 */
  forget: (conversationId: string) => void
  rename: (conversationId: string, title: string) => void
  /** 되돌리기 결과·끊긴 실행 카드를 메모리 대화에 반영한다 — 저장소 반영은 핸들러가 함께 한다 */
  applyChanges: (conversationId: string, changes: ChangeSet) => void
  cancelAll: () => void
  /** 그 보관함의 진행 중 채팅만 끝낸다 — 다른 보관함은 그대로 돈다 */
  cancelForVault: (vaultDir: string) => void
  forgetAll: () => void
  /** 그 보관함의 대화·엔진만 잊는다 */
  forgetForVault: (vaultDir: string) => void
  onEvent: (listener: (conversationId: string, event: ChatEvent) => void) => () => void
}

/** 앱 규칙 — 보관함에 일일 노트 틀이 있을 때만 그 안내가 붙는다 */
export const systemFor = (vaultDir: string): string =>
  chatSystemPrompt({ hasDailyTemplate: existsSync(join(vaultDir, 'templates', 'daily-note.md')) })

/** 다시 답하기에서 질문 뒤에 붙인다 — CLI 세션에는 지운 답이 남아 있다 */
// ui-hangul-ignore: AI 에게 보내는 지시(범위 밖: AI 프롬프트)
const REGENERATE_NOTE = '(앞의 답은 지웠어요. 같은 질문에 처음부터 새로 답해 주세요.)'

export const createChatService = (
  /** 대화마다 켜 둔 세션의 턴 하나 — 같은 대화 id 는 같은 프로세스로 간다 */
  createEngine: (use: ChatEngineUse, conversationId: string) => Engine,
  store?: ChatStore,
  options: ChatServiceOptions = {}
): ChatService => {
  const { notes, links } = options
  const conversations = new Map<string, ChatConversation>()
  const engines = new Map<string, Engine>()
  // 엔진을 만들기 전(노트 준비 중)에 온 멈춤도 놓치지 않는다
  const stopRequested = new Set<string>()
  // "이 대화에서 계속 허용" 한 규칙 — 셸은 명령 단위, 그 밖은 도구 단위(session-allow). 대화별 메모리만, 앱을 다시 켜면 사라진다
  const sessionAllowed = new Map<string, SessionRule[]>()
  // 화면의 답을 기다리는 승인 요청 id → 요청 — 화면을 다시 열면 카드를 되살린다
  const pendingPermission = new Map<
    string,
    Map<string, { tool: string; target: string; rule?: string }>
  >()
  const listeners = new Set<(conversationId: string, event: ChatEvent) => void>()
  const emit = (conversationId: string, event: ChatEvent): void => {
    for (const listener of listeners) listener(conversationId, event)
  }

  /**
   * 앱 재시작 뒤 등 메모리에 없는 대화를 저장소에서 되살린다 — 그러지 않으면 세션이
   * 디스크에 있는데도 "없는 대화다" 가 된다. 되살릴 것이 없으면 null
   */
  const revive = (vaultDir: string, id: string): ChatConversation | null => {
    const saved = store?.load(vaultDir, id)
    const summary = store?.list(vaultDir).find((c) => c.id === id)
    if (saved === null || saved === undefined || summary === undefined) return null
    const conversation: ChatConversation = {
      id,
      title: summary.title,
      messages: saved.messages,
      sessionId: saved.sessionId,
      running: false,
      vaultDir
    }
    conversations.set(id, conversation)
    return conversation
  }

  /**
   * 대화의 다음 답을 받는다 — 질문은 호출자가 이미 대화에 넣었다.
   * `replacing` 은 다시 답하기가 메모리에서 뗀 앞 답이다 — 저장소에서는 새 답이 남을 때만 바꾼다
   */
  const answer = (
    conversation: ChatConversation,
    question: string,
    input: {
      vaultDir: string
      attached?: Attached[]
      permissionMode?: ChatPermissionMode
      images?: ChatImage[]
    },
    replacing: ChatMessage | null = null
  ): Promise<void> => {
    conversation.running = true
    const assistant: ChatMessage = { role: 'assistant', text: '', refs: [] }
    conversation.messages.push(assistant)

    // macOS /var ↔ /private/var 처럼 cwd 가 realpath 로 정규화되면 CLI 도구 입력 경로가
    // settings 볼트 경로와 달라진다 — 두 후보 모두로 상대 경로를 계산한다
    const { vaultDir } = input
    let realVault = vaultDir
    try {
      realVault = realpathSync(vaultDir)
    } catch {
      // 사라진 볼트 — 원래 경로로 비교
    }
    const toVaultRel = (target: string): string | null => {
      for (const base of [vaultDir, realVault]) {
        if (target.startsWith(base + sep)) {
          return relative(base, target).split(sep).join('/')
        }
      }
      return null
    }
    stopRequested.delete(conversation.id)
    const attached = input.attached ?? []
    // 사용자가 붙인 문서 — 칩 후보일 뿐이다(readAttached 가 이미 겹침을 걸렀다). 답이 인용하거나 Read 한 것만 끝에 칩이 된다
    const injected = attached.map((doc) => doc.rel)
    return (async () => {
      let run: PreparedRun | null = null
      // 엔진의 끝 알림은 노트 판정 뒤에 보낸다 — 변경 카드가 답의 끝보다 늦게 오지 않게
      let doneEvent: Extract<ChatEvent, { type: 'done' }> | null = null
      try {
        // 답 전에 알릴 말은 모아서 한 번에 낸다 — 화면의 알림 자리는 하나라 따로 내면 뒤의 말이 앞의 말을 덮는다
        const notices: string[] = []
        // 질문에 든 주소(GitHub·웹)는 앱이 읽어 싣는다 — 못 읽어도 답은 멈추지 않는다
        let linked: LinkDoc[] = []
        if (links !== undefined) {
          try {
            const read = await links(question)
            linked = read.docs
            if (!stopRequested.has(conversation.id)) notices.push(...read.notices)
          } catch (err) {
            console.error('chat links failed', err)
            if (!stopRequested.has(conversation.id)) notices.push(mainT().githubMain.linksUnread)
          }
        }
        // 위키화 중·다른 대화가 쓰는 중이면 읽기 전용으로 답하고 그 이유를 한 줄 알린다
        if (notes !== undefined) {
          const prepared = await notes.prepare(conversation.vaultDir, conversation.id)
          if ('run' in prepared) run = prepared.run
          else notices.push(prepared.readonly)
        }
        if (notices.length > 0) {
          emit(conversation.id, { type: 'notice', text: notices.join(' · ') })
        }
        const writer = run
        const engine = createEngine(writer === null ? 'chat' : 'note', conversation.id)
        engines.set(conversation.id, engine)
        if (stopRequested.has(conversation.id)) engine.cancel()
        // CLI 세션을 앞 턴으로 되감는 옵션은 claude 2.1.287 --help 와 codex 0.160.0 exec resume --help 에
        // 없다(2026-10-02 확인). 이어 묻는 세션에는 지운 답이 남으므로, 같은 질문을 되풀이한 것으로 읽히지
        // 않게 새로 답하라는 한 줄을 붙인다. 새 세션(이어갈 세션이 없거나 사라졌다)에는 앞 답이 없어 붙이지 않는다
        const promptFor = (resume: string | undefined): string => {
          const asked =
            replacing !== null && resume !== undefined
              ? `${question}\n\n${REGENERATE_NOTE}`
              : question
          return chatMessage(asked, {
            readonly: writer === null,
            ignoredOnly: writer?.ignoredOnly,
            attached,
            linked
          })
        }
        const system = systemFor(conversation.vaultDir)
        const runOnce = async (resume: string | undefined): Promise<boolean> => {
          let gotOutput = false
          let resumeFailed = false
          for await (const event of engine.run({
            vaultDir: conversation.vaultDir,
            prompt: promptFor(resume),
            system,
            resume,
            mode: input.permissionMode,
            images: input.images
          })) {
            if (event.type === 'session') {
              conversation.sessionId = event.id
              store?.saveSession(conversation.vaultDir, conversation.id, event.id)
            } else if (event.type === 'usage') {
              // 엔진이 알려 온 형편 그대로 넘긴다 — 무엇을 보일지는 화면이 정한다
              emit(conversation.id, { type: 'usage', usage: event.usage })
            } else if (event.type === 'compacted') {
              // CLI 가 스스로 줄인 것도 같은 일이다 — 말해 주지 않으면 앞을 잊은 것이
              // 다음 답의 일부처럼 읽힌다(DESIGN.md § AI 한계)
              emit(conversation.id, { type: 'compacted' })
            } else if (event.type === 'thinking') {
              assistant.thinking = (assistant.thinking ?? '') + event.text
              emit(conversation.id, { type: 'thinking', text: event.text })
            } else if (event.type === 'text') {
              gotOutput = true
              assistant.text += event.text
              emit(conversation.id, { type: 'text', text: event.text })
            } else if (event.type === 'tool') {
              emit(conversation.id, { type: 'tool', name: event.name, target: event.target })
              if (event.name === 'Read') {
                // 절대경로 도구 입력을 볼트 상대로 — 볼트 밖과 문서가 아닌 것은 버린다
                const rel = toVaultRel(event.target)
                if (rel !== null && isVaultDoc(rel) && !assistant.refs.includes(rel)) {
                  assistant.refs.push(rel)
                }
              }
              if (writer !== null) writer.used(event.name)
            } else if (event.type === 'file-change') {
              writer?.saw(event.path)
            } else if (event.type === 'permission') {
              const rules = sessionAllowed.get(conversation.id) ?? []
              if (rules.some((rule) => sessionAllows(rule, event.tool, event.target))) {
                engine.respond?.(event.id, true)
              } else {
                let pending = pendingPermission.get(conversation.id)
                if (pending === undefined) {
                  pending = new Map()
                  pendingPermission.set(conversation.id, pending)
                }
                pending.set(event.id, { tool: event.tool, target: event.target, rule: event.rule })
                emit(conversation.id, {
                  type: 'permission',
                  id: event.id,
                  tool: event.tool,
                  target: event.target
                })
              }
            } else if (event.type === 'error') {
              // 이어가려던 세션이 사라졌을 때만 새 세션으로 다시 묻는다.
              // 예전에는 "재개 중 첫 출력 전 오류" 를 전부 세션 만료로 읽어, 한도·너무 긴 내용까지
              // 조용히 한 번 더 보냈다 — 같은 한도에 두 번 부딪치고 원인은 화면에 안 떴다
              const kind = classifyEngineFailure(event.message)
              if (resume !== undefined && !gotOutput && kind === 'session-expired') {
                resumeFailed = true
              } else {
                emit(conversation.id, { type: 'error', message: event.message })
              }
            } else if (event.type === 'done') {
              if (!resumeFailed && event.canceled && assistant.text === '') {
                assistant.text = STOPPED_MARK
              }
              if (!resumeFailed)
                doneEvent = { type: 'done', ok: event.ok, canceled: event.canceled }
            }
          }
          return resumeFailed
        }
        const usedResume = conversation.sessionId ?? undefined
        let failed = await runOnce(usedResume)
        if (failed) {
          // 세션을 잃었다 — 기록하고 새 세션으로 다시 묻는다.
          // 알림은 답 본문에 섞지 않는다: 답에 섞으면 "모델이 앞 대화를 잊었다" 는 사실이
          // 답의 일부처럼 읽히고, 대화를 다시 열면 그 줄이 답 안에 남는다
          conversation.sessionId = null
          store?.saveSession(conversation.vaultDir, conversation.id, null)
          emit(conversation.id, {
            type: 'notice',
            text: mainT().chatService.resumeFailed
          })
          failed = await runOnce(undefined)
        }
      } catch (err) {
        console.error('chat run failed', err)
        emit(conversation.id, {
          type: 'error',
          message: mainT().chatService.runFailed
        })
        doneEvent = { type: 'done', ok: false, canceled: false }
      } finally {
        // 엔진이 실패·취소돼도 판정한다 — 반쯤 쓴 파일이 카드 없이 남지 않게
        if (run !== null) {
          try {
            const changes = await run.finish()
            if (changes !== null) {
              assistant.changes = changes
              emit(conversation.id, { type: 'changes', changes })
            }
          } catch (err) {
            console.error('note run finish failed', err)
            emit(conversation.id, {
              type: 'error',
              message: mainT().chatService.filesUnchecked
            })
          }
        }
        // 다시 답하기의 새 답이 실패·멈춤·빈 답이면 앞 답을 되살린다 — 앞 답은 메모리에서 뗐고 다른 사본이 없다.
        // 화면도 같은 규칙(keepsNewAnswer)으로 되살린다
        const restore = replacing !== null && !keepsNewAnswer(assistant, doneEvent)
        if (restore && doneEvent?.ok === true && !doneEvent.canceled) {
          // 실패·멈춤은 오류 줄과 멈춤이 이미 말한다 — 끝까지 왔는데 빈 답만 말이 없다
          emit(conversation.id, {
            type: 'notice',
            text: mainT().chatService.keptPrevious
          })
        }
        // 빈 답은 남기지 않는다 — 대화를 다시 열 때 빈 풍선이 된다. 여기까지 refs 는 엔진이 Read 한 것뿐이다
        const answered = assistant.refs.length > 0
        // 칩 = 실은 문서 중 답이 인용했거나 엔진이 Read 한 것(실은 순서) + 그 밖에 Read 한 문서
        const read = assistant.refs
        const cited = citedRels(assistant.text, injected)
        assistant.refs = [
          ...injected.filter((rel) => cited.includes(rel) || read.includes(rel)),
          ...read.filter((rel) => !injected.includes(rel))
        ]
        if (replacing !== null && restore) {
          conversation.messages = conversation.messages.map((m) =>
            m === assistant ? replacing : m
          )
        } else if (assistant.text !== '' || answered || assistant.changes !== undefined) {
          try {
            // 앞 답을 새 답으로 한 번에 바꾼다 — 끝 모양이 달라 바꾸지 못했으면 새 답을 잃지 않게 붙인다
            if (
              replacing === null ||
              store?.replaceLastAnswer(conversation.vaultDir, conversation.id, assistant) === false
            ) {
              store?.append(conversation.vaultDir, conversation.id, assistant)
            }
          } catch (err) {
            console.error('chat answer save failed', err)
            emit(conversation.id, {
              type: 'error',
              message: mainT().chatService.saveFailed
            })
          }
        } else {
          conversation.messages = conversation.messages.filter((m) => m !== assistant)
        }
        // 끝 알림은 저장 뒤에 보낸다 — 화면이 끝을 받고 다시 읽으면 저장소가 이미 최종 모양이다
        if (doneEvent !== null) {
          emit(conversation.id, { type: 'refs', rels: [...assistant.refs] })
          emit(conversation.id, doneEvent)
        }
        // 실행은 볼트와 무관하게 정리된다 — UI 점·입력 잠금이 이 값을 읽는다
        conversation.running = false
        engines.delete(conversation.id)
        stopRequested.delete(conversation.id)
        pendingPermission.delete(conversation.id)
      }
    })()
  }

  /** 이어서 물을 대화 — 메모리에 없으면 저장소에서 되살린다. 답하는 중이면 거절한다 */
  const idle = (vaultDir: string, id: string): ChatConversation | { error: string } => {
    const found = conversations.get(id) ?? revive(vaultDir, id)
    if (found === null) return { error: mainT().chatService.noConversation }
    if (found.running) return { error: mainT().chatService.busy }
    return found
  }

  const service = {
    onEvent(listener: (conversationId: string, event: ChatEvent) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    conversation: (id: string): ChatConversation | null => conversations.get(id) ?? null,

    ask(
      input: AskChatInput
    ): { conversationId: string; finished: Promise<void> } | { error: string } {
      const { vaultDir, question, conversationId } = input
      let conversation: ChatConversation
      if (conversationId !== undefined) {
        const found = idle(vaultDir, conversationId)
        if ('error' in found) return found
        conversation = found
      } else {
        // 제목은 첫 질문 앞 40자 (플랜 §11)
        const saved = store?.create(vaultDir, question.slice(0, 40))
        conversation = {
          id: saved?.id ?? randomUUID(),
          title: saved?.title ?? question.slice(0, 40),
          messages: [],
          sessionId: null,
          running: false,
          vaultDir
        }
        conversations.set(conversation.id, conversation)
      }

      const imageCount = input.images?.length ?? 0
      const userMessage: ChatMessage = {
        role: 'user',
        text: question,
        refs: [],
        ...(imageCount > 0 ? { images: imageCount } : {})
      }
      conversation.messages.push(userMessage)
      store?.append(conversation.vaultDir, conversation.id, userMessage)
      return {
        conversationId: conversation.id,
        finished: answer(conversation, question, input)
      }
    },

    regenerate(input: RegenerateChatInput): { finished: Promise<void> } | { error: string } {
      const conversation = idle(input.vaultDir, input.conversationId)
      if ('error' in conversation) return conversation
      const turn = lastTurn(conversation.messages)
      if (turn === null) return { error: mainT().chatService.nothingToRegenerate }
      if (keepsFiles(turn.answer)) {
        return {
          error: mainT().chatService.filesRemain
        }
      }
      // 저장소의 앞 답은 새 답이 남을 때 바꾼다(answer 의 finally) — 실패하면 앞 답을 되살린다
      if (turn.answer !== null) conversation.messages = conversation.messages.slice(0, -1)
      return { finished: answer(conversation, turn.question, input, turn.answer) }
    },

    compact(
      vaultDir: string,
      conversationId: string
    ): { finished: Promise<void> } | { error: string } {
      const chat = conversations.get(conversationId) ?? revive(vaultDir, conversationId)
      if (chat === null) return { error: mainT().chatService.noConversation }
      // 이어갈 세션이 없으면 압축할 것도 없다 — 앞부분이 애초에 CLI 쪽에 없다
      if (chat.sessionId === null) return { error: mainT().chatService.nothingToCompact }
      if (chat.running) return { error: mainT().chatService.busy }
      chat.running = true
      stopRequested.delete(conversationId)
      const finished = (async () => {
        let compacted = false
        // 사용률은 압축이 실제로 일어났을 때만 내보낸다 — 실패한 실행의 init 줄이 화면의 수를
        // 지우면, 알림이 통째로 사라져 다시 시도할 길까지 없어진다
        let lastUsage: EngineUsage | null = null
        try {
          const engine = createEngine('aside', conversationId)
          engines.set(conversationId, engine)
          for await (const event of engine.run({
            vaultDir: chat.vaultDir,
            prompt: '/compact',
            // 질문과 같은 규칙이어야 켜 둔 세션이 그대로 받는다 — 다르면 프로세스를 새로 연다
            system: systemFor(chat.vaultDir),
            resume: chat.sessionId ?? undefined
          })) {
            if (event.type === 'compacted') compacted = true
            else if (event.type === 'session') {
              chat.sessionId = event.id
              store?.saveSession(chat.vaultDir, conversationId, event.id)
            } else if (event.type === 'usage') lastUsage = event.usage
            else if (event.type === 'error') {
              emit(conversationId, { type: 'error', message: event.message })
            }
          }
          // 경계 줄이 안 왔으면 압축은 일어나지 않았다 — 줄었다고 말하지 않는다
          if (compacted) {
            if (lastUsage !== null) emit(conversationId, { type: 'usage', usage: lastUsage })
            emit(conversationId, { type: 'compacted' })
          } else if (!stopRequested.has(conversationId)) {
            emit(conversationId, {
              type: 'notice',
              text: mainT().chatService.compactFailed
            })
          }
        } catch (err) {
          console.error('chat compact failed', err)
          emit(conversationId, {
            type: 'error',
            message: mainT().chatService.runFailedRetry
          })
        } finally {
          const canceled = stopRequested.has(conversationId)
          chat.running = false
          engines.delete(conversationId)
          stopRequested.delete(conversationId)
          emit(conversationId, { type: 'done', ok: compacted, canceled })
        }
      })()
      return { finished }
    },

    stop: (conversationId: string): void => {
      if (conversations.get(conversationId)?.running) stopRequested.add(conversationId)
      engines.get(conversationId)?.cancel()
    },

    answerPermission: (
      conversationId: string,
      requestId: string,
      answer: ChatPermissionAnswer
    ): void => {
      const pending = pendingPermission.get(conversationId)
      const request = pending?.get(requestId)
      // 대기 중이 아닌 id 는 무시한다 — 멈춤·끝에서 늦게 온 답이 stdin 에 쓰이지 않게
      if (request === undefined) return
      pending?.delete(requestId)
      if (answer === 'session') {
        const rule = sessionRuleOf(request.tool, request.target, request.rule)
        sessionAllowed.set(conversationId, [...(sessionAllowed.get(conversationId) ?? []), rule])
      }
      engines.get(conversationId)?.respond?.(requestId, answer !== 'deny')
    },

    pendingFor: (conversationId: string): ChatPermissionRequest | null => {
      const first = pendingPermission.get(conversationId)?.entries().next().value
      if (first === undefined) return null
      const [id, { tool, target }] = first
      return { id, tool, target }
    },

    forget: (conversationId: string): void => {
      service.stop(conversationId)
      conversations.delete(conversationId)
      sessionAllowed.delete(conversationId)
      pendingPermission.delete(conversationId)
    },

    rename: (conversationId: string, title: string): void => {
      const found = conversations.get(conversationId)
      if (found) found.title = title
    },

    applyChanges: (conversationId: string, changes: ChangeSet): void => {
      const found = conversations.get(conversationId)
      if (!found) return
      const message = found.messages.find((m) => m.changes?.id === changes.id)
      if (message) message.changes = changes
      else found.messages.push({ role: 'assistant', text: '', refs: [], changes })
    },

    /** 볼트 전환·before-quit — 진행 중 채팅을 모두 끝낸다 (ingest 패턴) */
    cancelAll: (): void => {
      for (const engine of engines.values()) engine.cancel()
    },
    /** 볼트 전환 — 그 보관함의 진행 중 채팅만 끝낸다. 다른 보관함은 그대로 돈다 */
    cancelForVault: (vaultDir: string): void => {
      for (const [id, engine] of engines) {
        if (conversations.get(id)?.vaultDir === vaultDir) engine.cancel()
      }
    },
    /** 볼트 전환 — 묶인 대화·엔진을 잊는다. 저장은 디스크에 있어 다시 열 때 되살린다(revive) */
    forgetAll: (): void => {
      conversations.clear()
      engines.clear()
      stopRequested.clear()
      sessionAllowed.clear()
      pendingPermission.clear()
    },
    /** 볼트 전환 — 그 보관함의 대화·엔진만 잊는다 */
    forgetForVault: (vaultDir: string): void => {
      for (const [id, conversation] of conversations) {
        if (conversation.vaultDir !== vaultDir) continue
        stopRequested.delete(id)
        engines.delete(id)
        conversations.delete(id)
        sessionAllowed.delete(id)
        pendingPermission.delete(id)
      }
    }
  }
  return service
}
