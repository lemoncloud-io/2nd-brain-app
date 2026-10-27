// 사이드바 위 칸 — 파일·태그·북마크(Obsidian 왼쪽 칸의 탭). 파일 트리는 숨겨도 마운트된 채다 —
// 편 폴더·스크롤·센 수가 탭을 오가도 남아야 한다.
import { useEffect, useMemo, useState } from 'react'
import { Bookmark, Files, Hash, X } from 'lucide-react'
import { FileTree } from '../tree/file-tree'
import { useWorkbench, type SidebarPane } from '../../store/workbench'
import { shortLabel } from '../../lib/vault-path'
import { toUserError } from '../../lib/user-error'
import type { TagEntry } from '../../../../shared/wiki/tags'
import { cn } from '../../lib/utils'
import { getT } from '../../lib/i18n'
import { useT } from '../../lib/i18n'

const PANES: { id: SidebarPane; icon: typeof Files }[] = [
  { id: 'files', icon: Files },
  { id: 'tags', icon: Hash },
  { id: 'bookmarks', icon: Bookmark }
]

const ROW =
  'focus-ring flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-callout text-foreground hover:bg-accent'

/** 태그 — 많이 쓴 순. 누르면 그 태그로 검색한다(`#태그`) */
const TagPane = (): React.JSX.Element => {
  const t = useT()
  const searchText = useWorkbench((s) => s.searchText)
  const [tags, setTags] = useState<TagEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  useEffect(() => {
    const load = (): void => {
      void window.api
        .listTags()
        .then((result) => {
          if ('error' in result) setError(result.error)
          else {
            setError(null)
            setTags(result)
          }
        })
        .catch((e: unknown) => setError(toUserError(e, getT().files.tagsFailed).text))
    }
    load()
    return window.api.onWikiChanged(load)
  }, [])
  const shown = useMemo(() => {
    const q = filter.trim().replace(/^#/, '').toLowerCase()
    return (tags ?? []).filter((t) => q === '' || t.tag.toLowerCase().includes(q))
  }, [tags, filter])
  return (
    <div data-testid="tag-pane" className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pb-1.5">
        <input
          aria-label={t.files.tagFilter}
          placeholder={t.files.tagFilter}
          data-testid="tag-filter"
          value={filter}
          spellCheck={false}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 w-full rounded-md border border-hairline bg-background px-2 text-callout outline-none placeholder:text-muted-foreground focus:border-ring"
        />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {error ? (
          <p role="alert" className="px-2 py-1 text-caption text-destructive">
            {error}
          </p>
        ) : tags === null ? (
          <p className="px-2 py-1 text-caption text-muted-foreground">{t.shell.reading}</p>
        ) : shown.length === 0 ? (
          <p data-testid="tag-empty" className="px-2 py-1 text-caption text-muted-foreground">
            {tags.length === 0 ? t.files.tagsEmpty : t.files.tagsNoMatch}
          </p>
        ) : (
          shown.map((tag) => (
            <button
              key={tag.tag}
              type="button"
              className={ROW}
              data-testid={`tag-row:${tag.tag}`}
              title={t.files.tagFind(tag.tag)}
              onClick={() => searchText(`#${tag.tag}`)}
            >
              <span className="min-w-0 flex-1 truncate">#{tag.tag}</span>
              <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                {tag.count}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/** 북마크 — 단 순서대로. 누르면 연다. 이름이 같은 문서가 갈리게 바로 위 폴더를 같이 보인다 */
const BookmarkPane = (): React.JSX.Element => {
  const t = useT()
  const bookmarks = useWorkbench((s) => s.bookmarks)
  const toggleBookmark = useWorkbench((s) => s.toggleBookmark)
  const openFile = useWorkbench((s) => s.openFile)
  const [error, setError] = useState<string | null>(null)
  return (
    <div
      data-testid="bookmark-pane"
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
    >
      {error && (
        <p role="alert" className="px-2 py-1 text-caption text-destructive">
          {error}
        </p>
      )}
      {bookmarks.length === 0 ? (
        <p data-testid="bookmark-empty" className="px-2 py-1 text-caption text-muted-foreground">
          {t.files.bookmarksEmpty}
        </p>
      ) : (
        bookmarks.map((rel) => (
          <div key={rel} className="relative">
            <button
              type="button"
              className={ROW}
              data-testid={`bookmark:${rel}`}
              title={rel}
              onClick={() => openFile(rel)}
            >
              <Bookmark aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{shortLabel(rel)}</span>
            </button>
            <button
              type="button"
              aria-label={t.files.unbookmark(shortLabel(rel))}
              data-testid={`bookmark-remove:${rel}`}
              onClick={() => void toggleBookmark(rel).then(setError)}
              // 올려놓을 때까지 숨기면 터치·키보드 사용자는 지우개를 찾지 못한다 — 늘 흐리게 보인다
              className="focus-ring absolute top-1/2 right-1 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground/60 focus-visible:opacity-100 hover:text-foreground"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        ))
      )}
    </div>
  )
}

export const SidebarPanes = (): React.JSX.Element => {
  const t = useT()
  const pane = useWorkbench((s) => s.sidebarPane)
  const setPane = useWorkbench((s) => s.setSidebarPane)
  return (
    <>
      <div
        role="tablist"
        aria-label={t.shell.sidebarViews}
        className="flex shrink-0 gap-1 px-2 pb-1"
      >
        {PANES.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pane === id}
            data-testid={`sidebar-pane-${id}`}
            onClick={() => setPane(id)}
            className={cn(
              'focus-ring flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1 text-caption hover:bg-accent hover:text-foreground',
              pane === id
                ? 'bg-accent font-semibold text-foreground underline underline-offset-4'
                : 'text-muted-foreground'
            )}
          >
            <Icon aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{t.files.panes[id]}</span>
          </button>
        ))}
      </div>
      {/* 파일 트리는 숨겨도 마운트된 채다 — 편 폴더·스크롤·센 수가 탭을 오가도 남아야 한다.
          태그·북마크도 같다 — 거르개·목록이 보기를 오가도 남는다 */}
      <div className={cn('min-h-0 flex-1 flex-col', pane === 'files' ? 'flex' : 'hidden')}>
        <FileTree />
      </div>
      <div className={cn('min-h-0 flex-1 flex-col', pane === 'tags' ? 'flex' : 'hidden')}>
        <TagPane />
      </div>
      <div className={cn('min-h-0 flex-1 flex-col', pane === 'bookmarks' ? 'flex' : 'hidden')}>
        <BookmarkPane />
      </div>
    </>
  )
}
