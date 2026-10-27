// 대화 목록 — 환영·질문·답·맨 아래로 단추. 상태는 컨테이너가 들고 props 로만 받는다.
import { type RefObject } from 'react'
import { ArrowDown, BookmarkPlus, CornerDownRight, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { CopyButton } from '../../components/copy-button'
import { ChatMarkdown } from '../../lib/chat-markdown'
import type { VaultFileIndex } from '../../lib/chat-paths'
import { shortLabel } from '../../lib/vault-path'
import { openExternal } from '../../lib/open-external'
import { cn } from '../../lib/utils'
import type { ChatSession } from './use-chat-session'
import { ChangeCard } from './change-card'
import { ActionCards, RefChips, TypingDots } from './chat-message-parts'
import { PermissionCard } from './permission-card'
import { ImageZoom } from './image-zoom'
import { useT } from '../../lib/i18n'
import { STOPPED_MARK } from '../../../../shared/chat-turn'

/** 메시지 아래 단추 줄의 아이콘 단추 — 글자 단추와 높이를 맞춘다 */
const iconAction =
  'focus-ring tactile inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5'

export const ChatMessageList = ({
  chat,
  lastAssistant,
  onEditQuestion,
  onOpenFile,
  vaultFiles,
  inputRef,
  scrollRef,
  atBottom,
  unread,
  onScroll,
  onScrollToBottom
}: {
  chat: ChatSession
  lastAssistant: number
  onEditQuestion: (text: string) => void
  onOpenFile: (rel: string) => void
  /** 보관함 파일 찾기 표 — 답 본문의 경로를 눌러 여는 데 쓴다. 목록을 아직 못 읽었으면 없다 */
  vaultFiles: VaultFileIndex | undefined
  inputRef: RefObject<HTMLTextAreaElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  atBottom: boolean
  unread: boolean
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
  onScrollToBottom: () => void
}): React.JSX.Element => {
  const t = useT()
  const { messages, running } = chat
  const last = messages.at(-1)
  // 답 풍선은 첫 글자·생각이 와야 열린다 — 그 전에도 답을 기다리는 중임을 점 셋으로 보인다
  const awaiting = running && !(last?.role === 'assistant' && last.streaming === true)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-label={t.chatView.messages.scroll}
        className="scrollbar-thin focus-ring min-h-0 flex-1 overflow-y-auto"
      >
        {/* 답을 쓰는 동안은 바쁨으로 묶어 두고, 다 쓴 뒤 한 번에 읽힌다 — 글자마다 읽어 주지 않는다 */}
        <div
          role="log"
          aria-label={t.chatView.messages.log}
          aria-busy={running}
          className="flex flex-col gap-6 px-3 py-5"
        >
          {messages.length === 0 && !running && (
            <div className="flex flex-col gap-1 px-1 pt-8" data-testid="chat-welcome">
              <p className="animate-in fade-in slide-in-from-bottom-1 text-title duration-200 fill-mode-both">
                {t.chatView.messages.welcome}
              </p>
              <p className="animate-in fade-in slide-in-from-bottom-1 text-callout text-muted-foreground delay-75 duration-200 fill-mode-both">
                {t.chatView.messages.welcomeBody}
              </p>
              {/* 칩은 보내지 않고 입력칸에 채운다 — 보이고, 고칠 수 있고, Enter 한 번이면 간다(DESIGN.md) */}
              <ul className="mt-4 flex flex-col" data-testid="chat-examples">
                {t.chatActions.examples.map((example, n) => (
                  <li
                    key={example}
                    className="animate-in fade-in slide-in-from-bottom-2 duration-200 fill-mode-both"
                    style={{ animationDelay: `${120 + n * 40}ms` }}
                  >
                    <button
                      type="button"
                      data-testid="chat-example"
                      onClick={() => onEditQuestion(example)}
                      className="focus-ring group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-start text-callout text-label transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <CornerDownRight
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary-ink"
                      />
                      <span className="min-w-0 flex-1 truncate">{example}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((message, i) => {
            if (message.role === 'user') {
              return (
                <div
                  key={i}
                  className="group/message flex animate-in items-start justify-end gap-1 fade-in slide-in-from-bottom-1 duration-150"
                  data-testid="chat-message-user"
                >
                  {/* 손이 갈 때만 보인다 — 늘 떠 있으면 질문마다 단추가 줄을 선다 */}
                  <div className="mt-1.5 flex opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
                    <button
                      type="button"
                      aria-label={t.chatView.messages.edit}
                      title={t.chatView.messages.editHint}
                      data-testid="chat-edit"
                      onClick={() => onEditQuestion(message.text)}
                      className={iconAction}
                    >
                      <Pencil aria-hidden />
                    </button>
                    <CopyButton
                      text={message.text}
                      label={t.chatView.messages.copy}
                      testId="chat-copy-question"
                      className={iconAction}
                    />
                  </div>
                  <div className="flex max-w-[85%] min-w-0 flex-col items-end gap-1.5">
                    {message.imageUrls !== undefined ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {message.imageUrls.map((url, n) => (
                          <ImageZoom
                            key={n}
                            src={url}
                            alt={t.chatView.images.pasted(n + 1)}
                            testId="chat-message-image-open"
                          >
                            <img
                              src={url}
                              alt=""
                              data-testid="chat-message-image"
                              className="max-h-40 max-w-48 rounded-lg border border-hairline object-cover"
                            />
                          </ImageZoom>
                        ))}
                      </div>
                    ) : (
                      (message.images ?? 0) > 0 && (
                        <span
                          className="text-caption text-muted-foreground"
                          data-testid="chat-message-image-count"
                        >
                          {t.chatView.images.count(message.images ?? 0)}
                        </span>
                      )
                    )}
                    <div className="min-w-0 rounded-2xl bg-accent px-4 py-2.5 text-body break-words whitespace-pre-wrap select-text">
                      {message.text}
                    </div>
                  </div>
                </div>
              )
            }
            const streaming = message.streaming === true
            // 글 없이 멈춘 답은 저장 표식으로 온다 — 화면 언어의 말로 보인다
            const answer =
              message.text === STOPPED_MARK ? t.chatView.messages.stopped : message.text
            // 마지막 답과 방금 남긴 답의 단추는 늘 보이고, 지난 답은 손이 갈 때만 보인다
            const pinned = i === lastAssistant || chat.saveNote?.index === i
            return (
              <div
                key={i}
                className="group/message flex min-w-0 animate-in flex-col gap-3 fade-in slide-in-from-bottom-1 duration-150"
                data-testid={streaming ? 'chat-streaming' : 'chat-message-assistant'}
              >
                {/* 답은 markdown·수식·다이어그램으로 — 글자가 오기 전에도 생각 블록은 보인다 */}
                {streaming && message.text === '' && !message.thinking ? (
                  <TypingDots />
                ) : (
                  <ChatMarkdown
                    text={answer}
                    thinking={message.thinking}
                    streaming={streaming}
                    onOpenExternal={openExternal}
                    vaultFiles={vaultFiles}
                    onOpenFile={onOpenFile}
                  />
                )}
                {streaming && message.text !== '' && (
                  <span
                    aria-hidden
                    className="-mt-2 size-2 animate-pulse rounded-full bg-muted-foreground"
                  />
                )}
                <RefChips rels={message.refs} />
                {message.changes && <ChangeCard changes={message.changes} />}
                {!streaming && <ActionCards question={messages[i - 1]?.text ?? ''} />}
                {!streaming && (
                  <div
                    className={cn(
                      '-mt-1 -ml-1.5 flex flex-wrap items-center gap-0.5 transition-opacity',
                      !pinned &&
                        'opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100'
                    )}
                  >
                    <CopyButton
                      text={answer}
                      label={t.chatView.messages.copy}
                      testId="chat-copy"
                      className={iconAction}
                    />
                    {/* 마지막 답만 — 그 앞의 답을 바꾸면 뒤의 질문이 엉뚱한 답에 걸린다.
                        오류 줄의 다시 묻기가 같은 일을 하면 그쪽 하나만 둔다 */}
                    {i === messages.length - 1 &&
                      chat.regenerate &&
                      !(chat.error && chat.retry) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 px-2 text-caption text-muted-foreground"
                          data-testid="chat-regenerate"
                          title={t.chatView.messages.regenerateHint}
                          onClick={() => {
                            // 누른 단추는 답과 함께 사라진다 — 포커스가 문서 맨 위로 떨어지지 않게 입력칸에 둔다
                            inputRef.current?.focus()
                            chat.regenerate?.()
                          }}
                        >
                          <RotateCcw aria-hidden className="size-3.5" />{' '}
                          {t.chatView.messages.regenerate}
                        </Button>
                      )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-caption text-muted-foreground"
                      data-testid="chat-save"
                      onClick={() => chat.saveAnswer(i)}
                    >
                      <BookmarkPlus aria-hidden className="size-3.5" /> {t.chatView.messages.save}
                    </Button>
                    {chat.saveNote?.ok && chat.saveNote.index === i && chat.saveNote.rel && (
                      <button
                        type="button"
                        className="ml-1 text-caption text-primary-ink hover:underline"
                        data-testid="chat-save-note"
                        title={chat.saveNote.rel}
                        onClick={() => chat.saveNote?.rel && onOpenFile(chat.saveNote.rel)}
                      >
                        {t.chatView.messages.saved(shortLabel(chat.saveNote.rel))}
                      </button>
                    )}
                    {chat.saveNote && !chat.saveNote.ok && chat.saveNote.index === i && (
                      <span
                        role="alert"
                        className="ml-1 text-caption text-destructive"
                        data-testid="chat-save-note"
                      >
                        {chat.saveNote.text}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {awaiting && (
            <div data-testid="chat-pending">
              <TypingDots />
            </div>
          )}
          {chat.running && chat.activity && (
            <p data-testid="chat-activity" className="px-1 text-caption text-muted-foreground">
              {chat.activity}
            </p>
          )}
          {chat.pendingPermission && (
            <PermissionCard
              tool={chat.pendingPermission.tool}
              target={chat.pendingPermission.target}
              onAnswer={chat.answerPermission}
            />
          )}
        </div>
      </div>
      {!atBottom && (
        <button
          type="button"
          aria-label={unread ? t.chatView.messages.toBottomUnread : t.chatView.messages.toBottom}
          title={t.chatView.messages.toBottom}
          data-testid="chat-scroll-bottom"
          onClick={onScrollToBottom}
          className="focus-ring tactile absolute bottom-3 left-1/2 z-10 inline-flex size-8 -translate-x-1/2 animate-in items-center justify-center rounded-full border border-hairline bg-elevated text-muted-foreground shadow-overlay fade-in zoom-in-90 duration-150 hover:bg-accent hover:text-foreground"
        >
          <ArrowDown aria-hidden className="size-4" />
          {unread && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-elevated bg-primary"
            />
          )}
        </button>
      )}
    </div>
  )
}
