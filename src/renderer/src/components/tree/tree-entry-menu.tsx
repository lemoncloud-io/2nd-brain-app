// 트리 항목의 오른쪽 클릭 메뉴와 휴지통 확인 — 이름 바꾸기·새 노트·지우기.
// 키보드로도 같다: F2 이름 바꾸기, Delete(맥은 ⌘⌫) 휴지통, 메뉴 키·Shift+F10 이 이 메뉴를 연다.
import { useRef } from 'react'
import { ContextMenu } from 'radix-ui'
import { Columns2, FilePlus, Pencil, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle
} from '../ui/alert-dialog'
import { fileTitle } from '../../lib/vault-path'
import { useT } from '../../lib/i18n'

const isMac = navigator.userAgent.includes('Mac')

const ITEM =
  'flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-callout text-foreground outline-none select-none data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground'

const Shortcut = ({ children }: { children: string }): React.JSX.Element => (
  <span className="ml-auto pl-4 text-caption text-muted-foreground">{children}</span>
)

export const TreeEntryMenu = ({
  dir,
  children,
  onRename,
  onNewNote,
  onOpenSplit,
  onTrash
}: {
  dir: boolean
  children: React.ReactNode
  onRename: () => void
  onNewNote: () => void
  /** 마크다운 문서만 — 오른쪽 칸에 연다 */
  onOpenSplit?: () => void
  onTrash: () => void
}): React.JSX.Element => {
  const t = useT()
  // 고른 것이 이름 칸을 여는가(바꾸기·새로 만들기) — 닫힐 때 안다.
  // Radix 의 초점 복귀는 이름 칸의 다음-프레임 잡기보다 늦게 와서, 막 열린 칸을 낚아채 버린다.
  // 그 외(열기·지우기 대화상자)는 행으로 돌려준다 — 키보드 나무 탐색이 끊기지 않게
  const willEdit = useRef(false)
  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (open) willEdit.current = false
      }}
    >
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          data-testid="tree-menu"
          onCloseAutoFocus={(e) => {
            if (willEdit.current) e.preventDefault()
          }}
          className="z-50 min-w-44 rounded-md border border-hairline bg-elevated p-1 shadow-overlay"
        >
          <ContextMenu.Item
            className={ITEM}
            data-testid="tree-menu-rename"
            onSelect={() => {
              willEdit.current = true
              onRename()
            }}
          >
            <Pencil aria-hidden /> {t.files.rename}
            <Shortcut>F2</Shortcut>
          </ContextMenu.Item>
          {onOpenSplit && (
            <ContextMenu.Item className={ITEM} data-testid="tree-menu-split" onSelect={onOpenSplit}>
              <Columns2 aria-hidden /> {t.files.openRight}
            </ContextMenu.Item>
          )}
          {dir && (
            <ContextMenu.Item
              className={ITEM}
              data-testid="tree-menu-new-note"
              onSelect={() => {
                willEdit.current = true
                onNewNote()
              }}
            >
              <FilePlus aria-hidden /> {t.files.newNoteHere}
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="my-1 h-px bg-hairline" />
          <ContextMenu.Item
            className={`${ITEM} text-destructive [&_svg]:text-destructive`}
            data-testid="tree-menu-trash"
            onSelect={onTrash}
          >
            <Trash2 aria-hidden /> {t.files.trash}
            <Shortcut>{isMac ? '⌘⌫' : 'Delete'}</Shortcut>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

/** 지우기 전 한 번 묻는다 — 휴지통에서 되살릴 수 있다는 것까지 말해야 겁먹지 않고 누른다 */
export const TrashDialog = ({
  target,
  onConfirm,
  onClose
}: {
  target: { rel: string; dir: boolean } | null
  onConfirm: (rel: string) => void
  onClose: () => void
}): React.JSX.Element => {
  const t = useT()
  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-testid="tree-trash-dialog">
        <AlertDialogTitle>
          {target ? t.files.trashTitle(fileTitle(target.rel)) : ''}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {target?.dir ? t.files.trashFolder : ''}
          {t.files.trashDetail}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.files.keep}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="tree-trash-confirm"
            onClick={() => target && onConfirm(target.rel)}
          >
            {t.files.trashConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
