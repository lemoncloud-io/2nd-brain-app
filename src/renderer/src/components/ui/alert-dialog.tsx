import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import { cn } from '@renderer/lib/utils'
import { buttonVariants } from './button-variants'

// 되돌릴 수 없는 동작, 또는 페이지를 지우는 긴 작업(중복 합치기) 앞에서만 쓴다 — 바깥을 눌러도 닫히지 않고,
// 포커스는 취소 쪽에서 시작한다
export const AlertDialog = AlertDialogPrimitive.Root

export const AlertDialogContent = ({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>): React.JSX.Element => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(var(--shadow-color)/0.32)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
    <AlertDialogPrimitive.Content
      data-slot="alert-dialog"
      className={cn(
        'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-elevated p-5 shadow-overlay duration-150 ease-tactile data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className
      )}
      {...props}
    />
  </AlertDialogPrimitive.Portal>
)

export const AlertDialogTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>): React.JSX.Element => (
  <AlertDialogPrimitive.Title
    className={cn('text-heading text-foreground', className)}
    {...props}
  />
)

export const AlertDialogDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>): React.JSX.Element => (
  <AlertDialogPrimitive.Description
    className={cn('text-callout text-muted-foreground wrap-anywhere', className)}
    {...props}
  />
)

export const AlertDialogFooter = ({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element => (
  <div className={cn('flex flex-wrap justify-end gap-2', className)} {...props} />
)

export const AlertDialogCancel = ({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>): React.JSX.Element => (
  <AlertDialogPrimitive.Cancel
    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), className)}
    {...props}
  />
)

export const AlertDialogAction = ({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>): React.JSX.Element => (
  <AlertDialogPrimitive.Action
    className={cn(buttonVariants({ variant: 'destructive', size: 'sm' }), className)}
    {...props}
  />
)
