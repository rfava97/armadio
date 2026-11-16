import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Rotellina di caricamento. Ruota uno <span> a dimensione fissa invece dell'<svg>:
 * su Safari iOS la rotazione diretta dell'svg dentro un flex può spostarlo sopra il testo.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex size-5 shrink-0 animate-spin items-center justify-center', className)} aria-hidden>
      <Loader2 className="size-full" />
    </span>
  )
}
