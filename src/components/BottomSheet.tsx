import { useEffect, useId, type ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** CTA fissa in basso */
  footer?: ReactNode
}

/** Bottom sheet (DESIGN.md): maniglia, titolo grande, contenuto scrollabile, CTA fissa. */
export function BottomSheet({ open, onClose, title, children, footer }: Props) {
  const reduce = useReducedMotion()
  const titleId = useId()
  const drag = useDragControls()

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-fg/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-2xl flex-col rounded-t-sheet bg-surface"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0, transition: { duration: 0.28, ease: 'easeOut' } }}
            exit={reduce ? { opacity: 0 } : { y: '100%', transition: { duration: 0.2, ease: 'easeIn' } }}
            drag={reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragListener={false}
            dragControls={drag}
            onDragEnd={onDragEnd}
          >
            {/* maniglia + titolo: area di trascinamento per chiudere */}
            <div className="shrink-0 cursor-grab touch-none" onPointerDown={(e) => drag.start(e)}>
              <div className="flex justify-center pt-2 pb-1">
                <span className="h-[5px] w-9 rounded-full bg-border" aria-hidden />
              </div>
              <div className="flex items-start justify-between gap-4 px-gutter pt-2 pb-4">
              <h2 id={titleId} className="font-display text-sheet-title">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Chiudi"
                className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-fg-muted"
              >
                <X className="size-6" />
              </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter pb-6">{children}</div>
            {footer && (
              <div className="shrink-0 border-t border-border px-gutter pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
