// 대화 메시지 줄의 작은 조각 — 참조 칩·답 아래 실행 카드·입력 대기 점.
import { FileText, Sparkles } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { folderLabel, shortLabel } from '../../lib/vault-path'
import { suggestActions, type ChatActionId } from '../../lib/chat-actions'
import { cn } from '../../lib/utils'
import { useWorkbench } from '../../store/workbench'

export const RefChips = ({ rels }: { rels: string[] }): React.JSX.Element | null => {
  const openPeek = useWorkbench((s) => s.openPeek)
  // 지금 옆 칸에서 읽는 근거 — 눌림으로 보인다(어느 칩을 읽고 있는지)
  const reading = useWorkbench((s) => s.peek?.rel ?? null)
  if (rels.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="chat-refs">
      {rels.map((rel) => (
        <button
          key={rel}
          type="button"
          aria-pressed={reading === rel}
          // 답은 줄 없이 페이지를 댄다 — 참고한 페이지가 "전체를 참고했어요" 를 알린다
          onClick={() => openPeek(rel, null, true)}
          // 칩은 바로 위 폴더와 이름만 — 깊은 경로를 다 늘어놓으면 칩 여러 개가 입력칸을 밀어내는 벽이 된다.
          // 전체 자리는 올려 두면 보인다
          title={folderLabel(rel)}
          className={cn(
            'focus-ring tactile inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-caption text-label hover:bg-accent',
            reading === rel ? 'border-foreground/30 bg-accent' : 'border-hairline'
          )}
        >
          <FileText aria-hidden className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{shortLabel(rel)}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * 답 아래 실행 카드 — 채팅이 쓰는 것은 노트뿐이다(src/main/note/note-run.ts). 위키화·클리핑 같은 일은 여기서 건다.
 * 누르면 기존 경로를 그대로 부른다: 위키화는 requestIngest, 나머지는 그 탭으로 옮긴다.
 */
export const ActionCards = ({ question }: { question: string }): React.JSX.Element | null => {
  const openKnowledge = useWorkbench((s) => s.openKnowledge)
  const requestIngest = useWorkbench((s) => s.requestIngest)
  const actions = suggestActions(question)
  if (actions.length === 0) return null
  const run = (id: ChatActionId): void => {
    if (id === 'ingest') {
      requestIngest()
      return
    }
    openKnowledge(id === 'clip' ? 'sources' : id === 'review' ? 'review' : 'lint')
  }
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="chat-actions">
      {actions.map((action) => (
        <Button
          key={action.id}
          variant="outline"
          size="sm"
          className="h-7 px-2 text-caption"
          data-testid={`chat-action-${action.id}`}
          onClick={() => run(action.id)}
        >
          <Sparkles aria-hidden /> {action.label}
        </Button>
      ))}
    </div>
  )
}

/** 답 첫 글자를 기다리는 동안 — 글자 대신 점 셋이 튄다 */
export const TypingDots = (): React.JSX.Element => (
  <div className="flex h-7 items-center gap-1" data-testid="chat-typing" aria-hidden>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="size-1.5 rounded-full bg-muted-foreground [animation:typing-dot_1.2s_ease-in-out_infinite]"
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </div>
)
