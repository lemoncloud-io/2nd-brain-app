// 채팅 칸의 대화 — 문서를 중앙에 둔 채 묻는다.
// 대화 목록은 이 칸의 머리글이 들고 있다.
import { SetupGate } from '../../components/setup-gate'
import { useWorkbench } from '../../store/workbench'
import { ChatThread } from './chat-thread'
import { useChat } from './chat-context'
import { ConversationList } from './conversation-list'
import { Button } from '../../components/ui/button'
import { MessageSquarePlus, ListTree } from 'lucide-react'
import { useState } from 'react'
import { useT } from '../../lib/i18n'

export const ChatPanel = (): React.JSX.Element => {
  const t = useT()
  const chat = useChat()
  const askChat = useWorkbench((s) => s.askChat)
  const [listOpen, setListOpen] = useState(false)
  return (
    <SetupGate id="chat" needs={['vault', 'engine']}>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="chat-panel">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-hairline pr-1 pl-3">
          <p className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
            {chat.activeTitle ?? t.chatView.newConversation}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t.chatView.history}
            aria-pressed={listOpen}
            data-testid="chat-history"
            onClick={() => setListOpen((was) => !was)}
          >
            <ListTree aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t.chatView.newConversation}
            data-testid="chat-new"
            onClick={() => {
              chat.newConversation()
              askChat()
            }}
          >
            <MessageSquarePlus aria-hidden />
          </Button>
        </div>
        {listOpen && (
          <div className="scrollbar-thin max-h-64 shrink-0 overflow-y-auto border-b border-hairline">
            <ConversationList
              conversations={chat.conversations}
              activeId={chat.activeId}
              runningIds={chat.runningIds}
              onNew={() => {
                chat.newConversation()
                askChat()
              }}
              onSelect={(id) => {
                chat.openConversation(id)
                setListOpen(false)
                askChat()
              }}
              onRename={chat.renameConversation}
              onRemove={chat.removeConversation}
            />
          </div>
        )}
        <ChatThread />
      </div>
    </SetupGate>
  )
}
