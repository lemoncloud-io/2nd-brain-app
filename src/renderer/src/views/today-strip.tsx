// 오늘 띠 — 오늘 노트 위에 붙는 한 줄. 어제에서 넘어온 미결과 오늘의 n/m 을 말하고, 하루를 닫는 문장을
// 채팅 입력칸에 채워 둔다(보내지 않는다). 세는 일은 plan-outline, 어느 파일인지는 today-note 가 정한다.
// 지난 노트로 건너가 있을 때도 남는다 — 오늘로 돌아오는 단추 하나만 들고.
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, MoonStar } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useNoteOutline, useTodayNotes } from '../hooks/use-today'
import { fillDraft, fillNote } from '../lib/chat-fill'
import { useChat } from './chat/chat-context'
import { useWorkbench } from '../store/workbench'
import type { Outline } from '../lib/plan-outline'
import { useT } from '../lib/i18n'

/** 아직 안 끝난 것이 있는 첫 절 — 눌렀을 때 갈 자리다. 없으면 문서 맨 위 */
const openLine = (outline: Outline | null): number | null =>
  outline?.sections.find((section) => section.done < section.total)?.line ?? null

/** 노트 이름의 날짜를 `10/10` 으로, 못 읽으면 null — 이름 규칙(`YYYY-MM-DD` 로 시작)은 lib/today-note.ts 가 정한다 */
const shortDate = (rel: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(rel.split('/').pop() ?? '')
  return m ? `${Number(m[2])}/${Number(m[3])}` : null
}

/** 채웠다는 한 줄이 떠 있는 시간 — 읽을 만큼만 */
const FILLED_MS = 4000

export const TodayStrip = (): React.JSX.Element | null => {
  const t = useT()
  const { today, previous } = useTodayNotes()
  const selectedPage = useWorkbench((s) => s.selectedPage)
  const navigate = useWorkbench((s) => s.navigate)
  const askChat = useWorkbench((s) => s.askChat)
  const chat = useChat()
  const todayOutline = useNoteOutline(today)
  const previousOutline = useNoteOutline(previous)
  // 오늘 정리하기를 누른 뒤 띠에 남기는 한 줄 — 눈은 띠에 있는데 일은 옆 칸에서 일어난다
  const [filled, setFilled] = useState<string | null>(null)
  useEffect(() => {
    if (filled === null) return
    const timer = setTimeout(() => setFilled(null), FILLED_MS)
    return () => clearTimeout(timer)
  }, [filled])

  // 띠는 오늘 노트의 것이다 — 오늘 노트와, 띠에서 건너가는 지난 노트에서만 뜬다. 다른 문서 위에 남의 수를
  // 얹지 않고, 노트가 아직 없으면 아예 뜨지 않는다: 만드는 일은 채팅이 한다(빈 대화의 "오늘 노트 만들어줘" 칩·
  // 빈 탭의 오늘 노트 만들기). 없는 것을 알리려고 자리를 차지하던 줄이라 뺐다(2026-09-20 사람 확인)
  if (today === null) return null
  const onPrevious = previous !== null && selectedPage === previous.rel
  if (selectedPage !== today.rel && !onPrevious) return null

  const open = previousOutline === null ? 0 : previousOutline.total - previousOutline.done
  const previousLabel = previous === null ? '' : t.today.previousLeft(shortDate(previous.rel), open)

  // 지난 노트에서는 돌아오는 길만 — ←(이전)·⌘T 를 몰라도 오늘로 온다
  if (onPrevious) {
    return (
      <div
        data-testid="today-strip"
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline bg-well px-4 py-2"
      >
        <Button
          variant="outline"
          size="sm"
          data-testid="today-back"
          onClick={() => navigate(today.rel, openLine(todayOutline))}
        >
          <ArrowLeft aria-hidden /> {t.today.backToToday}
        </Button>
        {open > 0 && <span className="text-caption text-muted-foreground">{previousLabel}</span>}
      </div>
    )
  }

  /**
   * 하루를 닫는 문장을 입력칸에 채우고 초점을 준다 — 보내지는 않는다.
   * 누르자마자 보내면 사용자는 자기 구독으로 나간 문장을 읽지도 고치지도 못한다.
   * 채워 두면 보이고, 고칠 수 있고, Enter 한 번이면 간다(채팅의 예시 칩과 같은 길이다).
   * 쓰던 글이 있으면 지우지 않고 뒤에 덧붙인다
   */
  const prefill = (text: string): void => {
    const { next, appended } = fillDraft(chat.draft, text)
    chat.setDraft(next)
    askChat()
    setFilled(fillNote(appended))
  }

  return (
    <div
      data-testid="today-strip"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline bg-well px-4 py-2"
    >
      {/* 눌리는 것은 밑줄과 화살표로 — 옆의 진행 수는 글자일 뿐이다 */}
      {previous !== null && open > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="underline underline-offset-4"
          data-testid="today-previous"
          title={t.today.previousHint(previous.rel)}
          onClick={() => navigate(previous.rel, openLine(previousOutline))}
        >
          <MoonStar aria-hidden /> {previousLabel} <ArrowRight aria-hidden />
        </Button>
      )}
      {todayOutline !== null && todayOutline.total > 0 && (
        <span
          data-testid="today-progress"
          className="inline-flex items-center gap-1.5 px-1 text-caption text-muted-foreground [&_svg]:size-4"
        >
          <CheckCircle2 aria-hidden />
          <span aria-hidden>
            {t.today.progress} {todayOutline.done}/{todayOutline.total}
          </span>
          <span className="sr-only">
            {t.today.progressSr(todayOutline.total, todayOutline.done)}
          </span>
        </span>
      )}
      <span className="min-w-0 flex-1" />
      {/* 늘 있는 알림 자리 — 내용이 바뀔 때 스크린리더가 읽는다 */}
      <span role="status" className="text-caption text-primary-ink" data-testid="today-filled">
        {filled}
      </span>
      <Button
        variant="outline"
        size="sm"
        data-testid="today-wrapup"
        title={t.today.wrapUpHint}
        onClick={() => prefill(t.chat.wrapUpPrompt)}
      >
        {t.today.wrapUp}
      </Button>
    </div>
  )
}
