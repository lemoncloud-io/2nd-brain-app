// 입력칸과 그 위 알림들 — 질문 초안·첨부·압축 확인. 상태는 컨테이너가 들고 props 로만 받는다.
import type { RefObject } from 'react'
import { ArrowUp, FoldVertical, Info, Paperclip, Square, X } from 'lucide-react'
import { CLIP_FILE_TYPES } from '../../../../shared/ipc-contract'
import { Button } from '../../components/ui/button'
import { ErrorNote } from '../../components/error-note'
import { cn } from '../../lib/utils'
import { imageFiles } from '../../lib/chat-images'
import { ImageZoom } from './image-zoom'
import { shortModel } from '../../lib/model-label'
import type { ChatSession } from './use-chat-session'
import { ChatStatusBar } from './chat-status-bar'
import type { useComposerAssist } from './composer-assist'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle
} from '../../components/ui/alert-dialog'
import { useT } from '../../lib/i18n'

/**
 * 압축 미리보기 — 요약 대상(지금까지 주고받은 것)과 되돌릴 수 없는 이유를 확정 전에 보인다.
 * 요약문 자체는 엔진이 돌 때 만들므로 개수 미리보기까지만 둔다.
 */
const CompactPreview = ({
  messages
}: {
  messages: ChatSession['messages']
}): React.JSX.Element | null => {
  const t = useT()
  if (messages.length === 0) return null
  const asked = messages.filter((m) => m.role === 'user').length
  const answered = messages.length - asked
  return (
    <p data-testid="chat-compact-preview" className="text-caption text-muted-foreground">
      {t.chatView.composer.compactPreview(messages.length, asked, answered)}
    </p>
  )
}

export const ChatComposer = ({
  chat,
  assist,
  heavy,
  newConversation,
  pastedUrl,
  onAddUrl,
  onDismissUrl,
  onPasteUrl,
  clipNote,
  onRequestIngest,
  dragOver,
  onDragOver,
  onDropFiles,
  inputRef,
  pickerRef,
  showMeters,
  compactAsk,
  onCompactAsk
}: {
  chat: ChatSession
  assist: ReturnType<typeof useComposerAssist>
  heavy: boolean
  newConversation: () => void
  pastedUrl: string | null
  onAddUrl: (url: string) => void
  onDismissUrl: () => void
  onPasteUrl: (url: string | null) => void
  clipNote: { text: string; ok: boolean } | null
  onRequestIngest: () => void
  dragOver: boolean
  onDragOver: (over: boolean) => void
  onDropFiles: (files: File[]) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  pickerRef: RefObject<HTMLInputElement | null>
  showMeters: boolean
  compactAsk: boolean
  onCompactAsk: (open: boolean) => void
}): React.JSX.Element => {
  const t = useT()
  const { running } = chat
  return (
    <div className="shrink-0 px-3 pb-5">
      <div>
        {chat.notice && (
          <div
            role="status"
            data-testid="chat-notice"
            className="mb-2 flex items-start gap-2 rounded-lg border border-hairline bg-accent px-3 py-2 text-caption text-label"
          >
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">{chat.notice.text}</span>
            <button
              type="button"
              aria-label={t.chatView.composer.closeNotice}
              data-testid="chat-notice-close"
              onClick={chat.dismissNotice}
              className="focus-ring shrink-0 rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
        {heavy && !running && (
          <div
            data-testid="chat-too-long"
            className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-caption text-muted-foreground"
          >
            <span className="min-w-0 flex-1">{t.chatView.composer.tooLong}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-caption"
              data-testid="chat-new-from-long"
              onClick={newConversation}
            >
              {t.chatView.newConversation}
            </Button>
            {/* 압축은 컴포저 아래에 늘 있다 — 알림에 같은 단추를 하나 더 두지 않는다 */}
          </div>
        )}
        {pastedUrl && chat.draft.includes(pastedUrl) && (
          <div
            data-testid="chat-url-offer"
            className="mb-2 flex flex-wrap items-center gap-2 text-caption text-label"
          >
            <span className="min-w-0 flex-1">{t.chatView.composer.urlOffer}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-caption"
              data-testid="chat-url-clip"
              onClick={() => void onAddUrl(pastedUrl)}
            >
              {t.chatView.composer.urlClip}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-caption text-muted-foreground"
              onClick={onDismissUrl}
            >
              {t.chatView.composer.urlAsk}
            </Button>
          </div>
        )}
        {clipNote && (
          <div
            role="status"
            data-testid="chat-clip-note"
            className={cn(
              'mb-2 flex flex-wrap items-center gap-2 text-caption',
              clipNote.ok ? 'text-primary-ink' : 'text-muted-foreground'
            )}
          >
            <span className="min-w-0 flex-1">{clipNote.text}</span>
            {clipNote.ok && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-1.5 text-caption"
                data-testid="chat-clip-ingest"
                onClick={() => {
                  onRequestIngest()
                }}
              >
                {t.chatView.composer.ingest}
              </Button>
            )}
          </div>
        )}
        {chat.error && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ErrorNote error={chat.error} testId="chat-error" />
            {chat.retry && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-caption"
                data-testid="chat-retry"
                onClick={chat.retry}
              >
                {t.chatView.composer.retry}
              </Button>
            )}
          </div>
        )}
        {assist.chips}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            onDragOver(true)
          }}
          onDragLeave={() => onDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            onDragOver(false)
            onDropFiles([...e.dataTransfer.files])
          }}
          onMouseDown={(e) => {
            // 단추 줄의 빈 자리를 눌러도 입력칸에 초점이 간다 — 상자 전체가 입력칸처럼 군다
            const target = e.target as HTMLElement
            if (target.closest('button, textarea, input, [role="listbox"]')) return
            e.preventDefault()
            inputRef.current?.focus()
          }}
          data-testid="chat-composer"
          className={cn(
            'relative flex cursor-text flex-col gap-1 rounded-2xl border border-input-border bg-background p-1.5 shadow-raised transition-colors focus-within:border-focus-border',
            dragOver && 'border-dashed border-focus-border bg-accent'
          )}
        >
          {assist.menu}
          <span className="sr-only" aria-live="polite" data-testid="chat-assist-count">
            {assist.assistCount > 0 ? t.chatView.composer.assistCount(assist.assistCount) : ''}
          </span>
          {chat.images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1.5 pt-1.5" data-testid="chat-images">
              {chat.images.map((image, i) => (
                <div key={image.id} className="group/image relative">
                  <ImageZoom
                    src={image.url}
                    alt={t.chatView.images.pasted(i + 1)}
                    testId="chat-image-open"
                  >
                    <img
                      src={image.url}
                      alt=""
                      data-testid="chat-image"
                      className="size-16 rounded-lg border border-hairline object-cover"
                    />
                  </ImageZoom>
                  <button
                    type="button"
                    aria-label={t.chatView.images.remove(i + 1)}
                    data-testid="chat-image-remove"
                    onClick={() => chat.removeImage(image.id)}
                    className="focus-ring absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full border border-hairline bg-elevated text-muted-foreground shadow-raised hover:text-foreground"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={chat.draft}
            onChange={(e) => {
              chat.setDraft(e.target.value)
              assist.trackCaret()
            }}
            onPaste={(e) => {
              // 화면 캡처·복사한 그림은 질문에 붙인다 — 글로 붙여 넣을 것이 없으니 기본 동작은 막는다
              const pasted = imageFiles(e.clipboardData.files)
              if (pasted.length > 0) {
                e.preventDefault()
                chat.addImages(pasted)
                return
              }
              const text = e.clipboardData.getData('text/plain').trim()
              onPasteUrl(/^https?:\/\/\S+$/.test(text) ? text : null)
            }}
            onKeyDown={assist.onKeyDown}
            onSelect={assist.trackCaret}
            // 답하는 중 Enter 는 멈추기(■와 같음) — 다음 질문은 써 두고 멈춘 뒤 한 번 더 누르면 보낸다
            placeholder={
              running ? t.chatView.composer.placeholderRunning : t.chatView.composer.placeholder
            }
            rows={1}
            enterKeyHint="send"
            aria-label={t.chatView.composer.input}
            // 고르기 목록은 controls·expanded·activedescendant 로 잇고, 아래 알림 자리가
            // 목록 개수와 화살표 조작법을 말한다 (textarea에 combobox 역할은 달 수 없어 ARIA in HTML)
            aria-controls={assist.assistOpen ? 'chat-assist-list' : undefined}
            aria-expanded={assist.assistOpen}
            aria-activedescendant={assist.assistOpen ? assist.assistActiveId : undefined}
            className="field-sizing-content max-h-48 min-h-10 w-full resize-none bg-transparent px-2 py-1.5 text-body caret-primary outline-none placeholder:text-muted-foreground"
            data-testid="chat-input"
          />
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground"
              aria-label={t.chatView.composer.attach}
              title={t.chatView.composer.attachHint}
              data-testid="chat-attach"
              onClick={() => pickerRef.current?.click()}
            >
              <Paperclip />
            </Button>
            <input
              ref={pickerRef}
              type="file"
              multiple
              hidden
              accept={CLIP_FILE_TYPES.join(',')}
              data-testid="chat-attach-input"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                onDropFiles(files)
              }}
            />
            {running ? (
              <Button
                size="icon"
                className="size-8 rounded-full"
                aria-label={t.chatView.composer.stop}
                title={t.chatView.composer.stopHint}
                onClick={chat.stop}
                data-testid="chat-stop"
              >
                <Square className="!size-3 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="size-8 rounded-full"
                aria-label={t.chatView.composer.send}
                title={t.chatView.composer.sendHint}
                onClick={assist.submit}
                disabled={chat.draft.trim() === ''}
                data-testid="chat-ask"
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
        {/* 압축은 기억 줄 끝에 붙는다 — 지표가 접혀도 첫 줄(모델·기억)과 같은 높이에 남는다.
          고급 표시가 꺼져도 값이 오면 압축 옆에 한 줄로 둔다 (지표 줄과는 중복 방지) */}
        <div className="mt-1.5 flex items-start gap-3 px-1">
          <ChatStatusBar usage={chat.usage} show={showMeters} />
          {!showMeters && (chat.usage?.model != null || chat.usage?.contextPercent != null) && (
            <p
              data-testid="chat-compact-usage"
              className="text-micro text-muted-foreground min-w-0 flex-1 truncate leading-5 tabular-nums"
            >
              {chat.usage?.model != null && (
                <span title={chat.usage.model} className="text-foreground/75 font-medium">
                  {shortModel(chat.usage.model)}
                </span>
              )}
              {chat.usage?.model != null && chat.usage?.contextPercent != null && ' · '}
              {chat.usage?.contextPercent != null && (
                <span title={t.chatView.memoryHint}>
                  {t.chatView.memory(chat.usage.contextPercent)}
                </span>
              )}
            </p>
          )}
          {/* 길어진 뒤에야 찾을 수 있으면 늦다 — 값이 오면 늘 같은 자리에 두고, 못 쓸 때는 잠근다.
            쓸 것(대화·사용량)이 없으면 버튼 자리도 내지 않는다 */}
          {(chat.messages.length > 0 ||
            chat.usage?.model != null ||
            chat.usage?.contextPercent != null) && (
            <button
              type="button"
              title={t.chatView.composer.compactHint}
              data-testid="chat-compact"
              disabled={running || chat.compacting || chat.messages.length === 0}
              onClick={() => onCompactAsk(true)}
              className="ml-auto flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-micro text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
            >
              <FoldVertical className="size-3" aria-hidden />
              {t.chatView.composer.compact}
            </button>
          )}
        </div>
        <AlertDialog open={compactAsk} onOpenChange={(open) => !open && onCompactAsk(false)}>
          <AlertDialogContent data-testid="chat-compact-dialog">
            <AlertDialogTitle>{t.chatView.composer.compactTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.chatView.composer.compactDetail}</AlertDialogDescription>
            <CompactPreview messages={chat.messages} />
            <AlertDialogFooter>
              <AlertDialogCancel>{t.chatView.composer.keep}</AlertDialogCancel>
              <AlertDialogAction
                data-testid="chat-compact-confirm"
                onClick={() => {
                  onCompactAsk(false)
                  chat.compact()
                }}
              >
                {t.chatView.composer.compactConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
