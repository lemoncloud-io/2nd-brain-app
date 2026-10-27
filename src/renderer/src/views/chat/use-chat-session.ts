// 채팅 세션 — 대화 목록·메시지·스트리밍 구독. 화면과 분리한 이유는 같은 대화를
// 대화·스트림이 한 벌이어야 하기 때문이다. 상태는 App 에서 한 번만 만든다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ChangeSet,
  ChatAskContext,
  ChatEvent,
  ChatMessage,
  ChatSummary,
  EngineUsage
} from '../../../../shared/ipc-contract'
import type { ChatPermissionAnswer, ChatPermissionMode } from '../../../../shared/chat-permission'
import { normalizeChatDefaults } from '../../../../shared/chat-defaults'
import { keepsFiles, keepsNewAnswer, lastTurn, STOPPED_MARK } from '../../../../shared/chat-turn'
import { toUserError, type UserError } from '../../lib/user-error'
import { toolActivity } from '../../lib/tool-text'
import { useWorkbench } from '../../store/workbench'
import { useVaultSwitch } from '../../hooks/use-vault-switch'
import { imageCountError, readImage, type PendingImage } from '../../lib/chat-images'
import { MAX_CHAT_IMAGES } from '../../../../shared/chat-image'
import { getT } from '../../lib/i18n'

/** imageUrls — 이번 화면에서 보낸 질문의 그림 미리보기. 저장하지 않으므로 다시 열면 그림 수(`images`)만 남는다 */
export type ViewMessage = ChatMessage & { streaming?: boolean; imageUrls?: string[] }

/** 답이 아니라 앱이 알리는 줄 — 답 본문에 섞지 않는다 */
export type Notice = { text: string; at: number }

/**
 * 대화가 길어지면 AI 가 앞부분을 잃는다. 앱은 CLI 세션 안을 볼 수 없으므로 주고받은 횟수로 짐작한다 —
 * 정확한 한계가 아니라 "슬슬 새 대화가 낫다" 는 신호다.
 */
export const LONG_CONVERSATION_TURNS = 24

export type ChatSession = {
  conversations: ChatSummary[]
  activeId: string | null
  activeTitle: string | undefined
  messages: ViewMessage[]
  runningIds: Set<string>
  running: boolean
  error: UserError | null
  /** 앱이 알리는 줄 — 세션이 끊겨 새로 물었을 때 등 */
  notice: Notice | null
  dismissNotice: () => void
  /** 화면이 알림 줄에 한 마디 남긴다 — 답 중에 고른 명령처럼 바로 못 하는 일을 알릴 때 */
  notify: (text: string) => void
  /** 대화가 길어졌다 — 새 대화를 권한다 */
  tooLong: boolean
  /**
   * 이 대화가 쓰는 모델과 찬 정도 — 엔진이 알려 올 때만 있다(codex 는 안 보낸다).
   * 대화를 바꾸면 비운다: 앞 대화의 숫자를 다음 대화의 형편으로 읽으면 안 된다
   */
  usage: EngineUsage | null
  /**
   * 대화 압축 — 앞부분을 요약으로 바꾼다. 확인은 화면이 먼저 받는다.
   * 이어갈 세션이 없거나 이미 도는 중이면 main 이 거절한다
   */
  compact: () => void
  /** 압축하는 중 */
  compacting: boolean
  /** 실패한 질문 — 있으면 같은 질문을 한 번에 다시 보낼 수 있다 */
  retry: (() => void) | null
  /**
   * 다시 답하기 — 마지막 답을 지우고 같은 질문에 새 답을 받는다. 답하는 중이거나, 마지막이 답이 아니거나,
   * 그 답이 만든 파일이 남아 있으면 null
   */
  regenerate: (() => void) | null
  draft: string
  setDraft: (draft: string) => void
  /** 입력칸에서 `@` 로 고른 문서 — 다음 질문에 본문이 실린다. 보내면 비운다 */
  mentions: string[]
  setMentions: (mentions: string[]) => void
  /** 입력칸에 붙여 넣은 그림 — 다음 질문과 함께 간다. 보내면 비운다 */
  images: PendingImage[]
  /** 붙여 넣은 파일 중 그림을 붙인다 — 못 붙인 것은 알림 줄에 사유 */
  addImages: (files: File[]) => void
  removeImage: (id: string) => void
  /** 권한 모드 — 물어보기(기본)·파일 고치기는 바로·전부 바로. 입력칸 상태로 질문마다 실어 보낸다 */
  permissionMode: ChatPermissionMode
  setPermissionMode: (mode: ChatPermissionMode) => void
  /** 승인 카드 — 대기 중인 승인 요청 하나. 대화 전환·답 끝이면 비운다 */
  pendingPermission: { id: string; tool: string; target: string } | null
  answerPermission: (answer: ChatPermissionAnswer) => void
  /** 도구 진행 한 줄 — 답이 오는 동안 쓰는 도구. 답이 끝나면 비운다 */
  activity: string | null
  /** 어느 답을 저장했는지까지 기억한다 — 답마다 그리므로 index 가 없으면 전부에 뜬다 */
  /** 답 남기기 결과 — 남긴 노트의 보관함 경로(`rel`)가 있으면 열 수 있다 */
  saveNote: { index: number; ok: boolean; text: string; rel?: string } | null
  openConversation: (id: string) => void
  newConversation: () => void
  ask: () => void
  stop: () => void
  saveAnswer: (index: number) => void
  /** 변경 카드의 되돌리기 — 진행 중인 카드 id 와 실패 사유를 함께 들고 있다 */
  undoChange: (changeId: string) => void
  undoing: string | null
  undoError: { id: string; text: string } | null
  /** 고친 곳 하나를 되돌린 뒤 main 이 돌려준 카드를 그 답에 입힌다 */
  applyChanges: (changes: ChangeSet) => void
  renameConversation: (id: string, title: string) => void
  removeConversation: (id: string) => void
}

/** 말풍선이 열리기 전에 끝난 답 — 글도 카드도 없다 */
const EMPTY_ANSWER: ChatMessage = { role: 'assistant', text: '', refs: [] }

/** 아직 안 끝난 답 하나 — thinking·text·refs 중 무엇이 먼저 오든 같은 모양으로 연다 */
const openAssistant = (partial: Partial<ViewMessage>): ViewMessage => ({
  role: 'assistant',
  text: '',
  refs: [],
  streaming: true,
  ...partial
})

/**
 * 묵은 토큰을 한 번에 올린다 — 토큰마다 하면 배열 복사·리더 재파싱이 토큰 수만큼 돈다.
 * thinking 이 새 풍선을 열면 text 는 그 풍선에 이어진다(따로 올려도 같은 모양).
 */
const appendStream = (prev: ViewMessage[], thinking: string, text: string): ViewMessage[] => {
  let next = prev
  if (thinking !== '') {
    const last = next.at(-1)
    next =
      last?.role === 'assistant' && last.streaming
        ? [...next.slice(0, -1), { ...last, thinking: (last.thinking ?? '') + thinking }]
        : [...next, openAssistant({ thinking })]
  }
  if (text !== '') {
    const last = next.at(-1)
    next =
      last?.role === 'assistant' && last.streaming
        ? [...next.slice(0, -1), { ...last, text: last.text + text }]
        : [...next, openAssistant({ text })]
  }
  return next
}

export const useChatSession = (): ChatSession => {
  const [conversations, setConversations] = useState<ChatSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ViewMessage[]>([])
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<UserError | null>(null)
  const [lastQuestion, setLastQuestion] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [usage, setUsage] = useState<EngineUsage | null>(null)
  const [compacting, setCompacting] = useState(false)
  // 이벤트 구독은 한 번만 붙는다 — 그 안에서 읽는 값은 state 가 아니라 ref 라야 낡지 않는다
  const usageRef = useRef<EngineUsage | null>(null)
  /** 압축을 걸기 직전의 사용률 — 끝나면 얼마에서 얼마로 줄었는지 말하려고 들고 있다 */
  const compactFrom = useRef<number | null>(null)
  /** 이번 압축을 사용자가 걸었나 — CLI 가 스스로 줄인 것과 문구가 다르다 */
  const myCompact = useRef(false)
  /** 압축 뒤처리 — 표식이 남으면 다음 압축이 내가 건 것으로 읽혀 낡은 수로 보고된다 */
  const clearCompact = useCallback((): void => {
    setCompacting(false)
    myCompact.current = false
    compactFrom.current = null
  }, [])
  const [draft, setDraft] = useState('')
  const [mentions, setMentions] = useState<string[]>([])
  const [images, setImages] = useState<PendingImage[]>([])
  const imagesRef = useRef(images)
  useEffect(() => {
    imagesRef.current = images
  }, [images])
  const [permissionMode, setPermissionMode] = useState<ChatPermissionMode>('ask')
  // 권한 모드의 출발점은 설정이 정한다 — 앱을 껐다 켜도 이어진다. 못 읽으면 물어보기로 둔다
  useEffect(() => {
    const load = window.api.getChatDefaults
    if (typeof load !== 'function') return
    load
      .call(window.api)
      .then((saved) => setPermissionMode(normalizeChatDefaults(saved).permissionMode))
      .catch(() => undefined)
  }, [])
  /**
   * 대화별 대기 중인 승인 요청 — 엔진은 답이 올 때까지 기다리므로(시간 제한도 멈춘다),
   * 뒷 대화의 요청을 버리면 그 실행이 영영 멈춘다. 보이는 카드는 지금 대화 것만이다
   */
  const [pendingByConv, setPendingByConv] = useState<
    Record<string, { id: string; tool: string; target: string }>
  >({})
  const [activity, setActivity] = useState<string | null>(null)
  /** 마지막 질문에 붙였던 문서 — 다시 보내기가 같은 맥락으로 묻는다 */
  const lastContext = useRef<ChatAskContext>({})
  /** 마지막 질문이 main 에 닿았나 — 닿았으면 대화에 이미 있으므로 다시 묻기가 질문을 또 붙이지 않는다 */
  const questionSaved = useRef(false)
  /**
   * 대화별로 다시 답하기가 뗀 앞 답 — 새 답이 실패·멈춤·빈 답이면 main 처럼 되살린다.
   * 저장소는 새 답이 남을 때까지 앞 답을 들고 있으므로, 도는 중에 다시 열면 이것으로 앞 답을 뗀다
   */
  const replacing = useRef(new Map<string, ViewMessage>())
  const [vaultDir, setVaultDir] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState<{
    index: number
    ok: boolean
    text: string
    rel?: string
  } | null>(null)
  const [undoing, setUndoing] = useState<string | null>(null)
  const [undoError, setUndoError] = useState<{ id: string; text: string } | null>(null)
  const activeIdRef = useRef<string | null>(null)
  /** 아직 화면에 안 올린 토큰 — 프레임당 한 번만 올린다. 대화가 바뀌면 버린다(전환 때 저장소에서 읽는다) */
  const streamPending = useRef<{ id: string; thinking: string; text: string } | null>(null)
  const streamFrame = useRef(0)

  /**
   * 묵은 토큰을 지금 올린다 — 비스트림 사건 앞에 둔다. 같은 틱에 뒤 updater 와 함께 묶여
   * 순서대로 적용되므로, done 판정은 합쳐진 화면을 본다. flushSync 로 중간 렌더를
   * 강제하지 않는다 — 강제 커밋은 생각 블록의 열림 상태 같은 렌더-중 조정을 어긋나게 한다
   */
  const flushStream = useCallback((): void => {
    const pending = streamPending.current
    if (pending === null) return
    streamPending.current = null
    setMessages((prev) => appendStream(prev, pending.thinking, pending.text))
  }, [])

  const queueStream = useCallback(
    (id: string, kind: 'thinking' | 'text', delta: string): void => {
      // ref 안의 것을 직접 고치지 않는다 — 새 묶음으로 바꾼다(immutability 규칙)
      const prev = streamPending.current
      const kept = prev !== null && prev.id === id ? prev : null
      const acc = {
        id,
        thinking: (kept?.thinking ?? '') + (kind === 'thinking' ? delta : ''),
        text: (kept?.text ?? '') + (kind === 'text' ? delta : '')
      }
      streamPending.current = acc
      if (streamFrame.current === 0) {
        streamFrame.current = requestAnimationFrame(() => {
          streamFrame.current = 0
          flushStream()
        })
      }
    },
    [flushStream]
  )

  const refreshList = useCallback((): void => {
    window.api
      .listChats()
      .then(setConversations)
      .catch((e: unknown) => setError(toUserError(e, getT().chatView.session.listFailed)))
  }, [])

  // 보관함이 바뀌면 대화를 비운다 — A 목록·글이 B 에 남으면 남의 대화를 읽는 꼴이다.
  // 목록은 다시 읽고, 진행 표시·되돌리기는 버린다(main 이 전환 때 실행을 끊는다).
  // "새 대화" 와는 다르다 — 그쪽은 같은 보관함에서 목록을 도로 읽지 않는다
  const resetForVault = useCallback((): void => {
    setActiveId(null)
    activeIdRef.current = null
    setConversations([])
    setMessages([])
    setRunningIds(new Set())
    setError(null)
    setNotice(null)
    setUsage(null)
    usageRef.current = null
    setCompacting(false)
    setSaveNote(null)
    setUndoing(null)
    setUndoError(null)
    setPendingByConv({})
    setActivity(null)
    replacing.current.clear()
    streamPending.current = null
    if (streamFrame.current !== 0) cancelAnimationFrame(streamFrame.current)
    streamFrame.current = 0
    refreshList()
  }, [refreshList])

  useEffect(() => {
    const load = (): void => {
      window.api
        .getVaultStatus()
        .then((status) => setVaultDir(status.vaultDir))
        // 저장 위치를 모르면 "위키에 담기" 만 못 한다 — 대화는 그대로 쓸 수 있다
        .catch(() => setVaultDir(null))
    }
    load()
    return window.api.onWikiChanged((rels) => {
      if (rels.length === 0) load()
    })
  }, [])

  // 대화는 보관함을 바꾼 때만 비운다 — 커밋마다 오는 빈 묶음에 비우면 쓰던 대화가 사라진다
  useVaultSwitch(resetForVault)

  useEffect(() => refreshList(), [refreshList])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  useEffect(() => {
    const off = window.api.onChatEvent((conversationId, event: ChatEvent) => {
      if (conversationId !== activeIdRef.current) {
        // 뒷 대화의 진행 — done 만 진행 점을 끈다. 텍스트는 전환 때 저장소에서 읽는다.
        // 승인 요청은 버리지 않고 대화별로 들고 있는다 — 버리면 그 실행이 답 없이 영영 기다린다
        if (event.type === 'permission') {
          setPendingByConv((prev) => ({
            ...prev,
            [conversationId]: { id: event.id, tool: event.tool, target: event.target }
          }))
        }
        if (event.type === 'done') {
          replacing.current.delete(conversationId)
          setPendingByConv((prev) => {
            if (!(conversationId in prev)) return prev
            const next = { ...prev }
            delete next[conversationId]
            return next
          })
          setRunningIds((prev) => {
            const next = new Set(prev)
            next.delete(conversationId)
            return next
          })
          // 압축하는 도중 다른 대화로 넘어갔을 수 있다 — 안 풀면 단추가 영영 잠긴다
          clearCompact()
        }
        return
      }
      if (event.type === 'thinking') {
        queueStream(conversationId, 'thinking', event.text)
      } else if (event.type === 'text') {
        queueStream(conversationId, 'text', event.text)
      } else {
        // 토큰이 아닌 사건(refs·done 등)은 묵은 토큰을 먼저 올린다 — 뒤 판정이 합쳐진 화면을 본다
        flushStream()
      }
      if (event.type === 'refs') {
        setMessages((prev) => {
          const last = prev.at(-1)
          if (last?.role === 'assistant' && last.streaming) {
            return [...prev.slice(0, -1), { ...last, refs: event.rels }]
          }
          // 근거는 답이 끝날 때 온다 — 답이 글자 없이 끝났어도(Read 만 하고 멈춤) 버리지 않고 말풍선을 연다
          return [...prev, openAssistant({ refs: event.rels })]
        })
      } else if (event.type === 'changes') {
        setMessages((prev) => withChanges(prev, event.changes))
        // 만든 파일을 바로 보여 준다 — 편집 중이면 쓰던 글을 가리지 않는다
        const created = event.changes.files.find((f) => f.kind === 'created')
        if (created && !event.changes.interrupted) {
          useWorkbench.getState().showChangedFile(created.rel)
        }
      } else if (event.type === 'usage') {
        // 모델은 턴 시작에, 사용률은 턴 끝에 온다. 사용률 자리는 온 그대로 쓴다 — 턴이 시작되면
        // 빈 채로 덮여 앞 턴의 수가 "지금 형편" 인 척하지 않는다(오류·취소로 끝난 턴도 마찬가지).
        // 모델 이름은 알던 것을 지킨다: 턴 끝 줄이 모델을 못 밝혀도 화면이 깜빡이지 않게
        const merged = {
          model: event.usage.model ?? usageRef.current?.model ?? null,
          contextPercent: event.usage.contextPercent
        }
        usageRef.current = merged
        setUsage(merged)
      } else if (event.type === 'compacted') {
        // 압축 뒤에도 위의 대화는 그대로 남는다 — 말해 주지 않으면 다음 답이 앞을 잊은 것이
        // 그 답의 일부처럼 읽힌다(DESIGN.md § AI 한계).
        // CLI 가 스스로 줄인 것과 사용자가 누른 것은 다른 말을 쓴다 — 누른 적 없는 사람에게
        // "압축했다" 는 앱이 제멋대로 한 일로 읽힌다
        const before = compactFrom.current
        const after = usageRef.current?.contextPercent ?? null
        const asked = myCompact.current
        compactFrom.current = null
        myCompact.current = false
        const howMuch =
          asked && before !== null && after !== null
            ? getT().chatView.session.compactedBy(before, after)
            : ''
        setNotice({
          text: asked
            ? getT().chatView.session.compacted(howMuch)
            : getT().chatView.session.compactedByAi,
          at: Date.now()
        })
      } else if (event.type === 'notice') {
        setNotice({ text: event.text, at: Date.now() })
      } else if (event.type === 'tool') {
        setActivity(toolActivity(event.name, event.target))
      } else if (event.type === 'permission') {
        setPendingByConv((prev) => ({
          ...prev,
          [conversationId]: { id: event.id, tool: event.tool, target: event.target }
        }))
      } else if (event.type === 'error') {
        setError(toUserError(event.message, getT().chatView.session.answerFailed))
      } else if (event.type === 'done') {
        const replaced = replacing.current.get(conversationId) ?? null
        replacing.current.delete(conversationId)
        // 다시 답하기는 끝나면 저장소를 다시 읽는다 — main 은 저장한 뒤에 끝을 알리므로 저장소가 최종 모양이다.
        // 아래 판정은 다시 읽기 전까지의 화면이고, 도는 중에 대화를 다시 열어 받은 글이 화면에 없으면 여기서 바로잡힌다
        if (replaced !== null) {
          window.api
            .loadChat(conversationId)
            .then((loaded) => {
              // 그 사이 같은 대화에 다시 답하기가 또 걸렸으면 낡은 모양이다 — 덮지 않는다
              const stale =
                activeIdRef.current !== conversationId || replacing.current.has(conversationId)
              if (!stale) setMessages(loaded?.messages ?? [])
            })
            .catch((e: unknown) => setError(toUserError(e, getT().chatView.session.rereadFailed)))
        }
        setMessages((prev) => {
          const last = prev.at(-1)
          const open = last?.role === 'assistant' && last.streaming ? last : null
          // 다시 답하기의 새 답이 실패·멈춤·빈 답이면 앞 답을 되살린다 — main 의 저장과 같은 규칙(keepsNewAnswer)
          if (replaced !== null && !keepsNewAnswer(open ?? EMPTY_ANSWER, event)) {
            return [...(open === null ? prev : prev.slice(0, -1)), replaced]
          }
          if (last?.role === 'assistant' && last.streaming) {
            // 검색 근거만 담고 답이 못 온 말풍선은 버린다 — 남겨 두면 답 없는 풍선에 실행 카드가 붙는다.
            // main 의 저장 판정(`text !== '' || 시드 밖 refs 있음`, chat-service.ts)과 완전히 같지는 않다:
            // 화면은 시드 여부를 모르는 대신 thinking 을 본다. 갈리는 자리는 "텍스트 0 + Read refs 만" 하나로,
            // main 은 저장하고 화면은 버린다. 그 경우 답이 없는 건 마찬가지라 화면 쪽이 덜 거짓이다.
            if (
              last.text === '' &&
              !event.canceled &&
              (last.thinking ?? '') === '' &&
              last.changes === undefined
            ) {
              return prev.slice(0, -1)
            }
            const final: ViewMessage = {
              ...last,
              text: last.text === '' && event.canceled ? STOPPED_MARK : last.text,
              streaming: undefined
            }
            return [...prev.slice(0, -1), final]
          }
          return prev
        })
        setRunningIds((prev) => {
          const next = new Set(prev)
          next.delete(conversationId)
          return next
        })
        // 멈춤·실패로 끝나면 화면의 승인 카드가 사라진다 — 대기 중 승인은 main 이 버린다
        setPendingByConv((prev) => {
          if (!(conversationId in prev)) return prev
          const next = { ...prev }
          delete next[conversationId]
          return next
        })
        setActivity(null)
        // 실패로 끝난 압축의 수가 남으면, 나중에 CLI 가 스스로 줄였을 때 낡은 수로 보고한다
        clearCompact()
        refreshList()
      }
    })
    return () => {
      if (streamFrame.current !== 0) cancelAnimationFrame(streamFrame.current)
      streamFrame.current = 0
      off()
    }
  }, [refreshList, clearCompact, queueStream, flushStream])

  const openConversation = useCallback((id: string): void => {
    setActiveId(id)
    activeIdRef.current = id
    setError(null)
    setNotice(null)
    setUsage(null)
    usageRef.current = null
    setCompacting(false)
    setSaveNote(null)
    setUndoError(null)
    setActivity(null)
    // 대기 중인 승인은 대화별로 들고 있어 돌아오면 카드가 다시 보인다 — 여기서 비우지 않는다
    window.api
      .loadChat(id)
      .then((loaded) => {
        const messages = loaded?.messages ?? []
        // 다시 답하는 중이면 저장소에는 아직 앞 답이 있다 — 새 답 자리를 비워 둔다
        const replaced = replacing.current.has(id) && lastTurn(messages)?.answer != null
        setMessages(replaced ? messages.slice(0, -1) : messages)
        // 화면을 다시 읽어 잃은 카드도 main 이 들고 있다 — 실행은 아직 답을 기다린다
        const { permission } = loaded ?? {}
        if (permission !== undefined) {
          setPendingByConv((prev) => ({ ...prev, [id]: permission }))
        }
      })
      .catch((e: unknown) => setError(toUserError(e, getT().chatView.session.openFailed)))
  }, [])

  const newConversation = useCallback((): void => {
    setActiveId(null)
    activeIdRef.current = null
    setMessages([])
    setError(null)
    setNotice(null)
    setUsage(null)
    usageRef.current = null
    setCompacting(false)
    setSaveNote(null)
    setActivity(null)
  }, [])

  const running = runningIds.has(activeId ?? '')
  // 한 번만 붙는 콜백이 읽는다 — state 로 읽으면 낡은다
  const runningRef = useRef(runningIds)
  useEffect(() => {
    runningRef.current = runningIds
  }, [runningIds])

  /**
   * 대화 압축 — 확인은 화면이 먼저 받는다. 여기서는 걸기 직전의 사용률만 기억해 두고
   * 끝났을 때 얼마에서 얼마로 줄었는지 말한다. 진행 중인 대화는 main 이 거절한다
   */
  const compact = useCallback((): void => {
    const id = activeIdRef.current
    if (id === null) return
    // 도는 대화에는 걸지 않는다 — 같은 세션에 엔진 실행 둘이 붙는다. main 도 거절하지만,
    // 여기서 막아야 도는 질문의 진행 표시를 압축의 뒤처리가 꺼 버리지 않는다
    if (runningRef.current.has(id)) {
      setError(
        toUserError(getT().chatView.session.compactBusy, getT().chatView.session.compactFailed)
      )
      return
    }
    setError(null)
    setCompacting(true)
    myCompact.current = true
    compactFrom.current = usageRef.current?.contextPercent ?? null
    setRunningIds((prev) => new Set(prev).add(id))
    const give = (reason: unknown): void => {
      // main 이 거절하면 `done` 이 오지 않는다 — 표식을 지우지 않으면 나중에 CLI 가 스스로 줄인
      // 턴에서 내가 건 압축으로 읽혀 낡은 수로 보고한다
      clearCompact()
      setRunningIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setError(toUserError(reason, getT().chatView.session.compactFailed))
    }
    window.api
      .compactChat(id)
      .then((result) => {
        if ('error' in result) give(result.error)
      })
      .catch(give)
  }, [clearCompact])

  const send = useCallback(
    (question: string, context: ChatAskContext, sent: PendingImage[] = []): void => {
      if (question === '') return
      lastContext.current = context
      const imageCount = context.images?.length ?? 0
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          text: question,
          refs: [],
          ...(imageCount > 0 ? { images: imageCount } : {}),
          ...(sent.length > 0 ? { imageUrls: sent.map((image) => image.url) } : {})
        }
      ])
      setError(null)
      setNotice(null)
      setSaveNote(null)
      setLastQuestion(question)
      questionSaved.current = false
      const failed = (e: unknown): void => {
        setError(toUserError(e, getT().chatView.session.askFailed))
        setMessages((prev) => (prev.at(-1)?.role === 'user' ? prev.slice(0, -1) : prev))
        // 보낸 질문은 입력칸에서 지운 뒤다 — 실패하면 되돌려 놓는다.
        // 그 사이 새로 쓴 글이 있으면(드물다) 그걸 지우지 않는다
        setDraft((prev) => (prev === '' ? question : prev))
        const lostMentions = context.mentions ?? []
        if (lostMentions.length > 0) {
          setMentions((prev) => (prev.length === 0 ? lostMentions : prev))
        }
        if (sent.length > 0) setImages((prev) => (prev.length === 0 ? sent : prev))
      }
      window.api
        .askChat(question, activeIdRef.current ?? undefined, context)
        .then((result) => {
          if ('error' in result) {
            failed(result.error)
            return
          }
          const id = result.conversationId
          questionSaved.current = true
          setActiveId(id)
          activeIdRef.current = id
          setRunningIds((prev) => new Set(prev).add(id))
          refreshList()
        })
        .catch(failed)
    },
    [refreshList]
  )

  const ask = useCallback((): void => {
    const question = draft.trim()
    if (question === '' || running) return
    setDraft('')
    setMentions([])
    setImages([])
    send(
      question,
      {
        mentions,
        permissionMode,
        ...(images.length > 0
          ? { images: images.map(({ mediaType, data }) => ({ mediaType, data })) }
          : {})
      },
      images
    )
  }, [draft, mentions, images, permissionMode, running, send])

  const addImages = useCallback((files: File[]): void => {
    void (async () => {
      // 자리가 없는 그림은 읽기 전에 뺀다 — 줄이고 인코딩하는 비용이 크다
      const room = Math.max(0, MAX_CHAT_IMAGES - imagesRef.current.length)
      const read = await Promise.all(files.slice(0, room).map(readImage))
      const ok = read.filter((r): r is PendingImage => !('error' in r))
      const failed = read.find((r): r is { error: string } => 'error' in r)
      // 붙이는 동안 다른 그림이 더해졌을 수 있다 — 지금 수는 ref 로 본다(갱신 함수 안의 값은 늦게 읽힌다)
      const over = files.length > room || imagesRef.current.length + ok.length > MAX_CHAT_IMAGES
      setImages((prev) => [...prev, ...ok].slice(0, MAX_CHAT_IMAGES))
      const reason = over ? imageCountError() : failed?.error
      if (reason !== undefined) setNotice({ text: reason, at: Date.now() })
    })()
  }, [])

  const removeImage = useCallback(
    (id: string): void => setImages((prev) => prev.filter((image) => image.id !== id)),
    []
  )

  /** 대화의 마지막 질문에 새 답을 받는다 — 질문 말풍선은 더하지 않고, 지운 답은 거절되면 되살린다 */
  const answerAgain = useCallback(
    (context: ChatAskContext): void => {
      const turn = lastTurn(messages)
      if (activeId === null || turn === null || running) return
      const id = activeId
      const dropped = turn.answer
      if (dropped !== null)
        setMessages((prev) => (prev.at(-1) === dropped ? prev.slice(0, -1) : prev))
      lastContext.current = context
      setLastQuestion(turn.question)
      questionSaved.current = true
      if (dropped !== null) replacing.current.set(id, dropped)
      setError(null)
      setNotice(null)
      setSaveNote(null)
      setRunningIds((prev) => new Set(prev).add(id))
      const failed = (e: unknown): void => {
        setError(toUserError(e, getT().chatView.session.regenerateFailed))
        setRunningIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        replacing.current.delete(id)
        if (dropped !== null) setMessages((prev) => [...prev, dropped])
      }
      window.api
        .regenerateChat(id, context)
        .then((result) => {
          if ('error' in result) failed(result.error)
        })
        .catch(failed)
    },
    [activeId, messages, running]
  )

  const retry = useCallback((): void => {
    if (lastQuestion === null || running) return
    // 답이 실패한 질문은 이미 대화에 있다 — 다시 보내면 같은 질문이 두 번 남는다.
    // 보내기부터 거절됐으면 대화에 없다: 글이 앞 질문과 같아도 앞 답을 지우지 않고 새로 보낸다
    if (
      activeId !== null &&
      questionSaved.current &&
      lastTurn(messages)?.question === lastQuestion
    ) {
      answerAgain(lastContext.current)
    } else {
      send(lastQuestion, lastContext.current)
    }
  }, [activeId, answerAgain, lastQuestion, messages, running, send])

  const turn = lastTurn(messages)
  const canRegenerate =
    activeId !== null &&
    !running &&
    turn?.answer != null &&
    turn.answer.streaming !== true &&
    !keepsFiles(turn.answer)
  // 붙였던 문서는 다시 싣지 않는다 — 같은 CLI 세션에 이어서 물으면 그 문서는 이미 세션에 있다.
  // 세션이 사라져 새로 물을 때는 질문만 간다(chat-service 의 세션 만료 재시도)
  const regenerate = useCallback(
    (): void => answerAgain({ permissionMode }),
    [answerAgain, permissionMode]
  )

  const stop = useCallback((): void => {
    if (activeId === null) return
    window.api
      .stopChat(activeId)
      .catch((e: unknown) => setError(toUserError(e, getT().chatView.session.stopFailed)))
  }, [activeId])

  const saveAnswer = useCallback(
    (index: number): void => {
      if (!vaultDir || !activeId) return
      // 답은 보관함 규칙대로 outputs/ 의 질의 답 노트로 남긴다 — 위키화 입력함(Clippings)은 바깥 자료 자리다
      window.api
        .saveChatAnswer({
          vaultDir,
          question: messages[index - 1]?.text ?? '',
          answer: messages[index]?.text ?? '',
          refs: messages[index]?.refs ?? []
        })
        .then((result) =>
          setSaveNote(
            result.ok
              ? {
                  index,
                  ok: true,
                  text: getT().chatView.session.saved,
                  rel: `outputs/${result.path.split(/[\\/]/).pop()}`
                }
              : {
                  index,
                  ok: false,
                  text: toUserError(result.reason, getT().chatView.session.saveFailed).text
                }
          )
        )
        .catch((e: unknown) =>
          setSaveNote({
            index,
            ok: false,
            text: toUserError(e, getT().chatView.session.saveFailed).text
          })
        )
    },
    [activeId, messages, vaultDir]
  )

  const undoChange = useCallback(
    (changeId: string): void => {
      if (!activeId || undoing !== null) return
      const conversationId = activeId
      setUndoing(changeId)
      setUndoError(null)
      window.api
        .undoNoteChange(conversationId, changeId)
        .then((result) => {
          if (activeIdRef.current !== conversationId) return
          if (result.ok) {
            setMessages((prev) => withChanges(prev, result.changes))
            return
          }
          setUndoError({
            id: changeId,
            text: toUserError(result.reason, getT().chatView.session.undoFailed).text
          })
          // 기록이 지워졌으면 카드가 그 사실을 보이게 main 이 표시해 뒀다 — 다시 읽는다
          window.api
            .loadChat(conversationId)
            .then((loaded) => {
              if (loaded && activeIdRef.current === conversationId) setMessages(loaded.messages)
            })
            .catch((e: unknown) => setError(toUserError(e, getT().chatView.session.rereadFailed)))
        })
        .catch((e: unknown) =>
          setUndoError({
            id: changeId,
            text: toUserError(e, getT().chatView.session.undoFailed).text
          })
        )
        .finally(() => setUndoing(null))
    },
    [activeId, undoing]
  )

  const applyChanges = useCallback(
    (changes: ChangeSet): void => setMessages((prev) => withChanges(prev, changes)),
    []
  )

  const renameConversation = useCallback(
    (id: string, title: string): void => {
      window.api
        .renameChat(id, title)
        .then((ok) => {
          if (ok) refreshList()
          else setError(toUserError('', getT().chatView.session.renameFailed))
        })
        .catch((e: unknown) => setError(toUserError(e, getT().chatView.session.renameFailed)))
    },
    [refreshList]
  )

  const removeConversation = useCallback(
    (id: string): void => {
      window.api
        .removeChat(id)
        .then((ok) => {
          if (!ok) {
            setError(toUserError('', getT().chatView.session.removeFailed))
            return
          }
          setRunningIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
          if (activeIdRef.current === id) newConversation()
          refreshList()
        })
        .catch((e: unknown) => setError(toUserError(e, getT().chatView.session.removeFailed)))
    },
    [newConversation, refreshList]
  )

  const answerPermission = useCallback(
    (answer: ChatPermissionAnswer): void => {
      const id = activeIdRef.current
      if (id === null) return
      const pending = pendingByConv[id]
      if (pending === undefined) return
      setPendingByConv((prev) => {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })
      window.api.answerChatPermission(id, pending.id, answer).catch((e: unknown) => {
        // main 에 닿지 않았으면 엔진이 계속 기다린다 — 카드를 되살려 다시 누를 수 있게 한다
        setPendingByConv((prev) => ({ ...prev, [id]: pending }))
        setError(toUserError(e, getT().chatView.session.permissionFailed))
      })
    },
    [pendingByConv]
  )

  /** 보이는 승인 카드 — 지금 대화의 대기 요청 하나. 뒷 대화의 요청은 돌아오면 보인다 */
  const pendingPermission = activeId ? (pendingByConv[activeId] ?? null) : null

  return {
    conversations,
    activeId,
    activeTitle: conversations.find((c) => c.id === activeId)?.title,
    messages,
    runningIds,
    running,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    notify: (text: string) => setNotice({ text, at: Date.now() }),
    tooLong: messages.length >= LONG_CONVERSATION_TURNS,
    usage,
    compact,
    compacting,
    retry: lastQuestion !== null && !running ? retry : null,
    regenerate: canRegenerate ? regenerate : null,
    draft,
    setDraft,
    mentions,
    setMentions,
    images,
    addImages,
    removeImage,
    permissionMode,
    setPermissionMode,
    pendingPermission,
    answerPermission,
    activity,
    saveNote,
    openConversation,
    newConversation,
    ask,
    stop,
    saveAnswer,
    undoChange,
    undoing,
    applyChanges,
    undoError,
    renameConversation,
    removeConversation
  }
}

/**
 * 변경 카드를 붙인다 — 같은 id 카드가 있으면 그 자리를 바꾸고(되돌리기 결과), 도는 답이 있으면 거기에,
 * 없으면(앱 시작 때 마무리한 끊긴 실행) 새 답으로 붙인다
 */
export const withChanges = (prev: ViewMessage[], changes: ChangeSet): ViewMessage[] => {
  const index = prev.findIndex((m) => m.changes?.id === changes.id)
  if (index >= 0) return prev.map((m, i) => (i === index ? { ...m, changes } : m))
  const last = prev.at(-1)
  if (last?.role === 'assistant' && last.streaming) {
    return [...prev.slice(0, -1), { ...last, changes }]
  }
  return [...prev, { role: 'assistant', text: '', refs: [], changes }]
}
