// 채팅 IPC — 서비스 이벤트를 창으로 흘려보낸다 (슬라이스 10). 볼트 전환·종료 시 실행 취소.
import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { APP_CHANNELS } from '../../shared/ipc-contract'
import { broadcast, sendToVault } from './broadcast'
import type {
  ChangeSet,
  ChangeSince,
  ChatAskContext,
  ChatEvent,
  ChatSkill,
  DocChangesResult,
  HunkRejectResult,
  HunkReview,
  InlineEditRequest,
  SaveAnswerPayload,
  SaveChatPayload,
  UndoResult
} from '../../shared/ipc-contract'
import { chatSessionBaseFor, createEngine, resolveEngineCli } from './handlers'
import type { Engine } from '../engine/engine'
import { createDocChanges } from '../note/doc-changes'
import { runInlineEdit } from '../chat/inline-edit'
import { createNoteRuns } from '../note/note-run'
import { markPruned } from '../note/note-run-pure'
import { vaultFileOrNull } from '../vault/vault-scope'
import { currentVaultDir } from './clip-handlers'
import { createChatService, systemFor, type ChatEngineUse } from '../chat/chat-service'
import { createChatStore } from '../chat/chat-store'
import { createChatSessions } from '../chat/session/chat-sessions'
import { openClaudeSession } from '../chat/session/claude-session'
import { openCodexSession } from '../chat/session/codex-session'
import { readAttached } from '../chat/attach'
import { chatImagesOf } from '../chat/images'
import { addAnswer, addText } from '../clip/clip-service'
import { chatFailed } from '../chat/chat-failure'
import { chatPermissionAnswerOf, chatPermissionModeOf } from '../../shared/chat-permission'
import { fetchPublicPage, readLinks } from '../chat/web-links'
import { githubToken } from './github-handlers'
import { mainT } from '../i18n'

// 볼트별 대화 영속화 — userData/chats/<볼트 해시>/ (슬라이스 11)
// userData 덮어쓰기(setPath)는 모듈 로드 뒤에 일어난다 — 게터로 늦게 읽는다
const chatStore = createChatStore(() => app.getPath('userData'))

// 채팅 노트 쓰기의 실행 기록·스냅샷 — userData/snapshots/<볼트 해시>/
const snapshotRoot = (): string => join(app.getPath('userData'), 'snapshots')
const noteRuns = createNoteRuns({ root: snapshotRoot })
// 리더의 "바뀐 곳" — 같은 실행 기록을 기준으로 읽는다
const docChanges = createDocChanges({ root: snapshotRoot })

// 채팅은 대화마다 프로세스 하나를 켜 둔다 — 쉬는 것 포함 최대 3개, 10분 쉬면 끈다
const sessions = createChatSessions({
  open: (spec) => (spec.engine === 'codex' ? openCodexSession(spec) : openClaudeSession(spec))
})
/** `/` 목록을 기다리는 상한 */
const SKILLS_TIMEOUT_MS = 20_000

// ask 요청마다 설정의 엔진 CLI 를 확인하고 그 CLI 로 엔진을 만든다
let engineFactory: (use: ChatEngineUse, conversationId: string) => Engine = () => {
  throw new Error(mainT().mainErrors.engineUnchecked)
}

const service = createChatService((use, id) => engineFactory(use, id), chatStore, {
  notes: noteRuns,
  // 토큰은 물을 때마다 읽는다 — 로그인·로그아웃이 다음 질문에 바로 반영된다
  links: (question) =>
    readLinks(
      { github: { token: githubToken(), fetch: globalThis.fetch }, page: fetchPublicPage },
      question
    )
})

// 대화·실행 id 는 renderer 에서 온다 — 저장 경로 조각이 되므로 모양을 확인한다
const RUN_ID = /^[0-9a-f-]{36}$/

/** 기준 시점은 renderer 에서 온다 — 아는 모양만 받는다 */
const asChangeSince = (since: unknown): ChangeSince | null => {
  if (since === 'today' || since === 'yesterday') return since
  const id = (since as { change?: unknown })?.change
  return typeof id === 'string' && RUN_ID.test(id) ? { change: id } : null
}

/** 카드를 저장소와 메모리 대화에 함께 반영한다 — 지워진 대화에는 붙이지 않는다 */
const applyCard = (vaultDir: string, conversationId: string, changes: ChangeSet): boolean => {
  if (!chatStore.applyChanges(vaultDir, conversationId, changes)) return false
  service.applyChanges(conversationId, changes)
  return true
}

/**
 * 앱이 노트를 쓰다 꺼졌으면 그 실행을 마무리하고 대화에 끊긴 카드를 붙인다.
 * 받기(자동 저장)보다 먼저 불러야 한다 — 반쯤 쓴 파일이 `save:` 로 섞이지 않게. 둘 다 보관함 줄에 선다
 */
export const recoverNoteRuns = (vaultDir: string | null): void => {
  if (!vaultDir) return
  noteRuns.recover(vaultDir).then(
    (cards) => {
      for (const { conversationId, changes } of cards) {
        if (!applyCard(vaultDir, conversationId, changes)) continue
        sendToVault(vaultDir, APP_CHANNELS.chatEvent, conversationId, { type: 'changes', changes })
      }
    },
    (error: unknown) => console.error('could not finish the interrupted note run', error)
  )
}

service.onEvent((conversationId, event: ChatEvent) => {
  // 대화가 들고 있는 보관함 창에만 — 메모리에 없으면(옛 실행) 전체 방송
  const vaultDir = service.conversation(conversationId)?.vaultDir
  if (vaultDir) sendToVault(vaultDir, APP_CHANNELS.chatEvent, conversationId, event)
  else broadcast(APP_CHANNELS.chatEvent, conversationId, event)
})

/** 도는 선택 영역 편집 — 한 번에 하나. 어느 보관함 일인지 함께 들고 있는다 */
let inlineEngine: Engine | null = null
let inlineVault: string | null = null

const asInlineEdit = (value: unknown): InlineEditRequest | null => {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const keys = ['rel', 'before', 'selection', 'after', 'instruction'] as const
  if (!keys.every((key) => typeof v[key] === 'string')) return null
  return {
    rel: v['rel'] as string,
    before: v['before'] as string,
    selection: v['selection'] as string,
    after: v['after'] as string,
    instruction: v['instruction'] as string
  }
}

/** 질문·다시 답하기·압축의 앞부분 — 발신 창의 보관함을 잡고, 설정의 엔진 CLI 를 확인해 그 CLI 로 엔진을 만든다 */
const prepareEngine = async (
  senderId?: number
): Promise<{ vaultDir: string } | { error: string }> => {
  const vaultDir = currentVaultDir(senderId)
  if (!vaultDir) return { error: mainT().common.noVault }
  const cli = await resolveEngineCli()
  if ('error' in cli) return cli
  engineFactory = (use, conversationId) =>
    sessions.engineFor(conversationId, chatSessionBaseFor(cli), use)
  return { vaultDir }
}

export const registerChatHandlers = (): void => {
  ipcMain.handle(
    APP_CHANNELS.askChat,
    async (event, question: string, conversationId?: string, context?: ChatAskContext) => {
      const ready = await prepareEngine(event.sender.id)
      if ('error' in ready) return ready
      const { vaultDir } = ready
      try {
        const result = service.ask({
          vaultDir,
          question,
          conversationId,
          attached: await readAttached(vaultDir, context?.mentions),
          permissionMode: chatPermissionModeOf(context?.permissionMode),
          images: chatImagesOf(context?.images)
        })
        if ('error' in result) return result
        // finished Promise 는 구조 복제할 수 없다 — IPC 결과에는 conversationId 만 나른다
        return { conversationId: result.conversationId }
      } catch (error) {
        return chatFailed('askChat failed', error)
      }
    }
  )
  // `/` 목록 — 그 보관함의 켜 둔 세션에 묻는다. 없으면 새 대화가 이어받을 세션을 하나 연다. Codex 는 스킬이 없다
  ipcMain.handle(APP_CHANNELS.listChatSkills, async (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    const cli = await resolveEngineCli()
    if ('error' in cli) return cli
    if (cli.kind !== 'claude') return []
    try {
      const listed = sessions.commands({
        ...chatSessionBaseFor(cli),
        vaultDir,
        system: systemFor(vaultDir)
      })
      // 세션이 열리다 멈추면(느린 MCP 서버 등) 메뉴만 비워 둔다 — 세션은 그대로 두어 첫 질문이 이어받는다
      let timer: NodeJS.Timeout | undefined
      const late = new Promise<ChatSkill[]>((resolve) => {
        timer = setTimeout(() => resolve([]), SKILLS_TIMEOUT_MS)
      })
      return await Promise.race([listed, late]).finally(() => clearTimeout(timer))
    } catch (error) {
      return chatFailed('listChatSkills failed', error)
    }
  })
  ipcMain.handle(APP_CHANNELS.stopChat, (_event, conversationId: string) => {
    service.stop(conversationId)
  })
  // 대화 압축 — 질문과 같은 엔진을 쓰지만 대화에는 아무 말도 남기지 않는다
  ipcMain.handle(APP_CHANNELS.compactChat, async (event, conversationId: string) => {
    const ready = await prepareEngine(event.sender.id)
    if ('error' in ready) return ready
    try {
      const result = service.compact(ready.vaultDir, conversationId)
      if ('error' in result) return result
      // finished Promise 는 구조 복제할 수 없다 — 끝은 이벤트로 알린다
      return { ok: true as const }
    } catch (error) {
      return chatFailed('compactChat failed', error)
    }
  })
  ipcMain.handle(
    APP_CHANNELS.regenerateChat,
    async (event, conversationId: unknown, context?: ChatAskContext) => {
      // 대화 id 는 저장 파일 이름이 되고 다시 답하기는 그 파일을 고쳐 쓴다 — 모양을 확인한다
      if (typeof conversationId !== 'string' || !RUN_ID.test(conversationId)) {
        return { error: mainT().chatService.noConversation }
      }
      const ready = await prepareEngine(event.sender.id)
      if ('error' in ready) return ready
      const { vaultDir } = ready
      try {
        const result = service.regenerate({
          vaultDir,
          conversationId,
          attached: await readAttached(vaultDir, context?.mentions),
          permissionMode: chatPermissionModeOf(context?.permissionMode)
        })
        if ('error' in result) return result
        return { ok: true as const }
      } catch (error) {
        return chatFailed('regenerateChat failed', error)
      }
    }
  )
  ipcMain.handle(
    APP_CHANNELS.answerChatPermission,
    (event, conversationId: unknown, requestId: unknown, answer: unknown) => {
      if (typeof conversationId !== 'string' || typeof requestId !== 'string') return
      // 보낸 창이 연 보관함의 대화에만 답한다 — 다른 핸들러와 같은 확인
      const vaultDir = currentVaultDir(event.sender.id)
      if (!vaultDir || service.conversation(conversationId)?.vaultDir !== vaultDir) return
      service.answerPermission(conversationId, requestId, chatPermissionAnswerOf(answer))
    }
  )
  ipcMain.handle(APP_CHANNELS.listChats, (event) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return []
    return chatStore.list(vaultDir)
  })
  ipcMain.handle(APP_CHANNELS.loadChat, (event, conversationId: string) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return null
    const loaded = chatStore.load(vaultDir, conversationId)
    if (loaded === null) return null
    const messages = markPruned(loaded.messages, (id) => noteRuns.has(vaultDir, id))
    // 화면을 다시 읽어 카드를 잃었어도 실행은 답을 기다린다 — 대화를 열 때 카드를 되살린다
    const permission = service.pendingFor(conversationId)
    return permission === null ? { messages } : { messages, permission }
  })
  ipcMain.handle(
    APP_CHANNELS.undoNoteChange,
    async (event, conversationId: unknown, changeId: unknown): Promise<UndoResult> => {
      const vaultDir = currentVaultDir(event.sender.id)
      if (!vaultDir) return { ok: false, reason: mainT().common.noVault }
      if (
        typeof conversationId !== 'string' ||
        typeof changeId !== 'string' ||
        !RUN_ID.test(conversationId) ||
        !RUN_ID.test(changeId)
      ) {
        return { ok: false, reason: mainT().mainErrors.badRequest }
      }
      const result = await noteRuns.undo(vaultDir, changeId, conversationId)
      if (result.ok) {
        applyCard(vaultDir, conversationId, result.changes)
        return result
      }
      // 기록이 지워진 경우만 카드를 바꾼다 — 잠시 막힌 것(위키화 중 등)은 다시 누를 수 있다
      if (!noteRuns.has(vaultDir, changeId)) {
        const card = chatStore
          .load(vaultDir, conversationId)
          ?.messages.find((m) => m.changes?.id === changeId)?.changes
        if (card) applyCard(vaultDir, conversationId, { ...card, pruned: true })
      }
      return result
    }
  )
  ipcMain.handle(APP_CHANNELS.inlineEdit, async (event, request: unknown) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { error: mainT().common.noVault }
    const req = asInlineEdit(request)
    if (req === null || vaultFileOrNull(vaultDir, req.rel) === null)
      return { error: mainT().mainErrors.badRequest }
    // 한 번에 하나 — 다른 보관함이 고치는 중이면 기다리라고 한다
    if (inlineEngine !== null && inlineVault !== vaultDir)
      return { error: mainT().chatService.otherVaultEditing }
    if (inlineEngine !== null) return { error: mainT().chatService.otherEditing }
    const cli = await resolveEngineCli()
    if ('error' in cli) return cli
    const engine = createEngine('aside', cli)
    inlineEngine = engine
    inlineVault = vaultDir
    try {
      return await runInlineEdit(engine, vaultDir, req)
    } catch (error) {
      return chatFailed('inline edit failed', error)
    } finally {
      inlineEngine = null
      inlineVault = null
    }
  })
  ipcMain.handle(APP_CHANNELS.cancelInlineEdit, (event) => {
    // 고치던 보관함 일만 끊는다 — 보관함 없는 창은 아무것도 끊지 않는다
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir || inlineVault !== vaultDir) return
    inlineEngine?.cancel()
  })
  ipcMain.handle(
    APP_CHANNELS.changeReview,
    async (
      event,
      conversationId: unknown,
      changeId: unknown,
      rel: unknown
    ): Promise<HunkReview> => {
      const vaultDir = currentVaultDir(event.sender.id)
      if (!vaultDir) return { unavailable: mainT().common.noVault }
      if (
        typeof conversationId !== 'string' ||
        typeof changeId !== 'string' ||
        typeof rel !== 'string' ||
        !RUN_ID.test(conversationId) ||
        !RUN_ID.test(changeId)
      ) {
        return { unavailable: mainT().mainErrors.badRequest }
      }
      return noteRuns.review(vaultDir, changeId, conversationId, rel)
    }
  )
  ipcMain.handle(
    APP_CHANNELS.rejectChangeHunk,
    async (
      event,
      conversationId: unknown,
      changeId: unknown,
      rel: unknown,
      index: unknown,
      hash: unknown
    ): Promise<HunkRejectResult> => {
      const vaultDir = currentVaultDir(event.sender.id)
      if (!vaultDir) return { ok: false, reason: mainT().common.noVault }
      if (
        typeof conversationId !== 'string' ||
        typeof changeId !== 'string' ||
        typeof rel !== 'string' ||
        typeof hash !== 'string' ||
        !Number.isInteger(index) ||
        !RUN_ID.test(conversationId) ||
        !RUN_ID.test(changeId)
      ) {
        return { ok: false, reason: mainT().mainErrors.badRequest }
      }
      const result = await noteRuns.rejectHunk(
        vaultDir,
        changeId,
        conversationId,
        rel,
        index as number,
        hash
      )
      if (result.ok) applyCard(vaultDir, conversationId, result.changes)
      return result
    }
  )
  ipcMain.handle(
    APP_CHANNELS.docChanges,
    async (event, rel: unknown, since: unknown): Promise<DocChangesResult> => {
      const vaultDir = currentVaultDir(event.sender.id)
      if (!vaultDir) return { unavailable: mainT().common.noVault }
      const asked = asChangeSince(since)
      if (typeof rel !== 'string' || asked === null) {
        console.error('invalid changed-ranges request arguments', rel, since)
        return { unavailable: mainT().chatService.changesFailed }
      }
      try {
        return await docChanges(vaultDir, rel, asked)
      } catch (error) {
        console.error('could not read changed ranges', rel, error)
        return { unavailable: mainT().chatService.changesFailed }
      }
    }
  )
  ipcMain.handle(APP_CHANNELS.renameChat, (event, conversationId: string, title: string) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return false
    const ok = chatStore.rename(vaultDir, conversationId, title)
    if (ok) service.rename(conversationId, title)
    return ok
  })
  ipcMain.handle(APP_CHANNELS.removeChat, (event, conversationId: string) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return false
    service.forget(conversationId)
    sessions.close(conversationId)
    return chatStore.remove(vaultDir, conversationId)
  })
  ipcMain.handle(APP_CHANNELS.saveChatToWiki, (event, payload: SaveChatPayload) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { ok: false, reason: mainT().common.noVault }
    if (typeof payload?.question !== 'string' || typeof payload.answer !== 'string') {
      return { ok: false, reason: mainT().mainErrors.badRequest }
    }
    return addText(vaultDir, {
      originVaultDir: payload.vaultDir,
      title: payload.question.slice(0, 40),
      question: payload.question,
      answer: payload.answer,
      source: payload.source ?? `chat:${payload.conversationId}`
    })
  })
  ipcMain.handle(APP_CHANNELS.saveChatAnswer, (event, payload: SaveAnswerPayload) => {
    const vaultDir = currentVaultDir(event.sender.id)
    if (!vaultDir) return { ok: false, reason: mainT().common.noVault }
    if (typeof payload?.question !== 'string' || typeof payload.answer !== 'string') {
      return { ok: false, reason: mainT().mainErrors.badRequest }
    }
    const refs = Array.isArray(payload.refs)
      ? payload.refs.filter((rel): rel is string => typeof rel === 'string')
      : []
    return addAnswer(vaultDir, {
      originVaultDir: payload.vaultDir,
      question: payload.question,
      answer: payload.answer,
      refs
    })
  })
  app.on('before-quit', () => {
    service.cancelAll()
    sessions.closeAll()
  })
}

/** 볼트가 바뀌면 그 보관함의 진행 중 채팅만 끝낸다 — 실행은 시작 시점 vaultDir 에 묶인다.
 *  oldVaultDir 없으면 전부(종료·초기 흐름) */
export const cancelChatsForVaultSwitch = (oldVaultDir?: string): void => {
  if (oldVaultDir === undefined) {
    service.cancelAll()
    service.forgetAll()
    sessions.closeAll()
  } else {
    service.cancelForVault(oldVaultDir)
    service.forgetForVault(oldVaultDir)
    sessions.closeVault(oldVaultDir)
  }
  // 고치던 선택 영역도 묶인 보관함 일이다 — 같은 보관함 것만 끊는다
  if (oldVaultDir === undefined || inlineVault === oldVaultDir) inlineEngine?.cancel()
}
