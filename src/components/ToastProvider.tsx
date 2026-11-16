import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ToastContext } from './toast'

/** Toast (DESIGN.md): pill scura centrata sopra la bottom bar, 2 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current)
    setMsg({ id: Date.now(), text })
    timer.current = window.setTimeout(() => setMsg(null), 2000)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-[60] flex justify-center px-gutter"
      >
        <AnimatePresence>
          {msg && (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-full bg-[rgba(17,17,17,.85)] px-5 py-3 text-card font-medium text-on-accent"
            >
              {msg.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
