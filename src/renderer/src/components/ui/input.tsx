import { cn } from '@renderer/lib/utils'

export const Input = ({
  className,
  ...props
}: React.ComponentProps<'input'>): React.JSX.Element => (
  <input
    data-slot="input"
    className={cn(
      'focus-ring tactile h-9 w-full min-w-0 rounded-md border border-input-border bg-background px-3 text-callout text-foreground placeholder:text-muted-foreground focus-visible:border-focus-border disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
)
