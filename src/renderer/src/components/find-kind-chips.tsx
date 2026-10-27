// 종류 단추 한 줄 — ⌘K 와 검색 화면이 같이 쓴다. 문구·종류는 `lib/file-find.ts`.
import { cn } from '../lib/utils'
import { FIND_KIND_OPTIONS, type FindKind } from '../lib/file-find'
import { useT } from '../lib/i18n'

export const FindKindChips = ({
  value,
  onChange,
  testId,
  className
}: {
  value: FindKind | null
  onChange: (kind: FindKind | null) => void
  testId: string
  className?: string
}): React.JSX.Element => {
  const t = useT()
  return (
    <div
      role="group"
      aria-label={t.library.kindGroup}
      className={cn('flex items-center gap-1', className)}
    >
      {FIND_KIND_OPTIONS.map(({ id, label }) => (
        <button
          key={id ?? 'all'}
          type="button"
          aria-pressed={value === id}
          data-testid={`${testId}:${id ?? 'all'}`}
          // 눌러도 입력칸 초점을 가져가지 않는다 — 고른 뒤 바로 이어 친다
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(id)}
          className={cn(
            'focus-ring tactile inline-flex items-center rounded-sm border px-2.5 py-1 text-caption',
            value === id
              ? 'border-border bg-accent text-foreground'
              : 'border-hairline text-muted-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
