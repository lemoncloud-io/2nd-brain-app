// 입력칸 돕기 — 이 질문에 `@` 로 붙인 문서 칩과, `/`(사용자 스킬)·`@`(문서) 를 칠 때 뜨는 고르기 목록.
// 스킬을 고르면 입력칸이 `/이름 ` 으로 바뀌고, 뒤에 덧붙여 보내면 그 질문 그대로 CLI 가 스킬을 실행한다.
// 보고 있는 문서는 저절로 붙지 않는다 — `@ 보고 있는 문서` 를 누르거나 `@` 목록 맨 위에서 고르면 다른 `@` 문서와 똑같이 붙는다.
// 붙일 것도 권할 것도 없으면 칩줄 자체를 그리지 않는다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AtSign, FileText } from 'lucide-react'
import { cn } from '../../lib/utils'
import { fileTitle } from '../../lib/vault-path'
import { matchPages, paletteEntries } from '../../lib/page-match'
import { matchSkills, mentionQuery, slashQuery } from '../../lib/chat-commands'
import type { ChatSkill } from '../../../../shared/ipc-contract'
import { useWorkbench } from '../../store/workbench'
import type { ChatSession } from './use-chat-session'
import { ContextChip as Chip } from './context-chip'
import { useT } from '../../lib/i18n'

const MAX_MENTIONS = 8
const SHOWN = 8
// 쪽 이동 폭 — 목록이 여덟 줄씩 끊겨 보인다
const PAGE = 8

type Item = { kind: 'skill'; skill: ChatSkill } | { kind: 'doc'; rel: string; title: string }

export const useComposerAssist = ({
  chat,
  inputRef
}: {
  chat: ChatSession
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}): {
  chips: React.JSX.Element | null
  menu: React.JSX.Element | null
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  trackCaret: () => void
  submit: () => void
  assistOpen: boolean
  /** 뜬 목록의 줄 수 — 닫혀 있으면 0. 입력칸 아래 알림 자리가 읽는다 */
  assistCount: number
  assistActiveId: string
} => {
  const t = useT()
  const pages = useWorkbench((s) => s.pages)
  const docs = useWorkbench((s) => s.docs)
  const tree = useWorkbench((s) => s.tree)
  const recent = useWorkbench((s) => s.recent)
  const openRel = useWorkbench((s) =>
    s.view === 'doc' ? (s.docMode === 'page' ? s.selectedPage : s.selectedSource) : null
  )
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  // Esc 로 닫은 목록 — 입력이 바뀌면 다시 뜬다
  const [closedFor, setClosedFor] = useState<string | null>(null)
  const { draft, setDraft, mentions, setMentions } = chat
  const [activeFor, setActiveFor] = useState('')
  // 입력이 바뀌면 맨 위부터 — 옛 자리(예: 3번)를 들고 있으면 좁혀진 목록의 엉뚱한 줄이 골라진다.
  // 렌더 중 조정이지 효과가 아니다 — 입력이 바뀐 바로 그 그리기부터 0번이다
  const sig = `${draft} @${caret}`
  if (activeFor !== sig) {
    setActiveFor(sig)
    setActive(0)
  }

  // 채팅을 열 때 한 번, `/` 를 칠 때마다 다시 묻는다 — 첫 목록은 세션을 여느라 몇 초 걸리므로 미리 받아 둔다.
  // main 은 켜 둔 세션에 묻는다 — 그사이 더한 스킬은 세션이 새로 열릴 때 보인다.
  // 못 받으면 빈 목록 — 메뉴가 뜨지 않을 뿐 질문은 그대로 보낼 수 있다. null 은 아직 받는 중
  const [skills, setSkills] = useState<ChatSkill[] | null>(null)
  const slashing = slashQuery(draft) !== null
  const asked = useRef(false)
  useEffect(() => {
    // 처음 한 번 + `/` 를 칠 때만 — `/` 를 지울 때마다 CLI 를 다시 띄우지 않는다
    if (asked.current && !slashing) return
    asked.current = true
    let alive = true
    window.api
      .listChatSkills()
      .then((result) => {
        if (alive) setSkills(Array.isArray(result) ? result : [])
      })
      .catch(() => {
        if (alive) setSkills([])
      })
    return () => {
      alive = false
    }
  }, [slashing])

  const entries = useMemo(
    () => paletteEntries(pages ?? [], docs ?? [], tree ?? []),
    [pages, docs, tree]
  )
  const titleOf = (rel: string): string =>
    entries.find((e) => e.rel === rel)?.title ?? fileTitle(rel)

  // 키마다·토큰마다 통째로 다시 찾지 않는다 — 입력·목록이 바뀔 때만.
  // mention insistence: mentionQuery 가 매번 새 객체를 돌려주므로 밖에서 꺼내 deps 에 넣으면
  // 메모가 매 렌더 풀린다 — 안에서 꺼낸다
  const items = useMemo((): Item[] => {
    const slash = slashQuery(draft)
    if (slash !== null)
      return matchSkills(skills ?? [], slash).map((skill) => ({ kind: 'skill', skill }))
    const mention = mentionQuery(draft, caret)
    if (mention === null) return []
    // 빈 `@` 는 보고 있는 문서부터, 그다음 최근 문서
    const found =
      mention.query === ''
        ? [...new Set([...(openRel === null ? [] : [openRel]), ...recent])]
            .map((rel) => entries.find((e) => e.rel === rel))
            .filter((e): e is (typeof entries)[number] => e !== undefined)
        : matchPages(entries, mention.query)
    return found
      .filter((e) => !mentions.includes(e.rel))
      .slice(0, SHOWN)
      .map((e) => ({ kind: 'doc', rel: e.rel, title: e.title }))
  }, [draft, caret, skills, openRel, recent, entries, mentions])
  const open = items.length > 0 && closedFor !== draft
  const current = Math.min(active, Math.max(items.length - 1, 0))

  const focusAt = (pos: number): void => {
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  const choose = (item: Item): void => {
    setActive(0)
    if (item.kind === 'skill') {
      const next = `/${item.skill.name} `
      setDraft(next)
      focusAt(next.length)
      return
    }
    // 고를 때 입력이 바뀌어 있을 수 있다 — 그때 자리 기준으로 다시 본다
    const at = mentionQuery(draft, caret)
    if (at === null) return
    setDraft(draft.slice(0, at.start) + draft.slice(caret))
    if (mentions.length < MAX_MENTIONS) setMentions([...mentions, item.rel])
    focusAt(at.start)
  }

  /** 보내기 — `/스킬` 도 질문 그대로 간다 */
  const submit = (): void => {
    // 답하는 중에 Enter 는 멈추기(■와 같음) — main 이 같은 대화의 겹질문을 거절하므로
    // 보내기를 막기만 하면 쓴 글 앞에서 키가 죽는다. 쓴 글은 그대로 두고 한 번 더 누르면 보낸다
    if (chat.running) {
      chat.stop()
      return
    }
    chat.ask()
  }

  // 고른 줄을 보이게 — 목록이 길면 스크롤이 따라간다(팔레트와 같은 박자)
  const move = (step: number): void => {
    const next = (current + step + items.length) % items.length
    setActive(next)
    document.getElementById(`chat-assist-option-${next}`)?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // 한글 조합 중 Enter·방향키는 글자를 끝낼 뿐 고르지 않는다
    if (e.nativeEvent.isComposing) return
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        move(step)
        return
      }
      // 목록 규약 — 처음·마지막·쪽 이동도 받는다
      if (e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault()
        if (e.key === 'Home') setActive(0)
        else if (e.key === 'End') setActive(items.length - 1)
        else move(e.key === 'PageDown' ? PAGE : -PAGE)
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault()
        const item = items[current]
        if (item) choose(item)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setClosedFor(draft)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const trackCaret = (): void => {
    const el = inputRef.current
    if (el) setCaret(el.selectionStart ?? el.value.length)
  }

  // 보고 있는 문서를 아직 안 붙였으면 한 번에 붙이는 단추를 권한다
  const offerOpen =
    openRel !== null && !mentions.includes(openRel) && mentions.length < MAX_MENTIONS
  const chips =
    offerOpen || mentions.length > 0 ? (
      <div data-testid="chat-context" className="mb-1.5 flex flex-wrap items-center gap-1 px-1">
        {mentions.map((rel) => (
          <Chip
            key={rel}
            testId={`chat-mention-chip:${rel}`}
            icon={<AtSign aria-hidden className="size-3 shrink-0" />}
            label={titleOf(rel)}
            title={rel}
            removeLabel={t.chatView.chips.remove(titleOf(rel))}
            onRemove={() => setMentions(mentions.filter((m) => m !== rel))}
          />
        ))}
        {offerOpen && (
          <button
            type="button"
            data-testid="chat-context-open-add"
            title={t.chatView.chips.openTitle(openRel)}
            onClick={() => setMentions([...mentions, openRel])}
            className="focus-ring inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 text-caption text-muted-foreground hover:text-foreground"
          >
            <AtSign aria-hidden className="size-3 shrink-0" />
            {titleOf(openRel)}
          </button>
        )}
      </div>
    ) : null

  // 목록 종류는 항목이 안다 — 정규식 한 번으로 가른다(렌더당 한 번, 목록 스캔은 메모된 items 가 맡는다)
  const slashMenu = slashQuery(draft) !== null
  const menu = !open ? (
    slashMenu && skills === null && closedFor !== draft ? (
      <div
        role="status"
        data-testid="chat-slash-loading"
        className="absolute right-0 bottom-full left-0 z-20 mb-1 rounded-lg border border-hairline bg-elevated px-3 py-2 text-caption text-muted-foreground shadow-raised"
      >
        {t.chatView.chips.skillsLoading}
      </div>
    ) : null
  ) : (
    <div
      role="listbox"
      id="chat-assist-list"
      aria-label={slashMenu ? t.chatView.chips.commands : t.chatView.chips.mentions}
      data-testid={slashMenu ? 'chat-slash-menu' : 'chat-mention-menu'}
      className="absolute right-0 bottom-full left-0 z-20 mb-1 max-h-72 overflow-y-auto rounded-lg border border-hairline bg-elevated p-1 shadow-raised"
    >
      {items.map((item, i) => (
        <button
          key={item.kind === 'skill' ? item.skill.name : item.rel}
          type="button"
          role="option"
          id={`chat-assist-option-${i}`}
          aria-selected={i === current}
          data-testid={
            item.kind === 'skill'
              ? `chat-slash:${item.skill.name}`
              : `chat-mention-option:${item.rel}`
          }
          // 입력칸의 초점을 빼앗지 않는다 — 고른 뒤 바로 이어 친다
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setActive(i)}
          onClick={() => choose(item)}
          className={cn(
            'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-callout',
            i === current && 'bg-accent'
          )}
        >
          {item.kind === 'skill' ? (
            <>
              <span className="shrink-0">{item.skill.name}</span>
              {item.skill.description !== undefined && (
                <span
                  className="min-w-0 truncate text-caption text-muted-foreground"
                  title={item.skill.description}
                >
                  {item.skill.description}
                </span>
              )}
            </>
          ) : (
            <>
              <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{item.title}</span>
              <span className="ml-auto min-w-0 shrink truncate text-caption text-muted-foreground">
                {item.rel}
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  )

  return {
    chips,
    menu,
    onKeyDown,
    trackCaret,
    submit,
    assistOpen: open,
    assistCount: open ? items.length : 0,
    assistActiveId: `chat-assist-option-${current}`
  }
}
