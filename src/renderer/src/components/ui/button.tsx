import type { VariantProps } from 'class-variance-authority'
import { buttonVariants } from './button-variants'
import { cn } from '@renderer/lib/utils'

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>

export const Button = ({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonProps): React.JSX.Element => (
  <button
    data-slot="button"
    type={type}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
)
