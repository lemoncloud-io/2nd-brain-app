// 사이드바의 파일 트리 — Obsidian 파일 탐색기와 같은 지도. 보관함의 모든 폴더와 파일이 나온다(숨김 폴더만 뺀다).
// 폴더 먼저·이름순, md 는 확장자를 숨기고 다른 형식은 꼬리표를 단다. 접힌 폴더의 자식은 그리지 않는다.
// 키보드는 WAI-ARIA tree 패턴: 위·아래 이동, 오른쪽 펴기·첫 자식, 왼쪽 접기·부모, Enter 열기.
// 항목 관리는 Finder·Obsidian 과 같다: 오른쪽 클릭 메뉴, F2 이름 바꾸기, Delete 휴지통, 끌어다 폴더에 놓기.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownWideNarrow,
  ChevronRight,
  ChevronsDownUp,
  FilePlus,
  FolderPlus
} from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { toUserError } from '../../lib/user-error'
import {
  buildTree,
  changedFolders,
  treeLabel,
  visibleRows,
  type TreeRow,
  type TreeSort
} from '../../lib/tree-model'
import { useWorkbench } from '../../store/workbench'
import { useExpandedFolders } from './use-expanded-folders'
import { useCheckboxCounts } from './use-checkbox-counts'
import { TrashDialog } from './tree-entry-menu'
import { NameInput } from './tree-name-input'
import { DRAG_TYPE, INDENT, TreeItem, type MenuAction } from './tree-row'
import { getT } from '../../lib/i18n'
import { useT } from '../../lib/i18n'

const SORT_KEY = 'second-brain.file-tree.sort'
const isMac = navigator.userAgent.includes('Mac')

const storedSort = (): TreeSort => {
  try {
    return localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'name'
  } catch {
    return 'name'
  }
}

const parentOf = (rel: string): string => rel.slice(0, Math.max(rel.lastIndexOf('/'), 0))

/** 끌어 온 항목이 떨어질 폴더 — 폴더 행이면 그 폴더, 파일 행이면 그 파일의 폴더, 빈 곳이면 맨 위 */
const dropFolderOf = (row: TreeRow | null): string =>
  row === null ? '' : row.node.kind === 'dir' ? row.node.rel : parentOf(row.node.rel)

export const FileTree = (): React.JSX.Element => {
  const t = useT()
  const tree = useWorkbench((s) => s.tree)
  const treeError = useWorkbench((s) => s.treeError)
  const vaultDir = useWorkbench((s) => s.vaultDir)
  const view = useWorkbench((s) => s.view)
  const selectedPage = useWorkbench((s) => s.selectedPage)
  const selectedSource = useWorkbench((s) => s.selectedSource)
  const openFile = useWorkbench((s) => s.openFile)
  const newNote = useWorkbench((s) => s.newNote)
  const showExtension = useWorkbench((s) => s.uiPrefs.showFileExtensions)
  const changes = useWorkbench((s) => s.changes)
  const refreshTree = useWorkbench((s) => s.refreshTree)
  const relocated = useWorkbench((s) => s.relocated)
  const editingRel = useWorkbench((s) => s.editing)
  const docMode = useWorkbench((s) => s.docMode)
  const opened = view !== 'doc' ? null : docMode === 'source' ? selectedSource : selectedPage
  const folders = useExpandedFolders(vaultDir, opened)
  const [sort, setSort] = useState<TreeSort>(storedSort)
  const [focusedRel, setFocusedRel] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [trashTarget, setTrashTarget] = useState<{ rel: string; dir: boolean } | null>(null)
  // 글자 찾기 버퍼 — 0.5초 안에 친 글자는 이어 붙여 그 이름으로 시작하는 행을 찾는다(WAI 트리)
  const typeBuf = useRef({ text: '', at: 0 })
  /** 끌어 온 항목이 떨어질 폴더 — `''` 은 보관함 맨 위 */
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  /** 사이드바를 이미 옮겨다 준 파일 — 같은 파일로 두 번 끌어오지 않는다 */
  const scrolledTo = useRef<string | null>(null)
  /**
   * 이름을 받는 중인 새 항목 — 만들 자리는 누른 그 순간에 정해 둔다. 디스크에는 Enter 뒤에야 쓴다.
   * 그래서 단추를 연타해도 갓 만든 폴더 안에 또 폴더가 생기지 않는다(초점이 그리 옮겨 가 있어도).
   */
  const [creating, setCreating] = useState<{
    kind: 'note' | 'folder'
    folder: string
    /** 이름 칸의 첫 값 — 만들기에 실패하면 친 이름을 그대로 되살린다 */
    name: string
  } | null>(null)

  const roots = useMemo(() => buildTree(tree ?? [], sort), [tree, sort])
  const rows = useMemo(() => visibleRows(roots, folders.expanded), [roots, folders.expanded])
  // 폴더 점은 맵을 한 번만 훑어 만든다 — 행마다 다시 세면 수백 행에서 훑기가 수백 번이 된다
  const insideChanged = useMemo(() => changedFolders(changes), [changes])
  // 열린 파일을 보이는 자리로 — 파일 하나당 딱 한 번이다. rows 를 같이 보는 이유는 조상 폴더가
  // 펴져 행이 생긴 뒤라야 찾을 수 있어서고, 이미 옮긴 파일을 기억해 두지 않으면 자동저장이
  // 트리를 새로고침할 때마다 사용자가 딴 데로 스크롤해 둔 사이드바를 도로 끌어온다.
  // 초점은 옮기지 않는다: 글을 쓰다 탭을 바꿨을 때 커서가 트리로 끌려가면 안 된다.
  // 사이드바가 접혀 있으면 행이 `display:none` 이라 scrollIntoView 가 제풀에 아무 일도 안 한다.
  useEffect(() => {
    if (opened === null) {
      scrolledTo.current = null
      return
    }
    if (scrolledTo.current === opened) return
    // id 에 `/`·공백이 들어가 querySelector 대신 getElementById 로 찾는다
    const row = document.getElementById(`tree-item-${opened}`)
    // 조상 폴더가 아직 안 펴졌다 — 기억하지 않고 다음 rows 에서 다시 본다
    if (!row) return
    scrolledTo.current = opened
    row.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [opened, rows])
  // 진행 고리 — 보이는 행만, 펼친 만큼만 센다
  const countOf = useCheckboxCounts(rows)
  // 초점 행이 접히거나 지워졌으면 열린 파일, 그것도 없으면 첫 행이 받는다
  const focusIndex = [focusedRel, opened]
    .map((rel) => rows.findIndex((r) => r.node.rel === rel))
    .concat(0)
    .find((index) => index >= 0)!

  const { toggle } = folders
  const activate = useCallback(
    (row: TreeRow, inNewTab = false): void => {
      if (row.node.kind === 'dir') toggle(row.node.rel)
      else openFile(row.node.rel, inNewTab)
    },
    [toggle, openFile]
  )

  const moveFocus = (index: number): void => {
    const row = rows[index]
    if (!row) return
    setFocusedRel(row.node.rel)
    // id 에 `/`·공백이 들어가 querySelector 대신 getElementById 로 찾는다
    document.getElementById(`tree-item-${row.node.rel}`)?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    // 글자를 치면 그 글자로 시작하는 다음 행으로 간다 — 이름 칸 안은 NameInput 이 전파를 막는다
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      const now = Date.now()
      const buf = typeBuf.current
      const text = now - buf.at < 500 ? buf.text + e.key : e.key
      typeBuf.current = { text, at: now }
      const q = text.toLowerCase()
      for (let step = 1; step <= rows.length; step++) {
        const at = (focusIndex + step) % rows.length
        const label = treeLabel(rows[at].node, showExtension).name.toLowerCase()
        if (label.startsWith(q)) {
          moveFocus(at)
          break
        }
      }
      return
    }
    const row = rows[focusIndex]
    if (!row) return
    const dir = row.node.kind === 'dir'
    const open = folders.expanded.has(row.node.rel)
    const keys: Record<string, () => void> = {
      ArrowDown: () => moveFocus(focusIndex + 1),
      ArrowUp: () => moveFocus(focusIndex - 1),
      Home: () => moveFocus(0),
      End: () => moveFocus(rows.length - 1),
      ArrowRight: () => {
        if (!dir) return
        if (!open) folders.toggle(row.node.rel)
        else moveFocus(focusIndex + 1)
      },
      ArrowLeft: () => {
        if (dir && open) folders.toggle(row.node.rel)
        else moveFocus(rows.findIndex((r) => r.node.rel === parentOf(row.node.rel)))
      },
      Enter: () => activate(row),
      ' ': () => activate(row),
      F2: () => setRenaming(row.node.rel),
      Delete: () => setTrashTarget({ rel: row.node.rel, dir })
    }
    // 맥의 Finder 는 ⌘⌫ 로 휴지통에 보낸다 — 맨 ⌫ 는 실수로 누르기 쉬워 받지 않는다
    const trashKey = isMac && e.key === 'Backspace' && e.metaKey
    const run = trashKey ? keys.Delete : keys[e.key]
    if (!run) return
    e.preventDefault()
    run()
  }

  // 새 노트·새 폴더는 초점 행(없으면 열린 파일)의 폴더 안에 만든다 — Obsidian 과 같다.
  // 둘 다 없으면 보관함 맨 위다
  const targetFolder = (): string => {
    const row = rows.find((r) => r.node.rel === (focusedRel ?? opened))
    if (!row) return ''
    return row.node.kind === 'dir' ? row.node.rel : parentOf(row.node.rel)
  }

  /** 만들었으면 true — 실패는 호출한 쪽이 이름 칸을 되살리는 데 쓴다 */
  const create = async (
    kind: 'note' | 'folder',
    folder: string,
    name?: string
  ): Promise<boolean> => {
    setActionError(null)
    // 노트를 만들어 열고 이름 칸에 초점을 주는 일은 store 가 한다 — 빈 탭의 "새 노트" 와 같은 길이다.
    // 여기서만 하는 것은 트리의 일이다: 그 폴더를 펴고 초점을 새 파일에 옮긴다
    if (kind === 'note') {
      const made = await newNote(folder, name)
      if ('error' in made) {
        setActionError(made.error)
        return false
      }
      if (folder) folders.expand(folder)
      setFocusedRel(made.rel)
      return true
    }
    try {
      const result = await window.api.createVaultFolder(folder, name)
      if ('error' in result) {
        setActionError(result.error)
        return false
      }
      if (folder) folders.expand(folder)
      await refreshTree()
      setFocusedRel(result.rel)
      return true
    } catch (error) {
      setActionError(toUserError(error, getT().files.createFolderFailed).text)
      return false
    }
  }

  // 이름 바꾸기·옮기기·지우기 — 결과는 main 이 정하고(보호 폴더·잠금), 여기서는 열린 자리를 따라 옮긴다
  const change = async (
    rel: string,
    run: () => Promise<{ rel: string } | { ok: true } | { error: string }>,
    failText: string
  ): Promise<void> => {
    setActionError(null)
    // 쓰던 글이 든 문서를 옮기면 저장이 옛 자리에 새 파일을 만든다
    if (editingRel !== null && (editingRel === rel || editingRel.startsWith(`${rel}/`))) {
      setActionError(getT().files.saveFirst)
      return
    }
    try {
      const result = await run()
      if ('error' in result) {
        setActionError(result.error)
        return
      }
      const to = 'rel' in result ? result.rel : null
      relocated(rel, to)
      await refreshTree()
      if (to !== null) {
        const folder = parentOf(to)
        if (folder) folders.expand(folder)
        setFocusedRel(to)
        // 이름 칸이 사라지면 초점이 문서 밖으로 떨어진다 — 바뀐 행이 이어 받아 키보드가 끊기지 않게
        requestAnimationFrame(() => document.getElementById(`tree-item-${to}`)?.focus())
      }
    } catch (error) {
      setActionError(toUserError(error, failText).text)
    }
  }

  /** 단추·메뉴가 부른다 — 만들 자리를 지금 정하고, 접혀 있으면 펴서 이름 칸이 보이게 한다 */
  const startCreate = (kind: 'note' | 'folder', folder = targetFolder()): void => {
    setActionError(null)
    if (folder) folders.expand(folder)
    // 확장자를 보이는 사람에게는 첫 값에도 보인다 — 고칠 자리가 눈에 있어야 형식을 바꿀 생각을 한다
    const name =
      kind === 'folder'
        ? t.files.newFolderName
        : showExtension
          ? `${t.files.untitled}.md`
          : t.files.untitled
    setCreating({ kind, folder, name })
  }

  // 만들지 못했으면 이름 칸을 도로 연다 — 친 이름이 사라지면 처음부터 다시 쳐야 한다.
  // 이름이 겹치면 거절하는 길이라 실패는 드문 일이 아니다
  const onCreateDone = (typed: string | null): void => {
    const pending = creating
    setCreating(null)
    if (pending === null || typed === null) return
    void create(pending.kind, pending.folder, typed).then((made) => {
      if (!made) setCreating({ ...pending, name: typed })
    })
  }

  // 행은 memo 다 — 콜백이 매 렌더 바뀌면 수백 행이 다시 그려진다. 최신 동작은 ref 로 부른다
  const latest = useRef({ change, startCreate, showExtension })
  useEffect(() => {
    latest.current = { change, startCreate, showExtension }
  })

  const onRenameDone = useCallback((rel: string, typed: string | null): void => {
    setRenaming(null)
    if (typed === null) return
    void latest.current.change(
      rel,
      // 확장자를 보여 준 채 받은 이름이라야 main 이 확장자 변경으로 읽는다 —
      // 숨긴 채 받았으면 친 것은 확장자 뗀 이름이고 원래 확장자가 그대로 붙는다
      () => window.api.renameVaultEntry(rel, typed, latest.current.showExtension),
      getT().files.renameFailed
    )
  }, [])

  const onMenu = useCallback((action: MenuAction, row: TreeRow): void => {
    if (action === 'rename') setRenaming(row.node.rel)
    else if (action === 'trash') setTrashTarget({ rel: row.node.rel, dir: row.node.kind === 'dir' })
    else if (action === 'split') useWorkbench.getState().openSplit(row.node.rel)
    else latest.current.startCreate('note', dropFolderOf(row))
  }, [])

  const onDragOverRow = useCallback((e: React.DragEvent, row: TreeRow | null): void => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(dropFolderOf(row))
  }, [])

  const onDropRow = useCallback((e: React.DragEvent, row: TreeRow | null): void => {
    const rel = e.dataTransfer.getData(DRAG_TYPE)
    setDropTarget(null)
    if (!rel) return
    e.preventDefault()
    e.stopPropagation()
    const folder = dropFolderOf(row)
    if (folder === parentOf(rel)) return
    void latest.current.change(
      rel,
      () => window.api.moveVaultEntry(rel, folder),
      getT().files.moveFailed
    )
  }, [])

  // 이름을 받는 중인 행 — 아직 디스크에 없다. 만들 폴더 바로 안쪽 깊이로 그린다
  const pendingDepth =
    creating === null || creating.folder === '' ? 0 : creating.folder.split('/').length
  const pendingRow =
    creating === null ? null : (
      <div
        role="treeitem"
        aria-level={pendingDepth + 1}
        aria-selected={false}
        data-testid="tree-create-row"
        className="focus-ring relative flex h-7 items-center gap-1 rounded-md pr-2 text-callout"
        style={{ paddingLeft: 6 + pendingDepth * INDENT }}
      >
        {creating.kind === 'folder' ? (
          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span aria-hidden className="w-3.5 shrink-0" />
        )}
        <NameInput
          name={creating.name}
          label={creating.kind === 'folder' ? t.files.newFolderLabel : t.files.newNoteLabel}
          testId="tree-create-input"
          blurConfirms={false}
          onDone={onCreateDone}
        />
      </div>
    )

  const toggleSort = (): void => {
    const next: TreeSort = sort === 'name' ? 'recent' : 'name'
    setSort(next)
    try {
      localStorage.setItem(SORT_KEY, next)
    } catch {
      // 저장이 막혀도 이번 실행에서는 바뀐다
    }
  }

  return (
    <div data-testid="file-tree" className="flex min-h-0 flex-1 flex-col">
      <div
        role="group"
        aria-label={t.files.tools}
        className="flex h-9 shrink-0 items-center gap-0.5 px-2"
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.files.newNote}
          title={t.files.newNoteHint}
          data-testid="tree-new-note"
          onClick={() => startCreate('note')}
        >
          <FilePlus aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.files.newFolder}
          title={t.files.newFolder}
          data-testid="tree-new-folder"
          onClick={() => startCreate('folder')}
        >
          <FolderPlus aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-caption"
          aria-label={t.files.sort[sort].action}
          title={t.files.sort[sort].title}
          aria-pressed={sort === 'recent'}
          data-testid="tree-sort"
          onClick={toggleSort}
        >
          <ArrowDownWideNarrow aria-hidden />
          <span className="max-w-16 truncate">{t.files.sort[sort].short}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t.files.collapseAll}
          title={t.files.collapseAll}
          data-testid="tree-collapse-all"
          onClick={folders.collapseAll}
        >
          <ChevronsDownUp aria-hidden />
        </Button>
      </div>
      {actionError && (
        <p role="alert" className="px-4 pb-1 text-caption text-destructive">
          {actionError}
        </p>
      )}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {treeError ? (
          <p data-testid="tree-error" className="px-2 py-1 text-caption text-destructive">
            {treeError}
          </p>
        ) : tree !== null && rows.length === 0 ? (
          <p data-testid="tree-empty" className="px-2 py-1 text-caption text-muted-foreground">
            {t.files.empty}
          </p>
        ) : (
          <div
            role="tree"
            aria-label={t.files.treeLabel}
            onKeyDown={onKeyDown}
            // 행 밖(목록 아래 빈 곳)에 놓으면 보관함 맨 위로 옮긴다
            onDragOver={(e) => onDragOverRow(e, null)}
            onDrop={(e) => onDropRow(e, null)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null)
            }}
            onDragEnd={() => setDropTarget(null)}
            className={cn(
              'flex min-h-full flex-col gap-px rounded-md',
              dropTarget === '' && 'ring-1 ring-primary ring-inset'
            )}
          >
            {creating !== null && creating.folder === '' && pendingRow}
            {rows.map((row, index) => (
              <Fragment key={row.node.rel}>
                <TreeItem
                  row={row}
                  expanded={folders.expanded.has(row.node.rel)}
                  selected={row.node.rel === opened}
                  focused={index === focusIndex}
                  count={countOf(row.node.rel, row.node.mtimeMs)}
                  renaming={renaming === row.node.rel}
                  showExtension={showExtension}
                  change={changes[row.node.rel] ?? null}
                  changedInside={insideChanged.has(row.node.rel)}
                  dropping={row.node.kind === 'dir' && dropTarget === row.node.rel}
                  onActivate={activate}
                  onFocus={setFocusedRel}
                  onMenu={onMenu}
                  onRenameDone={onRenameDone}
                  onDragOverRow={onDragOverRow}
                  onDropRow={onDropRow}
                />
                {creating !== null && creating.folder === row.node.rel && pendingRow}
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <TrashDialog
        target={trashTarget}
        onClose={() => setTrashTarget(null)}
        onConfirm={(rel) => {
          setTrashTarget(null)
          void change(rel, () => window.api.trashVaultEntry(rel), getT().files.trashFailed)
        }}
      />
    </div>
  )
}
