import { X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useT } from '../../lib/i18n'

// type="search" 의 브라우저 지우기 버튼은 파란 시스템 색이라 숨기고(main.css) 이 버튼으로 대신한다.
// 값이 있을 때만 그린다. 지운 뒤 초점은 입력으로 돌려 바로 다시 적게 한다.
export const SearchClearButton = ({
  visible,
  onClear,
  className,
  ...props
}: {
  visible: boolean
  onClear: () => void
} & Omit<React.ComponentProps<'button'>, 'onClick' | 'type'>): React.JSX.Element | null => {
  const t = useT()
  return visible ? (
    <button
      type="button"
      aria-label={t.shell.clear}
      className={cn(
        'focus-ring tactile flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground',
        className
      )}
      onClick={onClear}
      {...props}
    >
      <X aria-hidden className="size-3.5" />
    </button>
  ) : null
}
