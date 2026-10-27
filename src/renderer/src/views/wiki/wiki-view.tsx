import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DropdownMenu } from 'radix-ui'
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Columns2,
  FolderSearch,
  History,
  MoreHorizontal,
  Pencil
} from 'lucide-react'
import { EmptyState, ViewHeader } from '../../components/layout/view'
import { Button } from '../../components/ui/button'
import { ErrorNote } from '../../components/error-note'
import { fileManagerName, usePlatform } from '../../hooks/use-platform'
import { toUserError, type UserError } from '../../lib/user-error'
import { setReaderScrollTop, useWorkbench } from '../../store/workbench'
import { useNextStep } from '../../hooks/use-next-step'
import { FrontmatterPanel, type SetProperty } from './frontmatter-panel'
import { setProperty } from '../../../../shared/wiki/properties'
import { BacklinksPane } from './backlinks-pane'
import { FindBar } from './find-bar'
import { clampHit, countHits, markCurrentHit } from '../../lib/find-dom'
import { parentLabel } from '../../lib/vault-path'
import { WikiEditor } from './wiki-editor'
import { WikilinkMarkdown } from '../../lib/wikilink-markdown'
import { openExternal } from '../../lib/open-external'
import {
  scrollToSourceLine,
  useBacklinks,
  usePageIndex,
  useWikiRead,
  withoutTitleHeading
} from './use-wiki-read'
import { ChangedToggle } from './changed-toggle'
import { TodayStrip } from '../today-strip'
import { BlankTab } from '../blank-tab'
import { useTodayNotes } from '../../hooks/use-today'
import { useDocChanges } from './use-doc-changes'
import { marksFor, nothingMarked } from '../../lib/doc-marks'
import { OutlineMenu, OutlinePane } from './outline-pane'
import { HistoryDiff } from './history-diff'
import { versionWhen } from '../../lib/doc-version'
import { useDocNotice } from '../../lib/doc-notice'
import { readerOffset, useCheckboxToggle } from './use-checkbox-toggle'
import { getT, useT } from '../../lib/i18n'

const ENTRY_PAGE = 'wiki/INDEX.md'
const isMac = navigator.userAgent.includes('Mac')

export const WikiView = (): React.JSX.Element => {
  const t = useT()
  const view = useWorkbench((s) => s.view)
  const pages = useWorkbench((s) => s.pages)
  const pagesError = useWorkbench((s) => s.pagesError)
  const next = useNextStep()
  const selectedPage = useWorkbench((s) => s.selectedPage)
  const selectPage = useWorkbench((s) => s.selectPage)
  const navigate = useWorkbench((s) => s.navigate)
  const openFile = useWorkbench((s) => s.openFile)
  // 본문 링크는 새 탭에 연다 — 읽던 글의 자리를 잃지 않는다. 참조가 바뀌면 본문이 다시 마운트된다
  const openInNewTab = useCallback((rel: string): void => openFile(rel, true), [openFile])
  const editingRel = useWorkbench((s) => s.editing)
  const setEditing = useWorkbench((s) => s.setEditing)
  const setEditorDirty = useWorkbench((s) => s.setEditorDirty)
  const leaveEditor = useWorkbench((s) => s.leaveEditor)
  const titleEdit = useWorkbench((s) => s.titleEdit)
  const setTitleEdit = useWorkbench((s) => s.setTitleEdit)
  const freshNote = useWorkbench((s) => s.freshNote)
  const relocated = useWorkbench((s) => s.relocated)
  const back = useWorkbench((s) => s.back)
  const previous = useWorkbench((s) => s.history.entries[s.history.cursor - 1] ?? null)
  const index = usePageIndex()
  const bookmarks = useWorkbench((s) => s.bookmarks)
  const toggleBookmark = useWorkbench((s) => s.toggleBookmark)
  const openSplit = useWorkbench((s) => s.openSplit)
  const toggleHistory = useWorkbench((s) => s.toggleHistory)
  const historyShown = useWorkbench((s) => s.chatOpen && s.chatTab === 'history')
  const platform = usePlatform()
  const pickVersion = useWorkbench((s) => s.pickVersion)
  const versionPick = useWorkbench((s) => s.versionPick)
  const backlinks = useBacklinks(selectedPage)
  // 리더 찾기 — 띠가 열린 페이지는 store(⌘F 가 켠다), 질의·자리는 그 페이지에 묶어 둔다: 페이지가 바뀌면 둘 다 저절로 빈다
  const findFor = useWorkbench((s) => s.findFor)
  const setFindFor = useWorkbench((s) => s.setFindFor)
  const findOpen = findFor !== null && findFor === selectedPage
  const [findState, setFindState] = useState({ rel: '', query: '', at: 0 })
  const findQuery = findState.rel === selectedPage ? findState.query : ''
  const findAt = findState.rel === selectedPage ? findState.at : 0
  const [findTotal, setFindTotal] = useState(0)
  // 형광은 질의만 받는다 — 지금 자리는 그려진 mark 에 속성으로 얹어 Enter 마다 본문을 다시 그리지 않는다
  const find = useMemo(
    () => (findOpen && findQuery !== '' ? { query: findQuery } : undefined),
    [findOpen, findQuery]
  )
  // 실행 시 첫 화면 — 오늘 노트가 있으면 그것이 열린다
  const { today } = useTodayNotes()
  const tree = useWorkbench((s) => s.tree)
  const treeError = useWorkbench((s) => s.treeError)
  const { read, error: readError, reload } = useWikiRead(selectedPage)
  const editing = read !== null && editingRel === read.page.rel
  // 고른 버전은 그 문서를 보는 동안만이다 — 다른 문서로 가거나 편집을 열면 내려놓는다.
  // 남겨 두면 돌아왔을 때 리더 대신 지난 비교가 뜬다
  const pickRel = versionPick?.rel ?? null
  useEffect(() => {
    if (pickRel !== null && (editingRel !== null || selectedPage !== pickRel)) pickVersion(null)
  }, [pickRel, editingRel, selectedPage, pickVersion])
  // 비교를 닫거나 되돌린 뒤 — 누른 단추가 사라지므로 초점을 고른 버전 행(기록 탭이 보이면)이나 리더로 옮긴다
  const focusAfterCompare = (rev: string): void => {
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-history-rev="${rev}"]`)
      if (row !== null && row.offsetParent !== null) row.focus()
      else scrollRef.current?.focus({ preventScroll: true })
    })
  }

  const [notice, setNotice] = useDocNotice(selectedPage)
  const shownNotice = editing ? null : notice
  // 편집을 열 때 읽던 자리 — 저장·취소 뒤 리더가 거기로 돌아온다
  const readerTop = useRef(0)
  // 같은 자리의 비율(0~1) — 편집기는 줄 높이가 달라 픽셀이 아니라 비율로 연다
  const readerRatio = useRef(0)
  const editFrom = useRef<number | null>(null)
  // 이동 확인으로 편집을 떠났으면(저장·취소를 거치지 않음) 기억한 자리를 버린다
  useEffect(() => {
    editFrom.current = editing ? (editFrom.current ?? readerTop.current) : null
  }, [editing])
  const backToReading = (): void => {
    if (editFrom.current !== null) useWorkbench.setState({ pendingScroll: editFrom.current })
    editFrom.current = null
  }

  // 바뀐 곳 — 지금 문서에 걸린 기준만 본다
  const changedFor = useWorkbench((s) => s.changedFor)
  const setChangedSince = useWorkbench((s) => s.setChangedSince)
  const changed = read && changedFor?.rel === read.page.rel ? changedFor : null
  const body = read ? withoutTitleHeading(read.page.body, read.page.title) : ''
  const { changes, unavailable, loading } = useDocChanges(
    read?.page.rel ?? null,
    changed?.since ?? null,
    read?.hash
  )
  // 리더는 frontmatter 와 같은 제목 줄을 뺀 본문을 그린다 — 뺀 만큼 줄 번호를 당긴다.
  // deps 는 `read` 객체가 아니라 그 숫자다: 다시 읽을 때마다 새 `Marks` 를 만들면 본문이 다시
  // 마운트돼 펼쳐 둔 "지운 글" 이 접힌다(wikilink-markdown 의 컴포넌트 캐시)
  const offset = read === null ? 0 : readerOffset(read)
  const marks = useMemo(
    () => (changes === null ? undefined : marksFor(body, changes, offset)),
    [body, changes, offset]
  )

  // 누르면 저장되는 체크박스와 "열린 항목만" — 편집기를 열지 않고 하루 루프를 굴린다
  const { toggle, error: toggleError } = useCheckboxToggle(read, reload)
  const [openOnly, setOpenOnly] = useState(false)
  // 속성 칸 — 한 키를 고쳐 편집과 같은 길(`edit:` 커밋)로 저장한다
  const [propError, setPropError] = useState<UserError | null>(null)
  const setProp: SetProperty = async (key, value) => {
    if (read === null) return getT().wikiDoc.noDoc
    const next = setProperty(read.text, key, value)
    const failed = !next.ok
      ? next.reason
      : await window.api
          .writeWikiPage(read.page.rel, next.text, read.hash)
          .then((r) => ('error' in r ? r.error : null))
          .catch((e: unknown) => (e instanceof Error ? e.message : String(e)))
    if (failed === null) {
      setPropError(null)
      reload()
      return null
    }
    const shown = toUserError(failed, getT().wikiDoc.propSaveFailed)
    setPropError(shown)
    return shown.text
  }
  // 표시할 것이 없는 이유를 토글 옆에 한 줄로 — 묻는 중과 "없다" 와 "못 읽었다" 를 가른다
  const changedNote =
    unavailable ??
    (loading
      ? t.wikiDoc.changes.finding
      : marks === undefined || !nothingMarked(marks)
        ? null
        : // 본문 밖 = 리더가 따로 그리는 앞부분(속성 블록·제목 줄)
          marks.outside > 0
          ? t.wikiDoc.changes.outside
          : t.wikiDoc.changes.none)

  // 처음 들어오면 오늘 노트를 연다 — 없으면 위키 입구(INDEX). 기록에는 쌓지 않는다.
  // 트리를 읽기 전에 INDEX 로 정해 버리면 오늘 노트가 있는 사람도 위키로 열린다 — 트리를 기다린다
  // (못 읽었으면 기다려도 오지 않는다: treeError 면 그냥 옛 규칙으로 연다)
  // 첫 화면을 스스로 채운다 — 오늘 노트가 있으면 그것, 없으면 위키 입구.
  // 한 번만이다(`autoOpened`): 사용자가 연 빈 탭까지 채우면 새 탭이 오늘 노트의 복사본이 된다
  const autoOpened = useWorkbench((s) => s.autoOpened)
  useEffect(() => {
    if (selectedPage !== null || autoOpened) return
    if (today !== null) {
      selectPage(today.rel)
      useWorkbench.setState({ autoOpened: true })
      return
    }
    if (tree === null && treeError === null) return
    if (pages?.some((p) => p.rel === ENTRY_PAGE)) {
      selectPage(ENTRY_PAGE)
      useWorkbench.setState({ autoOpened: true })
    }
  }, [today, tree, treeError, pages, selectedPage, selectPage, autoOpened])

  // 뒤로·앞으로 복원과 점검 줄 이동 — 보이는 리더에서만 소비한다(숨긴 뷰는 스크롤이 먹지 않는다)
  const scrollRef = useRef<HTMLDivElement>(null)
  const focusLine = useWorkbench((s) => s.focusLine)
  const pendingScroll = useWorkbench((s) => s.pendingScroll)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !read || editing || view !== 'doc') return
    if (focusLine !== null) {
      scrollToSourceLine(el, read, focusLine)
      useWorkbench.setState({ focusLine: null, pendingScroll: null })
    } else if (pendingScroll !== null) {
      el.scrollTop = pendingScroll
      useWorkbench.setState({ pendingScroll: null })
    }
    setReaderScrollTop(el.scrollTop)
    readerTop.current = el.scrollTop
  }, [focusLine, pendingScroll, read, editing, view])

  // 일치 수·지금 자리는 그린 결과에서 센다(화면 순서) — 본문 마크다운과 그린 글자가 다르고, 접힌 블록은 그려지지 않는다.
  // deps 에 openOnly·marks: 접힘·바뀐 곳 표시가 바뀌면 그려진 mark 수가 달라진다
  useEffect(() => {
    const el = scrollRef.current
    // 그린 뒤에야 셀 수 있는 값이다 — 렌더 중에는 DOM 이 없다

    setFindTotal(el === null || find === undefined ? 0 : countHits(el))
  }, [find, body, openOnly, marks])
  const shownAt = clampHit(findAt, findTotal)
  // 지금 자리 표시 — 자리가 바뀔 때만 스크롤하고, 본문이 다시 그려져 표시가 지워졌을 때는 표시만 되살린다
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el === null || find === undefined) return
    const key = `${find.query}\u0000${shownAt}`
    markCurrentHit(el, shownAt, scrolledTo.current !== key)
    scrolledTo.current = key
  }, [find, shownAt, findTotal, body, openOnly, marks])
  const stepFind = (delta: 1 | -1): void => {
    if (findTotal === 0 || selectedPage === null) return
    setFindState({
      rel: selectedPage,
      query: findQuery,
      at: (shownAt + delta + findTotal) % findTotal
    })
  }

  // 트리에서 고른 문서가 있으면 위키가 비어도 연다 — 개인 노트·계획은 위키 밖에 산다
  if (selectedPage === null && (pagesError || (pages !== null && pages.length === 0))) {
    return (
      <>
        <ViewHeader title={t.shell.newTab} />
        <TodayStrip />
        {pagesError ? (
          <EmptyState icon={BookOpen} title={t.wikiDoc.readFailed} description={pagesError} />
        ) : (
          <EmptyState
            icon={BookOpen}
            title={t.wikiDoc.emptyTitle}
            description={t.wikiDoc.emptyHint}
            action={next}
          />
        )}
      </>
    )
  }

  const previousLabel =
    previous === null
      ? null
      : previous.view === 'doc'
        ? (pages?.find((p) => p.rel === previous.page)?.title ?? t.views.doc)
        : t.views[previous.view]

  return (
    <>
      {/* 머리 제목은 지금 문서 이름 — 어느 문서든 같은 "위키" 는 아무것도 말하지 않았다. 설명은 담긴 폴더만 */}
      <ViewHeader
        heading={read == null}
        title={read ? read.page.title : selectedPage === null ? t.shell.newTab : t.views.doc}
        description={read ? parentLabel(read.page.rel) || undefined : undefined}
        descriptionTitle={read?.page.rel}
        leading={
          previousLabel !== null && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 max-w-48 text-muted-foreground"
              data-testid="wiki-back"
              title={t.wikiDoc.back(isMac ? '⌘[' : 'Ctrl+[')}
              onClick={back}
            >
              <ArrowLeft aria-hidden />
              <span className="truncate">{previousLabel}</span>
            </Button>
          )
        }
      >
        {read && !editing && (
          <>
            <OutlineMenu
              text={body}
              marks={marks}
              openOnly={openOnly}
              onOpenOnly={setOpenOnly}
              scrollRef={scrollRef}
            />
            <ChangedToggle
              since={changed?.since ?? null}
              changeId={changed?.changeId ?? null}
              note={changedNote}
              onPick={setChangedSince}
            />
            {/* 가끔 쓰는 것은 더보기 메뉴에 접는다 — 머리에는 바뀐 곳·편집만 남긴다 */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  data-testid="wiki-more"
                  aria-label={t.wikiDoc.more}
                  title={t.wikiDoc.moreHint}
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  data-testid="wiki-more-menu"
                  className="z-50 min-w-48 overflow-y-auto rounded-md border border-hairline bg-elevated p-1 shadow-lg"
                >
                  <DropdownMenu.Item
                    data-testid="wiki-split"
                    onSelect={() => openSplit(read.page.rel)}
                    className="flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-callout text-foreground outline-none select-none data-[highlighted]:bg-accent"
                  >
                    <Columns2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    {t.wikiDoc.openSplit}
                  </DropdownMenu.Item>
                  <DropdownMenu.CheckboxItem
                    data-testid="wiki-bookmark"
                    checked={bookmarks.includes(read.page.rel)}
                    onCheckedChange={() =>
                      void toggleBookmark(read.page.rel).then((failed) =>
                        setPropError(
                          failed === null
                            ? null
                            : toUserError(failed, getT().wikiDoc.bookmarkFailed)
                        )
                      )
                    }
                    className="flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-callout text-foreground outline-none select-none data-[highlighted]:bg-accent"
                  >
                    <Bookmark aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    {bookmarks.includes(read.page.rel) ? t.wikiDoc.unbookmark : t.wikiDoc.bookmark}
                  </DropdownMenu.CheckboxItem>
                  <DropdownMenu.CheckboxItem
                    data-testid="wiki-history"
                    checked={historyShown}
                    onCheckedChange={toggleHistory}
                    className="flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-callout text-foreground outline-none select-none data-[highlighted]:bg-accent"
                  >
                    <History aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    {t.wikiDoc.history}
                  </DropdownMenu.CheckboxItem>
                  <DropdownMenu.Item
                    data-testid="wiki-reveal"
                    onSelect={() => void window.api.revealInFinder(read.page.rel)}
                    className="flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-callout text-foreground outline-none select-none data-[highlighted]:bg-accent"
                  >
                    <FolderSearch aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    {t.shell.revealIn(fileManagerName(platform))}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <Button
              variant="outline"
              size="sm"
              data-testid="wiki-edit"
              onClick={() => {
                setNotice(null)
                setEditing(read.page.rel)
              }}
            >
              <Pencil /> {t.wikiDoc.edit}
            </Button>
          </>
        )}
      </ViewHeader>

      <TodayStrip />

      {read && !editing && findOpen && (
        <FindBar
          query={findQuery}
          onQueryChange={(query) => setFindState({ rel: read.page.rel, query, at: 0 })}
          total={findTotal}
          at={shownAt}
          onStep={stepFind}
          onClose={() => setFindFor(null)}
        />
      )}

      {/* 늘 있는 알림 자리 — 내용이 바뀌어야 스크린리더가 읽는다 */}
      <div role="status" className="shrink-0">
        {shownNotice && (
          <div
            data-testid="wiki-notice"
            className="flex items-center gap-3 border-b border-hairline px-6 py-1.5 text-caption text-muted-foreground"
          >
            <span>{shownNotice.text}</span>
            {shownNotice.undo && (
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                data-testid="wiki-notice-undo"
                onClick={shownNotice.undo}
              >
                {t.wikiDoc.undo}
              </Button>
            )}
          </div>
        )}
      </div>

      {read && editing ? (
        <WikiEditor
          rel={read.page.rel}
          initialText={read.text}
          baseHash={read.hash}
          index={index}
          onNavigate={navigate}
          onOpenExternal={openExternal}
          nameFirst={titleEdit === read.page.rel}
          startRatio={() => readerRatio.current}
          onSaved={(renamedTo) => {
            setEditing(null)
            setTitleEdit(null)
            useWorkbench.setState({ freshNote: null })
            backToReading()
            setNotice({ rel: renamedTo ?? read.page.rel, text: getT().wikiDoc.saved })
            if (renamedTo !== null) relocated(read.page.rel, renamedTo)
            else reload()
          }}
          onCancel={() =>
            leaveEditor(() => {
              backToReading()
              setEditing(null)
              setTitleEdit(null)
              useWorkbench.setState({ freshNote: null })
              // 막 만든 노트를 한 글자도 안 쓰고 닫으면 빈 "제목 없음" 이 트리에 쌓인다 — 휴지통으로 치운다
              if (freshNote === read.page.rel && read.text === '') {
                const rel = read.page.rel
                void window.api.trashVaultEntry(rel).then((result) => {
                  if ('ok' in result) relocated(rel, null)
                })
              }
            })
          }
          onDirtyChange={setEditorDirty}
        />
      ) : read && versionPick !== null && versionPick.rel === read.page.rel ? (
        // 기록에서 고른 버전 — 리더 자리에 바뀐 줄을 보인다. 닫거나 되돌리면 리더로 돌아온다
        <HistoryDiff
          key={versionPick.version.rev}
          rel={read.page.rel}
          version={versionPick.version}
          current={read.text}
          hash={read.hash}
          onClose={() => {
            pickVersion(null)
            focusAfterCompare(versionPick.version.rev)
          }}
          onRestored={(before) => {
            const rel = read.page.rel
            pickVersion(null)
            focusAfterCompare(versionPick.version.rev)
            reload()
            // 실행 취소 = 되돌리기 전 글을 같은 길로 다시 저장(`edit:` 커밋 하나 더). 그사이 문서가 바뀌면 저장 쪽이 거절한다
            const undo = (): void => {
              // 누른 단추가 알림과 함께 사라진다 — 초점은 리더로
              setNotice(null)
              scrollRef.current?.focus({ preventScroll: true })
              void window.api
                .writeWikiPage(rel, before.text, before.hash)
                .then((result) => {
                  if ('error' in result) throw result.error
                  setPropError(null)
                  setNotice({ rel, text: getT().wikiDoc.restoreUndone })
                  reload()
                })
                .catch((error: unknown) =>
                  setPropError(toUserError(error, getT().wikiDoc.restoreUndoFailed))
                )
            }
            setNotice({
              rel,
              text: getT().wikiDoc.restored(versionWhen(versionPick.version)),
              undo
            })
          }}
        />
      ) : (
        <div
          ref={scrollRef}
          // 비교를 닫은 뒤 초점이 갈 자리 — 탭 순서에는 넣지 않는다
          tabIndex={-1}
          onScroll={(e) => {
            const el = e.currentTarget
            setReaderScrollTop(el.scrollTop)
            readerTop.current = el.scrollTop
            readerRatio.current = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)
          }}
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto outline-none"
        >
          {read ? (
            <div className="mx-auto flex max-w-[58rem] items-start justify-center gap-4">
              <article
                data-testid="wiki-reader"
                className="min-w-0 max-w-[42rem] flex-1 px-8 pt-12 pb-24"
              >
                <h1 className="text-display wrap-anywhere">{read.page.title}</h1>
                <FrontmatterPanel page={read.page} onSet={setProp} />
                {propError && <ErrorNote error={propError} testId="prop-error" className="mt-2" />}
                {toggleError && (
                  <p
                    role="alert"
                    data-testid="wiki-check-error"
                    className="mt-4 text-caption text-destructive"
                  >
                    {toggleError}
                  </p>
                )}
                <div className="prose-wiki mt-8">
                  <WikilinkMarkdown
                    text={body}
                    index={index}
                    marks={marks}
                    openOnly={openOnly}
                    onNavigate={openInNewTab}
                    onOpenExternal={openExternal}
                    onOpenFile={openFile}
                    onToggleCheckbox={toggle}
                    find={find}
                  />
                </div>
                <BacklinksPane
                  page={read.page}
                  hash={read.hash}
                  backlinks={backlinks}
                  index={index}
                  onNavigate={navigate}
                />
              </article>
              <OutlinePane
                text={body}
                marks={marks}
                openOnly={openOnly}
                onOpenOnly={setOpenOnly}
                scrollRef={scrollRef}
              />
            </div>
          ) : readError ? (
            <EmptyState
              icon={BookOpen}
              title={readError.text}
              description={t.wikiDoc.movedHint}
              action={{ label: t.wikiDoc.reopen, testId: 'wiki-read-retry', onClick: reload }}
            />
          ) : selectedPage === null ? (
            // 빈 탭 — 설명 한 줄 대신 여기서 바로 할 수 있는 일을 세운다(Obsidian 의 새 탭)
            <BlankTab />
          ) : null}
        </div>
      )}
    </>
  )
}
