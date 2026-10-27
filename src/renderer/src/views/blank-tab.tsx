// 빈 탭 — 아직 아무것도 안 연 탭이 보여 주는 것. Obsidian 의 새 탭과 같은 자리다:
// 설명 대신 여기서 바로 할 수 있는 일을 단축키와 함께 세로로 세운다.
// 문서를 휴지통에 보낸 뒤에도 이 화면이다 — 그때도 다음 할 일은 같다.
import { useState } from 'react'
import { CalendarDays, CalendarPlus, FilePlus2, Globe, ListChecks, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ErrorNote } from '../components/error-note'
import { useWorkbench } from '../store/workbench'
import { useTodayNotes } from '../hooks/use-today'
import { createTodayPrompt } from '../lib/chat-actions'
import { fillDraft, fillNote } from '../lib/chat-fill'
import { useChat } from './chat/chat-context'
import { useT } from '../lib/i18n'

const isMac = navigator.userAgent.includes('Mac')
const mod = isMac ? '⌘' : 'Ctrl+'

/** 오늘 노트를 만들어 달라는 말 — 채팅 빈 대화의 첫 예시 칩과 같은 문장(하루 루프의 첫 수가 맨 앞이다) */

type Action = { icon: LucideIcon; label: string; keys: string; testId: string; run: () => void }

export const BlankTab = (): React.JSX.Element => {
  const t = useT()
  const openToday = useWorkbench((s) => s.openToday)
  const openPalette = useWorkbench((s) => s.openPalette)
  const newNote = useWorkbench((s) => s.newNote)
  const openWeb = useWorkbench((s) => s.openWeb)
  const closeTab = useWorkbench((s) => s.closeTab)
  const tabs = useWorkbench((s) => s.tabs)
  const tabAt = useWorkbench((s) => s.tabAt)
  const askChat = useWorkbench((s) => s.askChat)
  const chat = useChat()
  const { today } = useTodayNotes()
  const [error, setError] = useState<string | null>(null)
  const [filled, setFilled] = useState<string | null>(null)

  // 오늘 노트가 아직 없으면 열기 대신 만들기 — 만드는 일은 채팅이 한다. 문장을 입력칸에 채우고 초점을 줄 뿐
  // 보내지 않는다(오늘 띠의 오늘 정리하기와 같은 길). 첫날의 시작점이 회색 링크 하나뿐이면 길을 잃는다
  const actions: Action[] = [
    ...(today === null
      ? [
          {
            icon: CalendarPlus,
            label: t.today.blank.createToday,
            keys: '',
            testId: 'blank-today-create',
            run: () => {
              const { next, appended } = fillDraft(chat.draft, createTodayPrompt())
              chat.setDraft(next)
              askChat()
              setFilled(t.today.blank.createFilled(fillNote(appended)))
            }
          }
        ]
      : [
          {
            icon: CalendarDays,
            label: t.today.blank.openToday,
            keys: `${mod}T`,
            testId: 'blank-today',
            run: () => openToday(today.rel)
          }
        ]),
    {
      icon: Search,
      label: t.today.blank.find,
      keys: `${mod}K`,
      testId: 'blank-open',
      run: () => openPalette('')
    },
    {
      icon: FilePlus2,
      label: t.today.blank.newNote,
      keys: '',
      testId: 'blank-new-note',
      run: () => {
        setError(null)
        void newNote().then((made) => {
          if ('error' in made) setError(made.error)
        })
      }
    },
    // 이 탭을 웹 탭으로 — 주소칸에 초점을 주고 기다린다
    {
      icon: Globe,
      label: t.web.openBlank,
      keys: '',
      testId: 'blank-web',
      run: () => openWeb(null, false)
    },
    {
      icon: X,
      label: t.today.blank.close,
      keys: `${mod}W`,
      testId: 'blank-close',
      run: () => closeTab(tabs[tabAt].id)
    },
    // 처음이면 3걸음으로 돌려보낸다 — 다른 줄과 같은 크기로(작은 회색 링크는 안 보였다)
    ...(today === null
      ? [
          {
            icon: ListChecks,
            label: t.today.blank.firstTime,
            keys: '',
            testId: 'blank-start',
            run: () => useWorkbench.getState().setView('start')
          }
        ]
      : [])
  ]

  return (
    <div
      data-testid="blank-tab"
      className="scrollbar-thin flex min-h-0 flex-1 flex-col items-center justify-center gap-1 overflow-y-auto px-6 py-8"
    >
      {actions.map(({ icon: Icon, label, keys, testId, run }) => (
        <button
          key={testId}
          type="button"
          data-testid={testId}
          onClick={run}
          className="focus-ring tactile flex w-full max-w-xs items-center gap-3 rounded-md px-3 py-2 text-left text-callout text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {/* 단축키는 읽히되 이름을 이기지 않는다 — 같은 줄의 오른쪽 끝, 한 단계 흐리게 */}
          {keys !== '' && (
            <kbd
              title={keys}
              className="max-w-[40%] shrink-0 truncate text-micro text-muted-foreground"
            >
              {keys}
            </kbd>
          )}
        </button>
      ))}
      {error !== null && (
        <ErrorNote
          error={{ text: error, detail: null }}
          testId="blank-error"
          className="mt-3 w-full max-w-xs"
        />
      )}
      <p
        role="status"
        data-testid="blank-filled"
        className="mt-2 w-full max-w-xs px-3 text-caption text-primary-ink"
      >
        {filled}
      </p>
    </div>
  )
}
