// 트리 행 — memo 된 한 줄. 진행 고리·달라진 점·이름 칸을 같이 그린다.
import { memo } from 'react'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { cn } from '../../lib/utils'
import { changeLabel, treeLabel, type TreeRow } from '../../lib/tree-model'
import type { VaultFileChange } from '../../../../shared/vault-changes'
import type { CheckboxCount } from '../../../../shared/wiki/checkbox'
import { TreeEntryMenu } from './tree-entry-menu'
import { NameInput } from './tree-name-input'
import { useT } from '../../lib/i18n'

export const INDENT = 12
/** 트리 안에서 끄는 항목 — OS 파일 끌기(채팅의 자료 넣기)와 섞이지 않게 따로 부른다 */
export const DRAG_TYPE = 'application/x-vault-rel'

export type MenuAction = 'rename' | 'new-note' | 'split' | 'trash'

/** 진행 고리 — 그 문서의 체크박스 n/m 을 한 눈금으로. 다 끝나면 꽉 찬 고리다 */
export const ProgressRing = ({
  rel,
  count
}: {
  rel: string
  count: CheckboxCount
}): React.JSX.Element => {
  const t = useT()
  const radius = 5
  const circumference = 2 * Math.PI * radius
  const filled = (count.done / count.total) * circumference
  return (
    <svg
      data-testid={`tree-progress:${rel}`}
      aria-label={t.files.tasks(count.done, count.total)}
      viewBox="0 0 14 14"
      className={cn(
        'ml-auto size-3.5 shrink-0 -rotate-90',
        count.done === count.total ? 'text-primary-ink' : 'text-muted-foreground'
      )}
    >
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
      />
    </svg>
  )
}

/**
 * 달라진 표시 — 6px 점 하나. 색만으로 뜻을 나르지 않게 `aria-label`·`title` 에 말이 함께 간다.
 * 폴더 행은 안에 달라진 것이 있다는 것만 알린다(무엇인지는 펴서 본다).
 */
const ChangeDot = ({
  rel,
  change,
  inside
}: {
  rel: string
  change: VaultFileChange | null
  inside: boolean
}): React.JSX.Element | null => {
  const t = useT()
  if (change === null && !inside) return null
  const text = change !== null ? changeLabel(change) : t.library.folderChanged
  return (
    <span
      data-testid={`tree-change:${rel}`}
      aria-label={text}
      title={text}
      role="img"
      className={cn(
        'ml-auto size-1.5 shrink-0 rounded-full',
        change === 'new' ? 'bg-added' : change === null ? 'bg-muted-foreground' : 'bg-changed'
      )}
    />
  )
}

export const TreeItem = memo(function TreeItem({
  row,
  expanded,
  selected,
  focused,
  count,
  renaming,
  showExtension,
  change,
  changedInside,
  dropping,
  onActivate,
  onFocus,
  onMenu,
  onRenameDone,
  onDragOverRow,
  onDropRow
}: {
  row: TreeRow
  expanded: boolean
  selected: boolean
  focused: boolean
  /** 체크박스가 있는 md 면 진행 고리를 단다 */
  count: CheckboxCount | null
  renaming: boolean
  /** 이름에 확장자를 그대로 보인다 — 이름 바꾸기 칸도 같은 이름을 받는다 */
  showExtension: boolean
  /** 이 파일이 보관함에서 달라졌나 — 평소 상태면 null */
  change: VaultFileChange | null
  /** 폴더 행 — 그 안 어딘가가 달라졌나 */
  changedInside: boolean
  /** 끌어 온 항목이 이 폴더에 떨어진다 */
  dropping: boolean
  onActivate: (row: TreeRow, inNewTab?: boolean) => void
  onFocus: (rel: string) => void
  onMenu: (action: MenuAction, row: TreeRow) => void
  onRenameDone: (rel: string, typed: string | null) => void
  onDragOverRow: (e: React.DragEvent, row: TreeRow) => void
  onDropRow: (e: React.DragEvent, row: TreeRow) => void
}): React.JSX.Element {
  const t = useT()
  const { node, depth } = row
  const dir = node.kind === 'dir'
  const FolderIcon = expanded ? FolderOpen : Folder
  const { name, tag } = treeLabel(node, showExtension)
  return (
    <TreeEntryMenu
      dir={dir}
      onRename={() => onMenu('rename', row)}
      onNewNote={() => onMenu('new-note', row)}
      onOpenSplit={
        !dir && node.rel.toLowerCase().endsWith('.md') ? () => onMenu('split', row) : undefined
      }
      onTrash={() => onMenu('trash', row)}
    >
      <div
        role="treeitem"
        id={`tree-item-${node.rel}`}
        data-testid={`${dir ? 'tree-dir' : 'tree-file'}:${node.rel}`}
        aria-level={depth + 1}
        aria-expanded={dir ? expanded : undefined}
        aria-selected={selected}
        tabIndex={focused ? 0 : -1}
        title={node.rel}
        onFocus={() => onFocus(node.rel)}
        onClick={(e) => onActivate(row, e.metaKey || e.ctrlKey)}
        // 가운데 단추·Mod+누르기는 새 탭 — 브라우저에서 손이 기억하는 동작이다
        onAuxClick={(e) => {
          if (e.button !== 1) return
          e.preventDefault()
          onActivate(row, true)
        }}
        draggable={!renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, node.rel)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => onDragOverRow(e, row)}
        onDrop={(e) => onDropRow(e, row)}
        className={cn(
          'focus-ring relative flex h-7 cursor-default items-center gap-1 rounded-md pr-2 text-callout select-none',
          selected ? 'bg-accent font-medium text-foreground' : 'text-label hover:bg-accent/60',
          dropping && 'bg-accent ring-1 ring-primary ring-inset'
        )}
        style={{ paddingLeft: 6 + depth * INDENT }}
      >
        {/* 들여쓰기 안내선 — 단계마다 한 줄. 같은 폴더의 자식이 어디까지인지 눈으로 따라간다 */}
        {Array.from({ length: depth }, (_, level) => (
          <span
            key={level}
            aria-hidden
            className="absolute inset-y-0 border-l border-hairline"
            style={{ left: 13 + level * INDENT }}
          />
        ))}
        {dir ? (
          <>
            <ChevronRight
              aria-hidden
              className={cn(
                'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-tactile',
                expanded && 'rotate-90'
              )}
            />
            {/* 폴더는 폴더 모양으로 — 펼침 쉐브론만으로는 파일과 구분이 느리다 */}
            <FolderIcon
              aria-hidden
              data-testid="tree-folder-icon"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </>
        ) : (
          <span aria-hidden className="w-3.5 shrink-0" />
        )}
        {renaming ? (
          <NameInput
            name={name}
            label={t.files.newNameLabel}
            testId="tree-rename-input"
            blurConfirms
            onDone={(typed) => onRenameDone(node.rel, typed === name ? null : typed)}
          />
        ) : (
          <span className="truncate">{name}</span>
        )}
        {!renaming && count !== null && <ProgressRing rel={node.rel} count={count} />}
        {!renaming && <ChangeDot rel={node.rel} change={change} inside={dir && changedInside} />}
        {!renaming && tag && (
          <span className="shrink-0 rounded-sm bg-accent px-1 text-caption leading-4 tracking-wide text-muted-foreground">
            {tag}
          </span>
        )}
      </div>
    </TreeEntryMenu>
  )
})
