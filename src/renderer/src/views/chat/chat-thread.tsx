// 대화 컨테이너 — 세션·입력 상태·스크롤·자료 넣기. 그리기는 메시지 목록과 입력칸이 맡는다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AddResult } from '../../../../shared/ipc-contract'
import { vaultFileIndex } from '../../lib/chat-paths'
import { useWorkbench } from '../../store/workbench'
import { toUserError } from '../../lib/user-error'
import { useChat } from './chat-context'
import { useComposerAssist } from './composer-assist'
import { ChatMessageList } from './chat-message-list'
import { ChatComposer } from './chat-composer'
import { getT } from '../../lib/i18n'

const nearBottom = (el: HTMLElement): boolean =>
  el.scrollHeight - el.scrollTop - el.clientHeight < 48

export const ChatThread = (): React.JSX.Element => {
  const chat = useChat()
  const { messages } = chat
  // 무거워졌다는 신호는 둘이지만 알림은 하나다 — 같은 문제에 넛지를 두 개 만들지 않는다.
  // 턴 수는 앱이 세고, 찬 정도는 엔진이 알려 온다(둘 다 없을 수도 있다 — codex)
  const heavy = chat.tooLong || (chat.usage?.contextPercent ?? 0) > 75
  const openFile = useWorkbench((s) => s.openFile)
  // 답 본문의 보관함 경로를 눌러 여는 데 쓴다. 트리는 파일이 바뀔 때마다 새 배열로 온다 — 경로 목록이
  // 같으면 같은 표를 쥔다. 새 표를 주면 답 렌더러의 memo 가 깨져 지난 답 전부가 다시 그려진다
  const tree = useWorkbench((s) => s.tree)
  const fileKey = useMemo(
    () =>
      tree === null
        ? null
        : tree
            .filter((entry) => entry.kind === 'file')
            .map((entry) => entry.rel)
            .join('\0'),
    [tree]
  )
  const vaultFiles = useMemo(
    () =>
      fileKey === null ? undefined : vaultFileIndex(fileKey === '' ? [] : fileKey.split('\0')),
    [fileKey]
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatFocusAt = useWorkbench((s) => s.chatFocusAt)
  const showMeters = useWorkbench((s) => s.uiPrefs.showChatMeters)
  const [dragOver, setDragOver] = useState(false)
  // 압축은 되돌릴 수 없고 사용량을 쓴다 — 누른 즉시 실행하지 않고 무엇이 일어나는지 먼저 말한다
  const [compactAsk, setCompactAsk] = useState(false)
  const [clipNote, setClipNote] = useState<{ text: string; ok: boolean } | null>(null)
  // 주소만 붙여 넣었다 — 묻는 말일 수도 있어 바로 넣지 않고 "자료로 넣기" 를 권한다
  const [pastedUrl, setPastedUrl] = useState<string | null>(null)
  const requestIngest = useWorkbench((s) => s.requestIngest)
  const newConversation = chat.newConversation
  const assist = useComposerAssist({ chat, inputRef })
  // 맨 아래를 보고 있을 때만 따라 내려간다 — 옆 칸은 계속 떠 있어서, 위를 읽는 중에
  // 뒤 대화의 답이 들어오면 읽던 자리를 빼앗긴다. 대신 "맨 아래로" 단추가 새 글이 왔다고 알린다
  const stick = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  // 맨 아래를 떠날 때 보고 있던 메시지 — 그 뒤로 바뀌었으면 안 읽은 글이 있다. 떠날 때만 찍는다:
  // 맨 아래에서 스크롤마다 찍으면 스트리밍 토큰마다 렌더가 한 번 더 돈다.
  // 배열 자체가 아니라 길이+마지막 글만 찍는다 — 긴 대화의 글 전체를 두 벌 들고 있지 않게.
  // 마지막 글까지 보는 이유: 토큰이 같은 글에 이어질 때도 새 글이 온 것으로 쳐야 "맨 아래로"가 뜬다
  const [leftAt, setLeftAt] = useState({
    length: messages.length,
    last: messages[messages.length - 1]
  })
  const unread =
    !atBottom &&
    (messages.length !== leftAt.length || messages[messages.length - 1] !== leftAt.last)
  const seen = useRef({ id: chat.activeId, length: messages.length })

  useEffect(() => {
    const el = scrollRef.current
    // 대화를 바꿨거나 내가 물었으면 읽던 자리보다 지금 대화가 먼저다 — 맨 아래로 간다
    const before = seen.current
    const asked =
      messages.length > before.length &&
      messages.slice(before.length).some((m) => m.role === 'user')
    seen.current = { id: chat.activeId, length: messages.length }
    // 맨 아래를 따라가는 일 자체는 아래 ResizeObserver 가 한다 — 여기서는 끌어내릴 때만 움직인다
    if (chat.activeId !== before.id || asked) {
      stick.current = true
      el?.scrollTo({ top: el.scrollHeight })
    }
  }, [messages, chat.activeId])

  // 메시지가 그대로여도 키가 바뀐다 — 다이어그램이 늦게 그려지거나 입력칸이 자라면 맨 아래가 밀린다
  useEffect(() => {
    const el = scrollRef.current
    const content = el?.firstElementChild
    if (!el || !content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTo({ top: el.scrollHeight })
      else setAtBottom(nearBottom(el))
    })
    observer.observe(el)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const scrollToBottom = (): void => {
    stick.current = true
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  /** 내 질문을 입력칸에 다시 올린다 — 고쳐서 새로 묻는다. 지난 대화는 그대로 남는다 */
  const editQuestion = (text: string): void => {
    chat.setDraft(text)
    inputRef.current?.focus()
  }

  // ⌘J·오늘 띠·다른 화면의 "묻기" 가 부르면 입력칸이 초점을 가져간다. 보이는 쪽만 반응한다
  useEffect(() => {
    if (chatFocusAt === 0) return
    const el = inputRef.current
    if (el && el.offsetParent !== null) el.focus()
  }, [chatFocusAt])

  // 자료를 넣으려고 대화를 떠나지 않게 한다 — 자료 탭의 clipFile 을 그대로 쓴다
  const addFiles = async (files: File[]): Promise<void> => {
    if (files.length === 0) return
    setClipNote({ text: getT().chatView.thread.adding(files.length), ok: false })
    let ok = 0
    let failure: string | null = null
    for (const file of files) {
      const result = await window.api
        .clipFile(window.api.filePathForFile(file))
        .catch((error: unknown): AddResult => ({
          ok: false,
          reason: toUserError(error, getT().sources.clip.failed).text
        }))
      if (result.ok) ok += 1
      else failure = toUserError(result.reason, getT().chatView.thread.fileFailed(file.name)).text
    }
    setClipNote(
      ok > 0
        ? {
            text: getT().chatView.thread.added(ok),
            ok: true
          }
        : failure === null
          ? null
          : { text: failure, ok: false }
    )
  }

  const addUrl = async (url: string): Promise<void> => {
    setPastedUrl(null)
    setClipNote({ text: getT().chatView.thread.fetchingUrl, ok: false })
    const result = await window.api.clipUrl(url).catch((error: unknown): AddResult => ({
      ok: false,
      reason: toUserError(error, getT().sources.clip.failed).text
    }))
    if (!result.ok) {
      setClipNote({
        text: toUserError(result.reason, getT().chatView.thread.urlFailed).text,
        ok: false
      })
      return
    }
    // 주소만 적힌 입력은 넣기로 할 일을 다 했다 — 그대로 두면 Enter 한 번에 주소를 질문으로 보낸다
    if (chat.draft.trim() === url) chat.setDraft('')
    setClipNote({
      text: getT().chatView.thread.added(1),
      ok: true
    })
  }

  const lastAssistant = messages.findLastIndex((m) => m.role === 'assistant')

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="chat-thread">
      <ChatMessageList
        chat={chat}
        lastAssistant={lastAssistant}
        onEditQuestion={editQuestion}
        onOpenFile={openFile}
        vaultFiles={vaultFiles}
        inputRef={inputRef}
        scrollRef={scrollRef}
        atBottom={atBottom}
        unread={unread}
        onScroll={(e) => {
          const bottom = nearBottom(e.currentTarget)
          if (!bottom && stick.current)
            setLeftAt({ length: messages.length, last: messages[messages.length - 1] })
          stick.current = bottom
          setAtBottom(bottom)
        }}
        onScrollToBottom={scrollToBottom}
      />

      <ChatComposer
        chat={chat}
        assist={assist}
        heavy={heavy}
        newConversation={newConversation}
        pastedUrl={pastedUrl}
        onAddUrl={(url) => void addUrl(url)}
        onDismissUrl={() => setPastedUrl(null)}
        onPasteUrl={setPastedUrl}
        clipNote={clipNote}
        onRequestIngest={requestIngest}
        dragOver={dragOver}
        onDragOver={setDragOver}
        onDropFiles={(files) => void addFiles(files)}
        inputRef={inputRef}
        pickerRef={picker}
        showMeters={showMeters}
        compactAsk={compactAsk}
        onCompactAsk={setCompactAsk}
      />
    </div>
  )
}
