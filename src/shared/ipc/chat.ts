import type { EngineUsage } from './engine'
import type { ChatPermissionAnswer, ChatPermissionMode } from '../chat-permission'
import { currentT } from '../i18n'

export const APP_CHANNELS_CHAT = {
  askChat: 'chat:ask',
  stopChat: 'chat:stop',
  listChatSkills: 'chat:skills',
  compactChat: 'chat:compact',
  regenerateChat: 'chat:regenerate',
  answerChatPermission: 'chat:permission',
  chatEvent: 'chat:event',
  listChats: 'chat:list',
  loadChat: 'chat:load',
  renameChat: 'chat:rename',
  removeChat: 'chat:remove',
  saveChatToWiki: 'chat:save-wiki',
  saveChatAnswer: 'chat:save-answer',
  undoNoteChange: 'chat:undo-note',
  changeReview: 'chat:change-review',
  rejectChangeHunk: 'chat:reject-hunk',
  inlineEdit: 'chat:inline-edit',
  cancelInlineEdit: 'chat:inline-edit-cancel',
  docChanges: 'note:doc-changes'
} as const

export type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
  refs: string[]
  /** 답에 딸린 생각 블록 — 채팅에서 접어 보인다 */
  thinking?: string
  /** 이 답이 보관함에 만들고 고친 파일 — 예전 대화 파일에는 없다 */
  changes?: ChangeSet
  /** 질문에 붙인 그림 수 — 그림 자체는 저장하지 않는다 */
  images?: number
}

/** 채팅 한 번이 남긴 파일 하나. `state` 는 되돌리기 결과 */
export type ChangeFile = {
  rel: string
  kind: 'created' | 'edited'
  /** git 이 추적하는 파일인가 — 추적 파일은 커밋으로, 아니면 스냅샷으로 되돌린다 */
  tracked: boolean
  /** 실행 직후 내용의 sha256 — 되돌리기 전 사람이 고쳤는지 본다 */
  afterHash: string
  state?: 'undone' | 'kept'
}

/** 채팅 쓰기 한 번의 결과(변경 카드) */
export type ChangeSet = {
  id: string
  files: ChangeFile[]
  /** 막거나 되돌린 것 — 사람이 읽을 한 줄씩 */
  blocked: string[]
  /** 앱이 실행 중에 꺼져 다음 시작에 마무리했다 */
  interrupted?: boolean
  /** 되돌리기를 마쳤다 — 다시 눌러도 아무 일도 하지 않는다 */
  undone?: boolean
  /** 보존 기한이 지나 되돌릴 기록이 없다 */
  pruned?: boolean
}

export type UndoResult = { ok: true; changes: ChangeSet } | { ok: false; reason: string }

/** 채팅이 고친 파일의 고친 곳 하나 — `line` 은 지금 문서에서 시작하는 줄(1부터) */
export type ChangeHunk = { line: number; removed: string[]; added: string[] }

/** 고친 곳 검토 — 답이 쓴 그대로일 때만 고친 곳별로 되돌릴 수 있다. `hash` 는 견준 내용의 sha256 */
export type HunkReview = { hunks: ChangeHunk[]; hash: string } | { unavailable: string }

/** 편집기에서 고른 글을 AI 로 고치기 — 앞뒤 글은 맥락으로만 싣는다 */
export type InlineEditRequest = {
  rel: string
  before: string
  selection: string
  after: string
  instruction: string
}

/** 고친 글 제안 — 파일은 쓰지 않는다. 넣을지는 사람이 편집기에서 정한다 */
export type InlineEditResult = { text: string } | { error: string }

export type HunkRejectResult =
  { ok: true; changes: ChangeSet; review: HunkReview } | { ok: false; reason: string }

/** "바뀐 곳" 의 기준 시점 — 이번 답 / 오늘 아침 / 어제 아침 */
export type ChangeSince = { change: string } | 'today' | 'yesterday'

/** 기준 이후 바뀐 곳. 줄 번호는 그 문서 원문 기준(1-based) */
export type DocChanges = {
  /** 더하거나 고친 줄 범위 */
  added: { from: number; to: number }[]
  /** 지운 글 — `after` 줄 뒤에 있던 내용 */
  removed: { after: number; text: string }[]
  /** 견준 문서 내용의 sha256 — 리더가 그리는 것과 같은 내용인지 가린다(`WikiReadResult.hash` 와 같은 값) */
  hash: string
}

/** 기준 시점의 기록이 없으면 그 이유 한 줄 */
export type DocChangesResult = DocChanges | { unavailable: string }

/**
 * 견주는 사이에 문서가 바뀌었다 — main(견준 뒤 내용 확인)과 리더(받은 해시 확인)가 같은 일을
 * 각자 잡는다. 사람에게는 한 가지 일이므로 문장도 하나다
 */
export const changedMidway = (): string => currentT().wiki.changedMidway

export type ChatEvent =
  | { type: 'text'; text: string }
  /** 답이 아니라 앱이 알리는 것(세션이 끊겨 새로 물었다 등) — 답 본문과 섞지 않는다 */
  | { type: 'notice'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'refs'; rels: string[] }
  /** 엔진이 알려 온 모델·컨텍스트 — 컴포저 아래 지표 줄이 읽는다 */
  | { type: 'usage'; usage: EngineUsage }
  /** 답이 오는 동안 쓰는 도구 한 줄 — 답이 끝나면 사라진다 */
  | { type: 'tool'; name: string; target: string }
  /** 엔진이 이 도구를 써도 되는지 묻는다 — 승인 카드로 답할 때까지 실행이 기다린다 */
  | { type: 'permission'; id: string; tool: string; target: string }
  /** 대화를 압축했다 — 앞부분이 요약으로 바뀐 지점 */
  | { type: 'compacted' }
  /** 이 답이 쓴 파일과 막은 것 — 실행이 끝난 뒤 한 번 */
  | { type: 'changes'; changes: ChangeSet }
  | { type: 'error'; message: string }
  | { type: 'done'; ok: boolean; canceled: boolean }

/** 화면의 답을 기다리는 승인 요청 — 승인 카드 하나 */
export type ChatPermissionRequest = { id: string; tool: string; target: string }

export type ChatSummary = { id: string; title: string; updatedAt: number }

export type SaveChatPayload = {
  vaultDir?: string
  conversationId: string
  question: string
  answer: string
  /** 저장 출처 — 기본 chat:<conversationId> */
  source?: string
}

export type SaveAnswerPayload = {
  vaultDir?: string
  question: string
  answer: string
  /** 답이 근거로 쓴 보관함 문서 */
  refs: string[]
}

export type SaveResult = { ok: true; path: string } | { ok: false; reason: string }

/** 채팅 `/` 목록의 한 줄 — 사용자의 Claude 스킬. 설명은 사용자·보관함 스킬만 있다 */
export type ChatSkill = { name: string; description?: string }

/** 질문에 붙인 그림 — 엔진이 받는 네 형식, base64 본문(`data:` 머리 없이) */
export type ChatImage = {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  data: string
}

/** 채팅 질문에 붙이는 문서 — 보관함 상대경로 */
export type ChatAskContext = {
  /** 입력칸에 붙여 넣은 그림 */
  images?: ChatImage[]
  /** 입력칸에서 `@` 로 고른 문서 */
  mentions?: string[]
  /** 입력칸의 권한 모드 — 세 값이 아니면 물어보기다 */
  permissionMode?: ChatPermissionMode
}

export interface AppApiChat {
  /** 채팅 질문 — 새 대화이거나 기존 대화 id. 붙인 문서의 본문은 main 이 읽어 싣는다 */
  askChat(
    question: string,
    conversationId?: string,
    context?: ChatAskContext
  ): Promise<{ conversationId: string } | { error: string }>
  stopChat(conversationId: string): Promise<void>
  /** `/` 를 치면 뜨는 스킬 목록 — Claude 만 있다(Codex 는 빈 목록). 처음에는 CLI 를 한 번 띄워 받는다 */
  listChatSkills(): Promise<ChatSkill[] | { error: string }>
  /**
   * 대화 압축 — 이어가던 세션의 앞부분을 요약으로 바꾼다. 되돌릴 수 없고 사용량을 한 번 쓴다.
   * 실제로 가벼워졌는지는 `compacted` 이벤트가 왔는지로 안다
   */
  compactChat(conversationId: string): Promise<{ ok: true } | { error: string }>
  /**
   * 다시 답하기 — 마지막 답을 지우고 같은 질문에 새 답을 받는다. 답은 `chatEvent` 로 온다.
   * 답이 실패해 질문으로 끝났으면 지울 것 없이 다시 묻는다. `context` 는 그 질문에 붙였던 문서
   */
  regenerateChat(
    conversationId: string,
    context?: ChatAskContext
  ): Promise<{ ok: true } | { error: string }>
  /** 승인 카드의 답 — 대기 중인 요청이 아니면 아무 일도 하지 않는다 */
  answerChatPermission(
    conversationId: string,
    requestId: string,
    answer: ChatPermissionAnswer
  ): Promise<void>
  /** 볼트별 대화 목록 — 최근순 (슬라이스 11) */
  listChats(): Promise<ChatSummary[]>
  /** 대화 메시지 복원 */
  loadChat(
    conversationId: string
  ): Promise<{ messages: ChatMessage[]; permission?: ChatPermissionRequest } | null>
  renameChat(conversationId: string, title: string): Promise<boolean>
  removeChat(conversationId: string): Promise<boolean>
  /** 바깥에서 온 글(첫 실행 샘플)을 위키화 입력함(Clippings)에 담는다 */
  saveChatToWiki(payload: SaveChatPayload): Promise<SaveResult>
  /** 채팅 답을 `outputs/` 의 질의 답 노트로 남긴다 — 위키화 입력함이 아니다(보관함 규칙) */
  saveChatAnswer(payload: SaveAnswerPayload): Promise<SaveResult>
  /** 채팅이 쓴 파일을 되돌린다 — 그 뒤 사람이 고친 파일은 두고 state 로 알린다 */
  undoNoteChange(conversationId: string, changeId: string): Promise<UndoResult>
  /** 채팅이 고친 파일 하나를 고친 곳으로 나눠 본다 */
  changeReview(conversationId: string, changeId: string, rel: string): Promise<HunkReview>
  /** 고른 글을 지시대로 고친 제안 하나 — 한 번에 하나만 돈다 */
  inlineEdit(request: InlineEditRequest): Promise<InlineEditResult>
  cancelInlineEdit(): Promise<void>
  /** 고친 곳 하나만 되돌린다 — `hash` 는 검토에서 받은 값(그 사이 문서가 바뀌었으면 막는다) */
  rejectChangeHunk(
    conversationId: string,
    changeId: string,
    rel: string,
    index: number,
    hash: string
  ): Promise<HunkRejectResult>
  /** 기준 시점 이후 이 문서에서 바뀐 줄 — 리더의 "바뀐 곳" */
  docChanges(rel: string, since: ChangeSince): Promise<DocChangesResult>
  /** 채팅 스트리밍 이벤트 푸시. 반환 함수로 해제한다. */
  onChatEvent(listener: (conversationId: string, event: ChatEvent) => void): () => void
}
