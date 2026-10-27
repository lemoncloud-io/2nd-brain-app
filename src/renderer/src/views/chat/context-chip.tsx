// 입력칸 위 칩 한 개 — 이 질문에 붙는 문서. ×로 뗀다
import { X } from 'lucide-react'

export const ContextChip = ({
  testId,
  icon,
  label,
  title,
  onRemove,
  removeLabel
}: {
  testId: string
  icon: React.ReactNode
  label: string
  title: string
  onRemove: () => void
  removeLabel: string
}): React.JSX.Element => (
  <span
    data-testid={testId}
    title={title}
    className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-hairline bg-muted/40 pl-1.5 text-micro text-muted-foreground"
  >
    {icon}
    <span className="min-w-0 truncate text-foreground">{label}</span>
    <button
      type="button"
      aria-label={removeLabel}
      data-testid={`${testId}-remove`}
      onClick={onRemove}
      // 누르기 대상은 24px — 글자는 작아도 손가락·마우스가 닿는 자리는 줄이지 않는다
      className="focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-sm hover:text-foreground"
    >
      <X aria-hidden className="size-3" />
    </button>
  </span>
)
