// 대화 목록 — 채팅 칸 머리글의 "지난 대화" 가 펼치는 줄.
import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { ChatSummary } from '../../../../shared/ipc-contract'
import { cn } from '../../lib/utils'
import { useT } from '../../lib/i18n'

export const ConversationList = ({
  conversations,
  activeId,
  runningIds,
  onNew,
  onSelect,
  onRename,
  onRemove
}: {
  conversations: ChatSummary[]
  activeId: string | null
  runningIds: Set<string>
  onNew: () => void
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onRemove: (id: string) => void
}): React.JSX.Element => {
  const t = useT()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // 지운 자리의 이웃 대화 id — 목록이 바뀌면 그 행으로 초점을 옮긴다. 'chat-conv-new' 면 새 대화로
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (focusNext.current === null) return
    const pending = focusNext.current
    focusNext.current = null
    const title =
      pending === 'chat-conv-new'
        ? null
        : (conversations.find((c) => c.id === pending)?.title ?? null)
    const el =
      title !== null
        ? document.querySelector(`[data-testid="chat-conv-item:${CSS.escape(title)}"] button`)
        : document.querySelector('[data-testid="chat-conv-new"]')
    if (el instanceof HTMLElement) el.focus()
  }, [conversations])
  return (
    <div className="flex flex-col py-2" data-testid="chat-conv-panel">
      <div className="flex h-8 items-center justify-between pr-2 pl-4">
        <span className="text-caption font-medium text-muted-foreground">
          {t.chatView.list.title}
        </span>
        <button
          type="button"
          onClick={onNew}
          data-testid="chat-conv-new"
          title={t.chatView.newConversation}
          aria-label={t.chatView.newConversation}
          className="focus-ring tactile rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-px px-2">
        {conversations.length === 0 && (
          <p className="px-2 py-2 text-caption text-muted-foreground">{t.chatView.list.empty}</p>
        )}
        {conversations.map((conv) => {
          const isActive = conv.id === activeId
          if (conv.id === renamingId) {
            // Enter는 적힌 이름으로 끝내고, Esc·빈칸은 취소다. 바깥을 누르면 적힌 게 있으면
            // 끝내고, 비었으면 취소한다 — 친 이름을 조용히 버리지 않는다
            const commitRename = (): void => {
              const next = renameDraft.trim()
              if (next !== '' && next !== conv.title) onRename(conv.id, next)
              setRenamingId(null)
            }
            return (
              <input
                key={conv.id}
                value={renameDraft}
                aria-label={t.chatView.list.renameLabel}
                autoFocus
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameDraft.trim() !== '') {
                    setRenamingId(null)
                    onRename(conv.id, renameDraft.trim())
                  } else if (e.key === 'Escape') {
                    setRenamingId(null)
                  }
                }}
                onBlur={commitRename}
                className="h-8 w-full rounded-md border border-focus-border bg-background px-2 text-callout outline-none"
                data-testid="chat-conv-rename-input"
              />
            )
          }
          return (
            <div
              key={conv.id}
              className={cn(
                'group flex h-8 items-center gap-1 rounded-md px-2 text-callout',
                isActive ? 'bg-accent font-medium text-foreground' : 'text-label hover:bg-accent/60'
              )}
              data-testid={`chat-conv-item:${conv.title}`}
            >
              <button
                type="button"
                onClick={() => onSelect(conv.id)}
                className="focus-ring min-w-0 flex-1 truncate rounded text-left"
                title={conv.title}
              >
                {conv.title}
              </button>
              {runningIds.has(conv.id) && (
                <span
                  role="status"
                  aria-label={t.chatView.list.answering}
                  className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
                  data-testid="chat-conv-running-dot"
                />
              )}
              {confirmDeleteId === conv.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      // 지운 자리 이웃을 기억해 둔다 — 목록이 바뀌면 그리로(다 지웠으면 "새 대화" 로)
                      const at = conversations.findIndex((c) => c.id === conv.id)
                      const next =
                        at >= 0 ? (conversations[at + 1] ?? conversations[at - 1]) : undefined
                      focusNext.current = next ? next.id : 'chat-conv-new'
                      setConfirmDeleteId(null)
                      onRemove(conv.id)
                    }}
                    // Enter 오작동 방지(무장 해제)는 명시적 취소·Escape 로 대신한다 —
                    // 초점을 잃으면 풀리게 두면 키보드로는 절대 지울 수 없다
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setConfirmDeleteId(null)
                    }}
                    aria-label={t.chatView.list.confirmDelete(conv.title)}
                    className="focus-ring shrink-0 rounded px-1 text-caption font-medium text-destructive"
                    data-testid="chat-conv-confirm-delete"
                  >
                    {t.chatView.list.delete}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    aria-label={t.chatView.list.cancelDelete}
                    className="focus-ring shrink-0 rounded px-1 text-caption text-muted-foreground"
                    data-testid="chat-conv-cancel-delete"
                  >
                    {t.chatView.list.cancel}
                  </button>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRenameDraft(conv.title)
                      setRenamingId(conv.id)
                    }}
                    aria-label={t.chatView.list.rename(conv.title)}
                    className="focus-ring shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                    data-testid="chat-conv-rename"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(conv.id)}
                    aria-label={t.chatView.list.remove(conv.title)}
                    className="focus-ring shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                    data-testid="chat-conv-delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
