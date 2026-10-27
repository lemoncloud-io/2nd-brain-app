import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from '../ui/button'

type ViewHeaderProps = {
  title: string
  description?: string
  /** 설명에 마우스를 올리면 보이는 원문 — 브랜치 이름처럼 화면 말로 바꾼 값 */
  descriptionTitle?: string
  /** 제목 앞 — 리더의 뒤로 버튼 */
  leading?: React.ReactNode
  children?: React.ReactNode
  /** false면 제목을 h1이 아닌 같은 모양의 글로 그린다 — 본문에 h1이 따로 있을 때 */
  heading?: boolean
}

// 52px 도구 막대 — 제목·보조 설명 한 줄, 오른쪽에 뷰 동작.
export const ViewHeader = ({
  title,
  description,
  descriptionTitle,
  leading,
  children,
  heading = true
}: ViewHeaderProps): React.JSX.Element => {
  const TitleTag = heading ? 'h1' : 'p'
  return (
    // 칸이 좁으면(좌우 분할) 동작이 다음 줄로 내려간다 — 옆 칸 위로 넘치지 않는다
    <header className="flex min-h-13 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-6 py-1.5">
      {leading}
      {/* 좁은 창에서는 제목이 줄고 동작은 자리를 지킨다 — 잘리는 쪽이 버튼이면 길이 막힌다 */}
      <TitleTag data-testid="view-title" className="min-w-0 truncate text-title">
        {title}
      </TitleTag>
      {description && (
        <p title={descriptionTitle} className="min-w-0 truncate text-caption text-muted-foreground">
          {description}
        </p>
      )}
      {children && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
      )}
    </header>
  )
}

const BODY_WIDTH = { reading: 'max-w-2xl', wide: 'max-w-3xl' } as const

export const ViewBody = ({
  children,
  width = 'wide'
}: {
  children: React.ReactNode
  width?: keyof typeof BODY_WIDTH
}): React.JSX.Element => (
  <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-8">
    <div className={cn('mx-auto flex flex-col gap-6', BODY_WIDTH[width])}>{children}</div>
  </div>
)

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  /** 빈 상태를 벗어나는 다음 행동 — 설정으로 가기 등 */
  action?: { label: string; onClick: () => void; testId?: string }
}

// 무채색 글리프 타일 + heading + caption — 빈 상태(없다) 전용. 읽는 중에는 role="status" 줄을 쓴다.
export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action
}: EmptyStateProps): React.JSX.Element => (
  <div className="flex flex-col items-center gap-3 py-16 text-center">
    <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-muted-foreground">
      <Icon className="size-5" aria-hidden />
    </div>
    <div>
      <p className="text-heading">{title}</p>
      <p className="mt-1 max-w-sm text-caption text-balance break-keep text-muted-foreground">
        {description}
      </p>
    </div>
    {action && (
      <Button size="sm" data-testid={action.testId} onClick={action.onClick}>
        {action.label}
      </Button>
    )}
  </div>
)
