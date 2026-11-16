import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ANCHOR_KEYS, ANCHOR_LABEL, type AnchorKey, type Anchors } from '@/lib/mannequin'
import { cn } from '@/lib/utils'

const clamp = (v: number) => Math.min(1, Math.max(0, v))

// linee guida tra i marcatori: aiutano a capire se lo "scheletro" è dritto
const LINES: [AnchorKey, AnchorKey][] = [
  ['shoulder_l', 'shoulder_r'],
  ['neck', 'waist'],
  ['waist', 'hips'],
  ['hips', 'ankle_l'],
  ['hips', 'ankle_r'],
]

/**
 * Calibrazione (SPEC 2.3 B): 7 marcatori da trascinare sulla foto.
 * `readOnly` mostra solo i punti (anteprima nel Profilo).
 */
export function AnchorEditor({
  src,
  aspect,
  anchors,
  onChange,
  readOnly = false,
  maxHeight,
  className,
}: {
  src: string
  aspect: number
  anchors: Anchors
  onChange?: (a: Anchors) => void
  readOnly?: boolean
  /** altezza massima (es. "52dvh"): la larghezza si adegua per non deformare la foto */
  maxHeight?: string
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef<AnchorKey | null>(null)

  const moveTo = (key: AnchorKey, clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || !onChange) return
    onChange({ ...anchors, [key]: { x: clamp((clientX - r.left) / r.width), y: clamp((clientY - r.top) / r.height) } })
  }

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    dragging.current = e.currentTarget.dataset.anchor as AnchorKey
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* puntatore già rilasciato */
    }
  }
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragging.current) moveTo(dragging.current, e.clientX, e.clientY)
  }
  const up = () => {
    dragging.current = null
  }
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.currentTarget.dataset.anchor as AnchorKey
    const step = e.shiftKey ? 0.02 : 0.005
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d || !onChange) return
    e.preventDefault()
    onChange({ ...anchors, [k]: { x: clamp(anchors[k].x + d[0]), y: clamp(anchors[k].y + d[1]) } })
  }

  return (
    <div
      ref={box}
      className={cn('relative mx-auto touch-none select-none', className)}
      style={{
        aspectRatio: String(aspect),
        ...(maxHeight && { maxHeight, maxWidth: `calc(${maxHeight} * ${aspect})` }),
      }}
    >
      <img src={src} alt="La tua foto" className="pointer-events-none h-full w-full" draggable={false} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {LINES.map(([a, b]) => (
          <line
            key={a + b}
            x1={anchors[a].x * 100}
            y1={anchors[a].y * 100}
            x2={anchors[b].x * 100}
            y2={anchors[b].y * 100}
            stroke="var(--accent)"
            strokeOpacity={0.55}
            strokeWidth={readOnly ? 1 : 1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {ANCHOR_KEYS.map((k) => {
        const p = anchors[k]
        const left = k.endsWith('_l')
        return readOnly ? (
          <span
            key={k}
            aria-hidden
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface bg-accent"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          />
        ) : (
          <button
            key={k}
            type="button"
            data-anchor={k}
            aria-label={`${ANCHOR_LABEL[k]}${k.endsWith('_l') ? ' a sinistra' : k.endsWith('_r') ? ' a destra' : ''}: trascina o usa le frecce`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={key}
            className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            <span className="size-5 rounded-full border-2 border-surface bg-accent shadow-float" />
            <span
              className={cn(
                'pointer-events-none absolute rounded-full bg-navy/85 px-2 py-0.5 text-[12px] font-medium whitespace-nowrap text-on-accent',
                k === 'neck'
                  ? 'bottom-full left-1/2 -mb-1 -translate-x-1/2'
                  : left
                    ? 'top-1/2 right-full mr-0.5 -translate-y-1/2'
                    : 'top-1/2 left-full ml-0.5 -translate-y-1/2',
              )}
            >
              {ANCHOR_LABEL[k]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
