// 사이드바 맨 위 상태 줄 — 팀 변경이 어떻게 됐는지 한 문장으로 말하고, 동작은 옆 단추가 한다.
// 상태 글자 자체는 단추가 아니다: 겉만 봐서는 어디로 가는지 모르기 때문이다.
// 브랜치·커밋 같은 git 말은 화면에 올리지 않는다: 문구 정본은 `lib/sync-text.ts` 한 곳이다.
import { CloudDownload, LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useSetup } from '../../hooks/use-setup'
import { useWorkbench } from '../../store/workbench'
import { syncText } from '../../lib/sync-text'
import { GITHUB_SECTION, revealSettingsSection } from '../../lib/reveal-settings'
import { useT } from '../../lib/i18n'

export const SyncLine = (): React.JSX.Element => {
  const t = useT()
  const setup = useSetup()
  const { sync } = setup
  const text = syncText(sync)
  const openKnowledge = useWorkbench((s) => s.openKnowledge)
  const setView = useWorkbench((s) => s.setView)
  // 고르기를 기다리면 받기는 같은 목록만 돌려준다 — 누르면 고르는 곳으로 간다
  const picking = sync.conflicts.length > 0 && !sync.running
  // GitHub 로그인이 없으면 받아도 같은 줄이다 — 누르면 설정의 GitHub 묶음(로그인 칸)으로 간다
  const signedOut = sync.skipped === 'signed-out' && !sync.running
  const goPicking = (): void => openKnowledge('review')
  const goSignIn = (): void => {
    setView('settings')
    revealSettingsSection(GITHUB_SECTION)
  }
  // 동작 단추의 말과 갈 곳 — 상태 글자와 같은 줄, 따로 보인다.
  // 눌러도 같은 줄이 돌아오는 막힌 상태(승인 대기·진행 중·작업 도중·옮기기 막힘)에는 단추를 두지 않는다 —
  // "다시 확인" 을 달아 두면 누르지 말라는 문장과 싸운다
  const blocked =
    sync.skipped === 'review-pending' ||
    sync.skipped === 'busy' ||
    sync.skipped === 'stuck' ||
    sync.skipped === 'switch-blocked'
  const noRemote = sync.skipped === 'no-remote' && !sync.running
  const action: { label: string; run: () => void } | null = sync.running
    ? null
    : picking
      ? { label: t.shell.syncPick, run: goPicking }
      : signedOut
        ? { label: t.shell.syncSignIn, run: goSignIn }
        : blocked
          ? null
          : noRemote
            ? { label: t.shell.syncConnect, run: () => setView('settings') }
            : sync.error
              ? { label: t.shell.syncRetry, run: setup.receiveTeamChanges }
              : sync.behind > 0
                ? { label: t.shell.syncReceive, run: setup.receiveTeamChanges }
                : { label: t.shell.recheck, run: setup.receiveTeamChanges }

  return (
    <div className="px-2 pt-2">
      <div
        data-testid="sidebar-sync-line"
        data-state={
          sync.running
            ? 'running'
            : signedOut
              ? 'signed-out'
              : sync.error
                ? 'error'
                : sync.conflicts.length > 0
                  ? 'conflicts'
                  : sync.behind > 0
                    ? 'waiting'
                    : 'idle'
        }
        className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1"
      >
        {sync.running ? (
          <LoaderCircle
            aria-hidden
            className="size-3.5 shrink-0 animate-spin text-muted-foreground"
          />
        ) : (
          <CloudDownload
            aria-hidden
            className={cn(
              'size-3.5 shrink-0',
              sync.error || signedOut
                ? 'text-destructive'
                : sync.behind > 0
                  ? 'text-primary'
                  : 'text-muted-foreground'
            )}
          />
        )}
        <span
          className={cn(
            // 막힌 상태의 문장은 끝에 할 일이 온다 — 두 줄까지는 그 자리에서 보인다.
            // 좁은 사이드바에서 어절 중간에 갈리지 않게 어절 단위로 줄을 바꾼다
            'line-clamp-2 min-w-0 flex-1 text-caption break-keep',
            sync.behind > 0 && !sync.running ? 'text-foreground' : 'text-muted-foreground'
          )}
          title={text}
          data-testid="sidebar-sync-text"
        >
          {text}
        </span>
        {action && (
          <button
            type="button"
            data-testid="sidebar-sync"
            aria-label={
              picking
                ? t.shell.syncPickLabel
                : signedOut
                  ? t.shell.syncSignInLabel
                  : t.shell.syncReceiveLabel
            }
            onClick={action.run}
            className="focus-ring tactile mt-0.5 min-h-6 shrink-0 rounded-md px-1.5 py-0.5 text-caption font-medium text-primary-ink hover:bg-accent"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
