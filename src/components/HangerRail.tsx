import { cn } from '@/lib/utils'

/** Asta appendiabiti decorativa sopra la griglia: barra sottile con i due supporti alle estremità. */
export function HangerRail({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative h-3', className)}>
      <span className="absolute inset-x-1 top-1 h-[3px] rounded-full bg-gradient-to-b from-champagne to-mannequin-shadow" />
      <span className="absolute top-0 left-0 size-[11px] rounded-full border-2 border-mannequin-shadow bg-surface" />
      <span className="absolute top-0 right-0 size-[11px] rounded-full border-2 border-mannequin-shadow bg-surface" />
    </div>
  )
}
