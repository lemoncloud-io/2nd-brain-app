// 근거 인스펙터 — 채팅·검색·그래프·점검·승인에서 근거를 누르면 옆 칸의 "참고한 페이지" 에서 읽는다.
// 옆 칸이라 중앙 문서를 덮지 않는다. 안의 링크는 이 칸 내용만 바꾸고 기록에 쌓지 않는다 —
// 기록은 "위키에서 열기"부터다. 닫거나 "← 채팅으로" 를 누르면 근거를 열기 전 탭으로 돌아간다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, ChevronRight, FileText, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/layout/view'
import { WikilinkMarkdown } from '../../lib/wikilink-markdown'
import { openExternal } from '../../lib/open-external'

import { useWorkbench, type Peek } from '../../store/workbench'
import { CHAT_TABS } from '../chat/chat-tabs'
import { cn } from '../../lib/utils'
import { FrontmatterPanel } from './frontmatter-panel'
import { folderLabel, parentLabel } from '../../lib/vault-path'
import {
  scrollToSourceLine,
  useConnections,
  usePageIndex,
  useWikiRead,
  withoutTitleHeading
} from './use-wiki-read'
import { useT } from '../../lib/i18n'

export const PeekPane = (): React.JSX.Element => {
  const t = useT()
  const peek = useWorkbench((s) => s.peek)
  return peek ? (
    <PeekPaneContent peek={peek} />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <EmptyState
        icon={FileText}
        title={t.wikiPanes.peek.emptyTitle}
        description={t.wikiPanes.peek.emptyHint}
      />
    </div>
  )
}

/** 처음에 보일 이어진 페이지 수 — 더 있으면 "더 보기" 로 편다 */
const CONNECTIONS_SHOWN = 8

/**
 * 이어진 페이지 — 그래프에서 점을 누르면 그 점의 이웃이 여기 뜬다(3d-brain 서랍의 연결 목록).
 * 누르면 이 칸이 그 페이지로 바뀌고, 그래프도 그 점으로 옮겨 간다. 읽는 칸이라 본문 뒤에 접어 두고,
 * 편 상태는 페이지를 옮겨 다녀도 유지한다(그래프에서 이웃을 따라 걷는 길)
 */
const PeekConnections = ({
  rel,
  open,
  onToggle,
  onOpen
}: {
  rel: string
  open: boolean
  onToggle: () => void
  onOpen: (rel: string) => void
}): React.JSX.Element | null => {
  const t = useT()
  const connections = useConnections(rel)
  const [all, setAll] = useState(false)
  // 다른 페이지로 바뀌면 다시 접는다
  const [shownFor, setShownFor] = useState(rel)
  if (shownFor !== rel) {
    setShownFor(rel)
    setAll(false)
  }
  if (connections.length === 0) return null
  const shown = all ? connections : connections.slice(0, CONNECTIONS_SHOWN)
  return (
    <section data-testid="wiki-peek-connections" className="mt-10 border-t border-hairline pt-3">
      <h2 className="text-caption text-muted-foreground">
        <button
          type="button"
          data-testid="wiki-peek-connections-toggle"
          aria-expanded={open}
          onClick={onToggle}
          className="focus-ring flex min-h-7 w-full items-center gap-1 rounded-sm px-1 text-left hover:text-foreground"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          />
          <span className="flex-1">{t.wikiPanes.peek.connections}</span>
          <span className="tabular-nums">{connections.length}</span>
        </button>
      </h2>
      {open && (
        <>
          <ul className="mt-1 flex flex-col">
            {shown.map((c) => (
              <li key={c.rel}>
                <button
                  type="button"
                  data-testid="wiki-peek-connection"
                  title={c.rel}
                  onClick={() => onOpen(c.rel)}
                  className="focus-ring flex min-h-7 w-full items-baseline gap-3 rounded-sm px-1 text-left hover:bg-accent"
                >
                  <span className="min-w-0 flex-1 truncate text-label">{c.title}</span>
                  <span className="shrink-0 truncate text-caption text-muted-foreground">
                    {parentLabel(c.rel)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {connections.length > CONNECTIONS_SHOWN && (
            <button
              type="button"
              data-testid="wiki-peek-connections-more"
              onClick={() => setAll((v) => !v)}
              className="focus-ring mt-1 rounded-sm px-1 text-caption text-muted-foreground hover:text-foreground"
            >
              {all
                ? t.wikiPanes.peek.fold
                : t.wikiPanes.peek.more(connections.length - CONNECTIONS_SHOWN)}
            </button>
          )}
        </>
      )}
    </section>
  )
}

const PeekPaneContent = ({ peek }: { peek: Peek }): React.JSX.Element => {
  const t = useT()
  const closePeek = useWorkbench((s) => s.closePeek)
  const openPeek = useWorkbench((s) => s.openPeek)
  const openChat = useWorkbench((s) => s.openChat)
  const peekFrom = useWorkbench((s) => s.peekFrom)
  const back = CHAT_TABS.find((t) => t.id === peekFrom)
  const navigate = useWorkbench((s) => s.navigate)
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const index = usePageIndex()
  const { read, error, reload } = useWikiRead(peek.rel)
  const paneRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 근거를 연 곳 — 닫으면 거기로 포커스를 돌린다. 안의 링크로 내용이 바뀌면 처음 근거를 그대로 둔다
  const returnFocus = useRef<Element | null>(null)

  // 밖에서 근거를 열면 칸에 초점이 따라간다 — 칸 안 이동·쓰는 중은 조용하다
  // 이 칸은 근거가 열릴 때만 마운트된다 — 마운트 자체가 "밖에서 열기"라 신호를 듣지 않아도 된다.
  // 안의 링크로 옮겨 다니면 마운트된 채 내용만 바뀌어 조용하다.
  // 글을 쓰는 중이면 초점을 뺏지 않는다 — 채팅에서 근거를 눌러도 쓰던 자리가 남는다
  useLayoutEffect(() => {
    const active = document.activeElement
    const typing =
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLInputElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    if (!typing) paneRef.current?.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => {
    const active = document.activeElement
    if (!paneRef.current?.contains(active)) returnFocus.current = active
  }, [peek])

  // 다른 근거로 바뀌면 맨 위부터, 줄이 있으면 그 줄로
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !read) return
    if (peek.line === null) el.scrollTop = 0
    else scrollToSourceLine(el, read, peek.line)
  }, [read, peek.line])

  // 돌아간 탭이 그려진 뒤에 초점을 준다 — 숨긴 칸 안의 단추(답 아래 칩)는 그 전엔 초점을 못 받는다.
  // 연 곳이 없거나 사라졌으면 돌아간 탭 단추로
  const returnTo = (tab: string): void => {
    const target = returnFocus.current
    requestAnimationFrame(() => {
      if (target instanceof HTMLElement && target.isConnected && target.offsetParent !== null) {
        target.focus()
      } else document.getElementById(`chat-tab-${tab}`)?.focus()
    })
  }
  const close = (): void => {
    closePeek()
    returnTo(peekFrom ?? 'chat')
  }

  return (
    <div
      ref={paneRef}
      tabIndex={-1}
      role="region"
      aria-label={read ? t.wikiPanes.peek.regionOf(read.page.title) : t.wikiPanes.peek.region}
      data-testid="wiki-peek"
      className="flex min-h-0 flex-1 flex-col outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          close()
        }
      }}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-hairline pr-1 pl-1">
        {back && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2"
            data-testid="wiki-peek-back"
            onClick={() => {
              // 근거는 그대로 둔다 — 참고한 페이지 탭을 누르면 읽던 자리로 다시 온다
              openChat(back.id)
              returnTo(back.id)
            }}
          >
            <ArrowLeft aria-hidden /> {back.back}
          </Button>
        )}
        <p
          aria-label={peek.rel}
          className={cn(
            'min-w-0 flex-1 truncate text-caption text-muted-foreground',
            !back && 'pl-2'
          )}
        >
          {folderLabel(peek.rel)}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={!read}
          data-testid="wiki-peek-open"
          onClick={() => navigate(peek.rel, peek.line)}
        >
          <ArrowUpRight aria-hidden /> {t.wikiPanes.peek.open}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.wikiPanes.peek.close}
          data-testid="wiki-peek-close"
          onClick={close}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="px-4 py-10" data-testid="wiki-peek-error">
            <p className="text-heading">{error.text}</p>
            <p className="mt-1 text-caption text-muted-foreground wrap-anywhere">
              {t.wikiPanes.peek.gone}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              data-testid="wiki-peek-retry"
              onClick={reload}
            >
              {t.wikiDoc.reopen}
            </Button>
          </div>
        ) : read ? (
          <article data-testid="wiki-peek-reader" className="px-4 pt-6 pb-16">
            <h1 className="text-title wrap-anywhere">{read.page.title}</h1>
            {peek.cited && peek.line === null && (
              <p data-testid="wiki-peek-whole" className="mt-1 text-caption text-muted-foreground">
                {t.wikiPanes.peek.whole}
              </p>
            )}
            <FrontmatterPanel page={read.page} />
            {/* 본문 h2 는 리더와 같은 18px(text-title) — 좁은 칸의 작은 본문 글자에 em 으로 따라 줄지 않게 */}
            <div className="prose-wiki prose-compact mt-6 [&_h2]:text-[length:var(--text-title)]">
              <WikilinkMarkdown
                text={withoutTitleHeading(read.page.body, read.page.title)}
                index={index}
                onNavigate={openPeek}
                onOpenExternal={openExternal}
              />
            </div>
            <PeekConnections
              rel={peek.rel}
              open={connectionsOpen}
              onToggle={() => setConnectionsOpen((v) => !v)}
              onOpen={openPeek}
            />
          </article>
        ) : (
          <p role="status" className="px-4 py-10 text-caption text-muted-foreground">
            {t.preview.loading}
          </p>
        )}
      </div>
    </div>
  )
}
