import { cn } from '../lib/utils'
import type { UserError } from '../lib/user-error'
import { useT } from '../lib/i18n'

/**
 * 오류 한 줄 + 접어 둔 원문. 문장은 사용자가 할 일을 말하고, 원문은 도움을 청할 때만 편다.
 * 원문이 없으면 문장만 그린다.
 */
export const ErrorNote = ({
  error,
  testId,
  className
}: {
  error: UserError
  testId?: string
  className?: string
}): React.JSX.Element => {
  const t = useT()
  return (
    <div
      role="alert"
      data-testid={testId}
      className={cn('text-caption text-destructive', className)}
    >
      <p className="min-w-0 wrap-anywhere">{error.text}</p>
      {error.detail && (
        <details className="mt-1">
          <summary className="focus-ring text-muted-foreground cursor-pointer rounded-sm">
            {t.shell.details}
          </summary>
          <pre className="text-muted-foreground mt-1 overflow-x-auto whitespace-pre-wrap">
            {error.detail}
          </pre>
        </details>
      )}
    </div>
  )
}
