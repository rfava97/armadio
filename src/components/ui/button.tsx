import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-opacity disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent',
        secondary: 'bg-surface text-fg border border-border [&_svg]:text-accent',
        ghost: 'bg-transparent text-fg',
        danger: 'bg-danger text-on-accent',
      },
      size: {
        lg: 'h-14 w-full px-6 text-body',
        md: 'h-11 px-5 text-card',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'lg' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
