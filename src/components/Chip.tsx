import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; children: ReactNode }

/** Chip 36px (DESIGN.md); il target touch resta ≥ 44px grazie al padding verticale del wrapper. */
export function Chip({ selected, className, children, ...props }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-card font-medium transition-colors',
        selected ? 'bg-accent text-on-accent' : 'bg-surface-muted text-fg',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
