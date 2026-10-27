import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'focus-ring tactile inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-callout font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-raised hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-raised hover:bg-destructive/90',
        outline:
          'border border-hairline bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary-ink underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-caption',
        lg: 'h-10 px-6',
        icon: 'size-9'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
)
