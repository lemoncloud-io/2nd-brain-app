// 채팅 칸 머리글 — 탭 띠 + 떠 있을 때의 접기 단추.
// 창이 좁아 채팅 칸이 문서 위에 뜨면 도구 막대의 채팅 토글이 pane에 덮여 마우스로 못 누른다 —
// 그때 머리글의 접기 단추가 닫는 길이다. 자리잡힌 채팅은 토글이 맡으므로 단추를 두지 않는다.
import { useContext, useState } from 'react'
import { PanelRightClose } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'
import { useWorkbench, type ChatTab } from '../../store/workbench'
import { ChatContext } from './chat-context'
import { visibleChatTabs } from './chat-tabs'
import { useT } from '../../lib/i18n'

export const ChatPaneHeader = ({
  floating,
  ingestRunning
}: {
  /** 채팅 칸이 문서 위에 떠 있다 — 도구 막대 토글이 덮여 이 머리글 단추가 닫는다 */
  floating: boolean
  /** 위키화가 도는 중 — 탭의 진행 점. 다른 탭에 있어도 돌고 있다는 것이 보여야 한다 */
  ingestRunning: boolean
}): React.JSX.Element => {
  const t = useT()
  const chatTab = useWorkbench((s) => s.chatTab)
  const hasPeek = useWorkbench((s) => s.peek !== null)
  const tabs = visibleChatTabs({ chatTab, hasPeek })
  const openChat = useWorkbench((s) => s.openChat)
  const toggleChat = useWorkbench((s) => s.toggleChat)
  // 다른 탭에 있는 동안 답이 오고 있거나, 와서 아직 안 봤다 — 채팅 탭에 점을 단다.
  // 머리글만 따로 그리는 자리(테스트)에는 세션이 없다 — 그때는 점이 없다
  const answering = useContext(ChatContext)?.running ?? false
  const [seenRunning, setSeenRunning] = useState(answering)
  const [unseen, setUnseen] = useState(false)
  if (seenRunning !== answering) {
    setSeenRunning(answering)
    if (!answering && chatTab !== 'chat') setUnseen(true)
  }
  if (unseen && chatTab === 'chat') setUnseen(false)
  // 점의 종류는 코드 값으로 가른다 — 화면 글자로 가르면 언어가 바뀔 때 깜빡임이 틀린다
  const dot = (id: ChatTab): 'running' | 'answering' | 'unseen' | null =>
    id === 'ingest' && ingestRunning
      ? 'running'
      : id === 'chat' && chatTab !== 'chat' && answering
        ? 'answering'
        : id === 'chat' && unseen
          ? 'unseen'
          : null
  return (
    <div className="flex h-13 shrink-0 items-center gap-2 border-b border-hairline px-3">
      <div
        role="tablist"
        aria-label={t.chatView.tabsLabel}
        className="scrollbar-none flex min-w-0 gap-0.5 overflow-x-auto rounded-md bg-accent p-0.5"
        onKeyDown={(e) => {
          if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault()
            const next = tabs[e.key === 'Home' ? 0 : tabs.length - 1]
            openChat(next.id)
            document.getElementById(`chat-tab-${next.id}`)?.focus()
            return
          }
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
          if (step === 0) return
          e.preventDefault()
          const at = tabs.findIndex((t) => t.id === chatTab)
          const next = tabs[(at + step + tabs.length) % tabs.length]
          openChat(next.id)
          document.getElementById(`chat-tab-${next.id}`)?.focus()
        }}
      >
        {tabs.map((tab) => {
          const mark = dot(tab.id)
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`chat-tab-${tab.id}`}
              data-testid={`chat-tab-${tab.id}`}
              aria-selected={chatTab === tab.id}
              aria-controls={`chat-panel-${tab.id}`}
              tabIndex={chatTab === tab.id ? 0 : -1}
              onClick={() => openChat(tab.id)}
              className={cn(
                'focus-ring tactile min-h-8 shrink-0 rounded-sm px-2.5 py-1 text-caption whitespace-nowrap',
                chatTab === tab.id
                  ? 'bg-background font-medium text-foreground shadow-raised'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {mark !== null && (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      'ml-1 inline-block size-1.5 rounded-full bg-primary align-middle',
                      mark !== 'unseen' && 'animate-pulse'
                    )}
                  />
                  <span className="sr-only">{t.chatView.dot[mark]}</span>
                </>
              )}
            </button>
          )
        })}
      </div>
      {floating && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.chatView.collapse}
          data-testid="collapse-chat"
          title={t.chatView.collapse}
          onClick={toggleChat}
          className="size-7 shrink-0"
        >
          <PanelRightClose aria-hidden />
        </Button>
      )}
    </div>
  )
}
