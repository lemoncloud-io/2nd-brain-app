// 사이드바 — 새 버전을 받아 두었을 때만 보이는 다시 시작 버튼. 그 밖의 업데이트 상태는 설정에만 둔다
// (확인 실패 같은 일로 사이드바를 시끄럽게 하지 않는다).
import { LoaderCircle, RotateCw } from 'lucide-react'
import { useUpdate } from '../../hooks/use-update'
import { useT } from '../../lib/i18n'

export const UpdateRestart = (): React.JSX.Element | null => {
  const t = useT()
  const { state, restarting, restart } = useUpdate()
  if (state?.kind !== 'ready') return null
  return (
    <div className="px-2">
      <button
        type="button"
        data-testid="sidebar-update-restart"
        disabled={restarting}
        onClick={restart}
        className="focus-ring tactile flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-caption text-foreground hover:bg-accent disabled:opacity-60"
      >
        {restarting ? (
          <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <RotateCw aria-hidden className="size-3.5 shrink-0 text-primary" />
        )}
        <span className="truncate">
          {restarting ? t.shell.restarting : t.shell.restartForUpdate(state.version)}
        </span>
      </button>
    </div>
  )
}
