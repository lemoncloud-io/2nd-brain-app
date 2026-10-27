// ⌘K 팔레트 하나 — 문서 찾기가 기본, 입력이 `>` 로 시작하면 명령(⌘P 는 `>` 를 채운 채 연다).
// 문서 모드: 빈 입력은 최근 연 문서. 글자를 치면 제목·경로 일치가 즉시 뜨고, 150ms 뒤 검색 뷰와 같은
// hybrid 검색(키워드+뜻, `lib/use-wiki-search.ts`) 결과가 "본문·뜻" 구역으로 아래 붙는다(같은 문서는 한 번).
// 맨 끝은 늘 "검색 뷰에서 찾기" — 검색 뷰로 넘긴다. Enter 로 고른다.
import { Fragment, useMemo, useState } from 'react'
import { Dialog } from 'radix-ui'
import { FileText, Search, Terminal, TextSearch } from 'lucide-react'
import { cn } from '../lib/utils'
import { availableCommands, type Command } from '../lib/commands'
import { matchPages, paletteEntries } from '../lib/page-match'
import { fileEntries, findByKind, type FileEntry, type FindKind } from '../lib/file-find'
import { FindKindChips } from './find-kind-chips'
import { useWikiSearch } from '../lib/use-wiki-search'
import { useWorkbench } from '../store/workbench'
import { useT } from '../lib/i18n'

const RECENT_SHOWN = 8
const COMMAND_PREFIX = '>'

export const Palette = (): React.JSX.Element => {
  const t = useT()
  const open = useWorkbench((s) => s.paletteOpen)
  const seed = useWorkbench((s) => s.paletteSeed)
  const setOpen = useWorkbench((s) => s.setPaletteOpen)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[hsl(var(--shadow-color)/0.24)] animate-in fade-in-0 duration-150" />
        <Dialog.Content
          data-testid="palette"
          aria-describedby={undefined}
          className="fixed top-[14vh] left-1/2 z-50 flex max-h-[min(32rem,72vh)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-hairline bg-elevated shadow-overlay animate-in fade-in-0 zoom-in-[0.98] duration-150 ease-tactile"
        >
          <Dialog.Title className="sr-only">{t.shell.palette.title}</Dialog.Title>
          {/* 닫힐 때 언마운트 — 다음에 열면 미리 채운 글자부터 */}
          <PaletteBody seed={seed} onClose={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type Row =
  | { kind: 'page'; rel: string; title: string; tag: string | null }
  | { kind: 'hit'; rel: string; title: string; snippet: string }
  | { kind: 'search' }
  | { kind: 'command'; command: Command }

const rowKey = (row: Row): string =>
  row.kind === 'search' ? 'search' : row.kind === 'command' ? row.command.id : row.rel

const PaletteBody = ({
  seed,
  onClose
}: {
  seed: string
  onClose: () => void
}): React.JSX.Element => {
  const t = useT()
  const pages = useWorkbench((s) => s.pages)
  const docs = useWorkbench((s) => s.docs)
  const tree = useWorkbench((s) => s.tree)
  const searchText = useWorkbench((s) => s.searchText)
  const recent = useWorkbench((s) => s.recent)
  const selectedPage = useWorkbench((s) => s.selectedPage)
  const openFile = useWorkbench((s) => s.openFile)
  const search = useWikiSearch()
  const [query, setQuery] = useState(seed)
  const [kind, setKind] = useState<FindKind | null>(null)
  const [active, setActive] = useState(0)

  const commandMode = query.startsWith(COMMAND_PREFIX)
  const text = (commandMode ? query.slice(COMMAND_PREFIX.length) : query).trim()

  // md 는 제목으로, 그 밖의 파일(PDF·그림…)은 이름으로 — 같은 목록에서 고른다
  const all = useMemo(
    (): FileEntry[] => [
      ...paletteEntries(pages ?? [], docs ?? [], tree ?? []).map((p) => ({ ...p, tag: null })),
      ...fileEntries(tree ?? [])
    ],
    [pages, docs, tree]
  )
  // 본문 검색은 문서만 본다 — 다른 종류를 고르면 본문 행을 내지 않는다
  const bodyShown = kind === null || kind === 'doc'
  // 명령 표는 열릴 때 한 번 — 부를 수 있는지는 store 편집 상태로 잰다
  const commands = useMemo(
    () =>
      availableCommands(useWorkbench.getState()).map((c) => ({
        rel: c.label,
        title: c.label,
        command: c
      })),
    []
  )

  const rows = useMemo((): Row[] => {
    if (commandMode) {
      const shown = text === '' ? commands : matchPages(commands, text)
      return shown.map((c) => ({ kind: 'command', command: c.command }))
    }
    if (text === '' && kind === null) {
      const byRel = new Map(all.map((p) => [p.rel, p]))
      return recent
        .map((rel) => byRel.get(rel))
        .filter((p): p is FileEntry => p !== undefined)
        .slice(0, RECENT_SHOWN)
        .map((p) => ({ kind: 'page', ...p }))
    }
    const titled = findByKind(all, kind, text)
    if (text === '' || !bodyShown) return titled.map((p): Row => ({ kind: 'page', ...p }))
    const seen = new Set(titled.map((p) => p.rel))
    // 입력이 바뀐 뒤 아직 안 온 동안 옛 질의의 결과는 보이지 않는다
    const hits = (search.hitsFor === query ? (search.hits ?? []) : [])
      .filter((h) => !seen.has(h.rel))
      .map((h): Row => ({
        kind: 'hit',
        rel: h.rel,
        title: h.title,
        snippet: h.snippet
      }))
    return [...titled.map((p): Row => ({ kind: 'page', ...p })), ...hits, { kind: 'search' }]
  }, [
    all,
    bodyShown,
    commands,
    commandMode,
    kind,
    query,
    recent,
    search.hits,
    search.hitsFor,
    text
  ])
  const count = rows.length

  const choose = (index: number): void => {
    const row = rows[index]
    if (row === undefined) return
    onClose()
    if (row.kind === 'command') row.command.run(useWorkbench.getState())
    else if (row.kind === 'search') searchText(text)
    else {
      // 새 탭에 연다 — 읽던 글은 그 탭에 그대로. 빈 탭과 이미 보고 있는 그 문서는 제자리에서
      const state = useWorkbench.getState()
      const here = state.openDocument()
      openFile(row.rel, !(state.view === 'doc' && (here === null || here === row.rel)))
    }
  }

  const optionId = (i: number): string => `palette-option-${i}`
  const current = Math.min(active, Math.max(count - 1, 0))

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    // 한글 조합 중 Enter 는 글자를 끝낼 뿐 항목을 고르지 않는다
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (count === 0) return
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const next = (current + delta + count) % count
      setActive(next)
      document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      // Home·End는 글자칸 약속(맨 앞·맨 뒤)이라 건드리지 않는다 — 쪽 이동만 받는다
      e.preventDefault()
      if (count === 0) return
      const delta = e.key === 'PageDown' ? 10 : -10
      const next = (current + delta + count) % count
      setActive(next)
      document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (count > 0) choose(current)
    }
  }

  const onChange = (value: string): void => {
    setQuery(value)
    setActive(0)
    // 명령 모드에선 본문 검색을 돌리지 않는다 — 빈 질의로 결과를 비운다
    search.schedule(value.startsWith(COMMAND_PREFIX) ? '' : value)
  }

  const empty = commandMode
    ? t.shell.palette.noCommand
    : all.length === 0
      ? t.shell.palette.noDocs
      : kind !== null
        ? t.library.noKindMatch
        : t.shell.palette.noRecent
  const hitsStart = rows.findIndex((r) => r.kind === 'hit')
  // 입력칸 아래 한 줄 — 검색 실패만 알린다
  const note = search.error ? t.shell.palette.searchFailed(search.error.text) : null

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-hairline px-4">
        {commandMode ? (
          <Terminal aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded={count > 0}
          aria-controls="palette-list"
          aria-activedescendant={count > 0 ? optionId(current) : undefined}
          aria-label={commandMode ? t.shell.palette.commandName : t.shell.palette.inputLabel}
          placeholder={commandMode ? t.shell.palette.commandName : t.shell.palette.inputPlaceholder}
          data-testid="palette-input"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {!commandMode && (
        <FindKindChips
          value={kind}
          onChange={(next) => {
            setKind(next)
            setActive(0)
          }}
          testId="palette-kind"
          className="border-b border-hairline px-4 py-1.5"
        />
      )}
      {!commandMode && text !== '' && note !== null && (
        <p
          data-testid="palette-note"
          role="status"
          data-state={search.error ? 'error' : undefined}
          className="border-b border-hairline px-4 py-1.5 text-micro text-muted-foreground"
        >
          {note}
        </p>
      )}
      {count === 0 ? (
        <p data-testid="palette-empty" className="px-4 py-6 text-caption text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="scrollbar-thin min-h-0 overflow-y-auto p-1.5">
          <div
            id="palette-list"
            role="listbox"
            aria-label={commandMode ? t.shell.palette.commands : t.shell.palette.docs}
          >
            {!commandMode && text === '' && kind === null && (
              <SectionLabel>{t.shell.palette.recent}</SectionLabel>
            )}
            {rows.map((row, i) => (
              <Fragment key={rowKey(row)}>
                {i === hitsStart && <SectionLabel>{t.shell.palette.body}</SectionLabel>}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === current}
                  data-testid={`palette-option:${rowKey(row)}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cn(
                    'flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2',
                    i === current && 'bg-accent'
                  )}
                >
                  {row.kind === 'command' ? (
                    <>
                      <Terminal aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate text-callout text-foreground">
                        {row.command.label}
                      </span>
                      <kbd className="ml-auto shrink-0 pl-3 text-micro text-muted-foreground">
                        {row.command.keys}
                      </kbd>
                    </>
                  ) : row.kind === 'search' ? (
                    <>
                      <TextSearch aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate text-callout text-foreground">
                        {t.shell.palette.searchView(text)}
                      </span>
                    </>
                  ) : (
                    <>
                      <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate text-callout text-foreground">
                        {row.title}
                      </span>
                      {row.kind === 'page' && row.tag !== null && (
                        <span className="shrink-0 text-micro text-muted-foreground">{row.tag}</span>
                      )}
                      {row.rel === selectedPage && (
                        <span className="shrink-0 text-caption text-muted-foreground">
                          {t.shell.palette.openDoc}
                        </span>
                      )}
                      {row.kind === 'hit' ? (
                        <span className="ml-auto min-w-0 truncate pl-3 text-caption text-muted-foreground">
                          {row.snippet}
                        </span>
                      ) : (
                        /* 경로가 길면 앞을 줄여 끝(파일 이름)이 보이게 — 사이드바 볼트 경로와 같은 방식 */
                        <span className="ml-auto min-w-0 shrink truncate pl-3 text-caption text-muted-foreground [direction:rtl]">
                          <bdi dir="ltr">{row.rel.replace(/^wiki\//, '')}</bdi>
                        </span>
                      )}
                    </>
                  )}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

const SectionLabel = ({ children }: { children: string }): React.JSX.Element => (
  <p
    role="presentation"
    className="px-2.5 pt-1.5 pb-1 text-caption font-medium text-muted-foreground"
  >
    {children}
  </p>
)
