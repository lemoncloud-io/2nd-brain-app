// 편집기에 저장 안 한 변경이 있을 때 떠나려 하면 먼저 묻는다.
// 묻는 자리는 store 의 `guarded` 를 타는 것 전부다: navigate(트리·링크·Cmd+K·근거에서 열기)·
// 뒤로·앞으로·편집기 취소(leaveEditor)·보관함 전환·창 닫기.
// 메뉴 전환과 파일 행은 묻지 않는다 — 탭은 숨을 뿐 언마운트되지 않아 쓰던 글이 남는다.
// 편집기를 실제로 없애는 길을 새로 만들면 그 길도 `guarded` 를 타야 한다 — 이 목록도 같이 고친다.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle
} from './ui/alert-dialog'
import { useWorkbench } from '../store/workbench'
import { useT } from '../lib/i18n'

export const NavigationGuard = (): React.JSX.Element => {
  const t = useT()
  const pending = useWorkbench((s) => s.pendingNavigation)
  const confirm = useWorkbench((s) => s.confirmNavigation)
  const cancel = useWorkbench((s) => s.cancelNavigation)
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) cancel()
      }}
    >
      <AlertDialogContent data-testid="wiki-discard-confirm">
        <AlertDialogTitle>{t.shell.unsavedTitle}</AlertDialogTitle>
        <AlertDialogDescription>{t.shell.unsavedDetail}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.shell.keepEditing}</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} data-testid="wiki-discard">
            {t.shell.discard}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
