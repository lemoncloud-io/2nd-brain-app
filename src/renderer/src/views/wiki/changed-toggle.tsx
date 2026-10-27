// 리더 헤더의 "바뀐 곳" 토글 — 이번 답·오늘·어제 이후 중 하나를 기준으로 삼는다.
import type { ChangeSince } from '../../../../shared/ipc-contract'
import { cn } from '../../lib/utils'
import { useT } from '../../lib/i18n'

type Option = { key: string; label: string; since: ChangeSince | null }

const sinceKey = (since: ChangeSince | null): string | null =>
  since === null ? null : typeof since === 'object' ? 'answer' : since

export const ChangedToggle = ({
  since,
  changeId,
  note,
  onPick
}: {
  since: ChangeSince | null
  /** 이 문서를 쓴 답 — 없으면 "이번 답" 기준을 고를 수 없다 */
  changeId: string | null
  /** 표시할 것이 없을 때의 이유 한 줄 — 기록이 없다·바뀐 곳이 없다 */
  note: string | null
  onPick: (since: ChangeSince | null) => void
}): React.JSX.Element => {
  const t = useT()
  const options: Option[] = [
    ...(changeId === null
      ? []
      : [
          {
            key: 'answer',
            label: t.wikiDoc.changes.answer,
            since: { change: changeId } as ChangeSince
          }
        ]),
    { key: 'today', label: t.wikiDoc.changes.today, since: 'today' },
    { key: 'yesterday', label: t.wikiDoc.changes.yesterday, since: 'yesterday' }
  ]
  // 고른 것은 켜 둔다 — 표시할 것이 없는 이유는 옆의 한 줄이 말하고, 다시 누르면 꺼진다
  const active = sinceKey(since)

  return (
    <div className="flex items-center gap-2" data-testid="changed-toggle">
      <span className="text-caption text-muted-foreground">{t.wikiDoc.changes.label}</span>
      {/* 머리의 다른 단추와 같은 32px 높이 — 칩만 24px 이라 다른 종류처럼 보였다 */}
      <div className="flex h-8 items-center gap-0.5 rounded-md bg-secondary p-0.5">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={cn(
              'focus-ring h-7 rounded px-2.5 text-caption',
              active === option.key
                ? 'bg-background text-label shadow-xs'
                : 'text-muted-foreground hover:text-label'
            )}
            aria-pressed={active === option.key}
            data-testid={`changed-since:${option.key}`}
            onClick={() => onPick(active === option.key ? null : option.since)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {note !== null && (
        <span className="text-caption text-muted-foreground" data-testid="changed-note">
          {note}
        </span>
      )}
    </div>
  )
}
