import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { CropRect } from '@/lib/image/crop'

const MIN = 0.1
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

/**
 * Riquadro di ritaglio: trascina dentro per spostarlo, dagli angoli per ridimensionarlo.
 * Il fuori-riquadro è oscurato. Funziona con dito e mouse (pointer events).
 */
export function CropBox({
  src,
  aspect,
  rect,
  onChange,
}: {
  src: string
  /** larghezza / altezza dell'immagine */
  aspect: number
  rect: CropRect
  onChange: (r: CropRect) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ handle: Handle; startX: number; startY: number; start: CropRect } | null>(null)

  const begin = (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const handle = (e.currentTarget.dataset.handle ?? 'move') as Handle
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* puntatore già rilasciato */
    }
    drag.current = { handle, startX: e.clientX, startY: e.clientY, start: rect }
  }

  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    const el = box.current
    if (!d || !el) return
    const bounds = el.getBoundingClientRect()
    const dx = (e.clientX - d.startX) / bounds.width
    const dy = (e.clientY - d.startY) / bounds.height
    const s = d.start
    let { x, y, w, h } = s
    if (d.handle === 'move') {
      x = clamp(s.x + dx, 0, 1 - s.w)
      y = clamp(s.y + dy, 0, 1 - s.h)
    } else {
      const right = s.x + s.w
      const bottom = s.y + s.h
      if (d.handle.includes('w')) {
        x = clamp(s.x + dx, 0, right - MIN)
        w = right - x
      } else {
        w = clamp(s.w + dx, MIN, 1 - s.x)
      }
      if (d.handle.includes('n')) {
        y = clamp(s.y + dy, 0, bottom - MIN)
        h = bottom - y
      } else {
        h = clamp(s.h + dy, MIN, 1 - s.y)
      }
    }
    onChange({ x, y, w, h })
  }

  const end = () => {
    drag.current = null
  }

  const pct = (v: number) => `${v * 100}%`
  const corners: { h: Handle; style: CSSProperties; label: string }[] = [
    { h: 'nw', style: { left: 0, top: 0 }, label: 'Angolo in alto a sinistra' },
    { h: 'ne', style: { right: 0, top: 0 }, label: 'Angolo in alto a destra' },
    { h: 'sw', style: { left: 0, bottom: 0 }, label: 'Angolo in basso a sinistra' },
    { h: 'se', style: { right: 0, bottom: 0 }, label: 'Angolo in basso a destra' },
  ]

  return (
    <div className="flex justify-center">
      <div
        ref={box}
        className="relative max-h-[55dvh] w-full touch-none select-none overflow-hidden rounded-card bg-surface-muted"
        style={{ aspectRatio: String(aspect), maxWidth: `calc(55dvh * ${aspect})` }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <img src={src} alt="Foto da ritagliare" className="pointer-events-none h-full w-full" draggable={false} />
        {/* area scura fuori dal riquadro */}
        <div
          className="pointer-events-none absolute border-2 border-on-accent"
          style={{
            left: pct(rect.x),
            top: pct(rect.y),
            width: pct(rect.w),
            height: pct(rect.h),
            boxShadow: '0 0 0 9999px rgba(17,17,17,.5)',
          }}
        />
        <div
          className="absolute cursor-move"
          style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
          data-handle="move"
          onPointerDown={begin}
        >
          {corners.map((c) => (
            <div
              key={c.h}
              role="presentation"
              aria-label={c.label}
              data-handle={c.h}
              onPointerDown={begin}
              className="absolute flex size-11 items-center justify-center"
              style={{ ...c.style, transform: `translate(${c.style.left === 0 ? '-50%' : '50%'}, ${c.style.top === 0 ? '-50%' : '50%'})` }}
            >
              <span className="size-5 rounded-full border-2 border-accent bg-on-accent shadow-card" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
