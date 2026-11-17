import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'framer-motion'
import { useGesture } from '@use-gesture/react'
import { Mannequin } from '@/components/Mannequin'
import type { Anchors, Measures } from '@/lib/mannequin'
import type { GarmentWithThumb, Fit } from '@/features/garments/api'
import { placeGarment, type Box } from './placement'
import { getActiveId, MAX_LAYERS, neighbor, type CamerinoState, type StageZone } from './state'
import { cn } from '@/lib/utils'

export type AvatarSource =
  | { kind: 'mannequin'; measures: Measures; anchors: Anchors; aspect: number }
  | { kind: 'photo'; url: string; anchors: Anchors; aspect: number }

type Props = {
  garments: GarmentWithThumb[]
  state: CamerinoState
  avatar: AvatarSource
  /** vestibilità in modifica per il capo attivo (modalità "Regola") */
  adjust: Fit | null
  onAdjust: (f: Fit) => void
  onSelectZone: (zone: StageZone) => void
  onStep: (dir: 1 | -1) => void
  onAddLayer: () => void
}

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE = 10
const PEEK = 0.17 // quota di schermo dove arriva il capo che si intravede ai lati

/** Zona dell'avatar sotto il dito (y in 0..1 dell'avatar). */
function zoneAt(y: number, a: Anchors): StageZone {
  if (y < (a.waist.y + a.hips.y) / 2) return 'busto'
  if (y < (a.ankle_l.y + a.ankle_r.y) / 2 - 0.025) return 'gambe'
  return 'piedi'
}

export function Stage({ garments, state, avatar, adjust, onAdjust, onSelectZone, onStep, onAddLayer }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null)
  const dragX = useMotionValue(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const press = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null)
  const reduce = useReducedMotion()

  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // riquadro dell'avatar: alto quanto il palco, centrato, appoggiato in basso
  const av = useMemo(() => {
    let h = size.h
    let w = h * avatar.aspect
    if (w > size.w * 0.62) {
      w = size.w * 0.62
      h = w / avatar.aspect
    }
    return { left: (size.w - w) / 2, top: size.h - h, w, h }
  }, [size, avatar.aspect])

  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments])
  const activeId = getActiveId(state)
  const { zone: activeZone, layer: activeLayer } = state.active

  const boxFor = (g: GarmentWithThumb, zone: StageZone, fit?: Fit | null): Box | null => {
    const aspect = aspects[g.id]
    if (!aspect || av.w === 0) return null
    const b = placeGarment(fit ? { ...g, ...fit } : g, zone, aspect, avatar.anchors, av.w, av.h)
    return { ...b, left: b.left + av.left, top: b.top + av.top }
  }

  // capi indossati, con il loro ordine z (gambe < scarpe < busto per rango e strato)
  const worn: { g: GarmentWithThumb; zone: StageZone; z: number; layer: number }[] = []
  const gambe = state.outfit.gambe ? byId.get(state.outfit.gambe) : undefined
  if (gambe) worn.push({ g: gambe, zone: 'gambe', z: 10, layer: 0 })
  const piedi = state.outfit.piedi ? byId.get(state.outfit.piedi) : undefined
  if (piedi) worn.push({ g: piedi, zone: 'piedi', z: 20, layer: 0 })
  state.outfit.busto.forEach((id, i) => {
    const g = id ? byId.get(id) : undefined
    if (g) worn.push({ g, zone: 'busto', z: 30 + g.layer_rank * MAX_LAYERS + i, layer: i })
  })

  const isActive = (w: { zone: StageZone; layer: number }) =>
    w.zone === activeZone && (activeZone !== 'busto' || w.layer === activeLayer)

  const prevId = adjust ? null : neighbor(state, garments, -1)
  const nextId = adjust ? null : neighbor(state, garments, 1)

  const step = (d: 1 | -1) => {
    setDir(d)
    onStep(d)
  }

  // pressione lunga sul busto → nuovo strato (anello che si riempie, vibrazione)
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
    setRing(null)
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (adjust || state.outfit.busto.length >= MAX_LAYERS) return
    const r = stage.current!.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    if (zoneAt((y - av.top) / av.h, avatar.anchors) !== 'busto') return
    const timer = window.setTimeout(() => {
      if (!press.current) return
      press.current.fired = true
      setRing(null)
      navigator.vibrate?.(15)
      setDir(1)
      onAddLayer()
    }, LONG_PRESS_MS)
    press.current = { x: e.clientX, y: e.clientY, timer, fired: false }
    setRing({ x, y })
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancelPress()
  }
  useEffect(() => () => cancelPress(), [])

  const adjustStart = useRef<Fit | null>(null)
  const activeWorn = worn.find(isActive)
  const activeBox = activeWorn ? boxFor(activeWorn.g, activeWorn.zone, adjust) : null

  const bind = useGesture(
    {
      onDrag: ({ movement: [mx, my], last, tap, first, event, velocity: [vx] }) => {
        if (tap) {
          // un tocco breve sceglie la zona (la pressione lunga è gestita a parte)
          if (press.current?.fired) return
          const r = stage.current!.getBoundingClientRect()
          const pe = event as PointerEvent
          onSelectZone(zoneAt((pe.clientY - r.top - av.top) / av.h, avatar.anchors))
          return
        }
        if (press.current?.fired) return
        if (adjust && activeBox) {
          if (first) adjustStart.current = adjust
          const s = adjustStart.current ?? adjust
          onAdjust({
            ...s,
            fit_offset_x: s.fit_offset_x + mx / activeBox.width,
            fit_offset_y: s.fit_offset_y + my / activeBox.height,
          })
          return
        }
        dragX.set(mx)
        if (last) {
          const far = Math.abs(mx) > size.w * 0.18
          const flick = Math.abs(vx) > 0.5 && Math.abs(mx) > 24
          if ((far || flick) && activeId && nextId !== activeId) {
            dragX.set(0)
            step(mx < 0 ? 1 : -1)
          } else {
            animate(dragX, 0, { type: 'spring', stiffness: 300, damping: 30 })
          }
        }
      },
      onPinch: ({ offset: [scale], first, memo }) => {
        if (!adjust) return memo
        const base = first ? adjust.fit_scale : (memo as number)
        onAdjust({ ...adjust, fit_scale: Math.min(2, Math.max(0.5, base * scale)) })
        return base
      },
    },
    {
      drag: { filterTaps: true },
      pinch: { scaleBounds: { min: 0.5, max: 2 }, from: () => [1, 0] },
    },
  )
  const handlers = bind()

  const variants = reduce
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: (d: number) => ({ x: d * 70, opacity: 0, scale: 0.92 }),
        center: { x: 0, opacity: 1, scale: 1 },
        exit: (d: number) => ({ x: d * -70, opacity: 0, scale: 0.92 }),
      }

  const zoneBand = (() => {
    const a = avatar.anchors
    const y0 = activeZone === 'busto' ? a.neck.y - 0.03 : activeZone === 'gambe' ? (a.waist.y + a.hips.y) / 2 : (a.ankle_l.y + a.ankle_r.y) / 2 - 0.025
    const y1 = activeZone === 'busto' ? (a.waist.y + a.hips.y) / 2 : activeZone === 'gambe' ? (a.ankle_l.y + a.ankle_r.y) / 2 - 0.025 : 1
    // largo quanto la figura (dalle spalle), non quanto il riquadro dell'avatar
    const half = Math.abs(a.shoulder_r.x - a.shoulder_l.x) * 0.95
    const cx = (a.shoulder_l.x + a.shoulder_r.x) / 2
    return { top: av.top + y0 * av.h, height: (y1 - y0) * av.h, left: av.left + (cx - half) * av.w, width: 2 * half * av.w }
  })()

  const peek = (id: string | null, side: 'left' | 'right') => {
    if (!id || id === activeId) return null
    const g = byId.get(id)
    if (!g || !activeWorn) return null
    const b = boxFor(g, activeZone)
    if (!b) return null
    const left = side === 'left' ? size.w * PEEK - b.width : size.w * (1 - PEEK)
    return (
      <button
        key={`peek-${side}`}
        type="button"
        aria-label={`${side === 'left' ? 'Capo precedente' : 'Capo successivo'}: ${g.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => step(side === 'left' ? -1 : 1)}
        className="absolute z-[60] opacity-45 transition-opacity active:opacity-70"
        style={{ left, top: b.top, width: b.width, height: b.height }}
      >
        <img src={g.thumbUrl ?? ''} alt="" className="h-full w-full object-contain" draggable={false} />
      </button>
    )
  }

  return (
    <div
      ref={stage}
      className="relative h-full w-full touch-none overflow-hidden select-none"
      {...handlers}
      onPointerDown={(e) => {
        handlers.onPointerDown?.(e)
        onPointerDown(e)
      }}
      onPointerMove={(e) => {
        handlers.onPointerMove?.(e)
        onPointerMove(e)
      }}
      onPointerUp={(e) => {
        handlers.onPointerUp?.(e)
        cancelPress()
      }}
      onPointerCancel={(e) => {
        handlers.onPointerCancel?.(e)
        cancelPress()
      }}
    >
      {/* alone sulla zona attiva */}
      {av.w > 0 && !adjust && (
        <div
          aria-hidden
          className="absolute rounded-[28px] border border-accent/25 bg-accent/5 transition-all duration-300"
          style={zoneBand}
        />
      )}

      {/* avatar */}
      <div className="absolute" style={{ left: av.left, top: av.top, width: av.w, height: av.h }}>
        {avatar.kind === 'mannequin' ? (
          <Mannequin measures={avatar.measures} className="h-full w-full" />
        ) : (
          <img src={avatar.url} alt="La tua foto" className="h-full w-full" draggable={false} />
        )}
      </div>

      {/* per conoscere le proporzioni dei capi prima di posizionarli */}
      <div hidden>
        {[...worn.map((w) => w.g), ...[prevId, nextId].map((id) => (id ? byId.get(id) : undefined))]
          .filter((g): g is GarmentWithThumb => !!g && !aspects[g.id] && !!g.thumbUrl)
          .map((g) => (
            <img
              key={g.id}
              src={g.thumbUrl!}
              alt=""
              onLoad={(e) => {
                const im = e.currentTarget
                setAspects((a) => ({ ...a, [g.id]: im.naturalWidth / im.naturalHeight }))
              }}
            />
          ))}
      </div>

      {worn.map((w) => {
        const active = isActive(w)
        const b = boxFor(w.g, w.zone, active ? adjust : null)
        if (!b) return null
        const img = (
          <img src={w.g.thumbUrl ?? ''} alt={w.g.name} className="h-full w-full object-contain" draggable={false} />
        )
        if (!active) {
          return (
            <div key={w.g.id + w.zone + w.layer} className="pointer-events-none absolute" style={{ ...b, zIndex: w.z }}>
              {img}
            </div>
          )
        }
        return (
          <motion.div key={`active-${w.zone}-${w.layer}`} className="pointer-events-none absolute" style={{ ...b, zIndex: w.z, x: dragX }}>
            <AnimatePresence custom={dir} initial={false} mode="popLayout">
              <motion.div
                key={w.g.id}
                custom={dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className={cn('h-full w-full', adjust && 'rounded-input outline-2 outline-offset-4 outline-accent outline-dashed')}
              >
                {img}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )
      })}

      {peek(prevId, 'left')}
      {peek(nextId, 'right')}

      {ring && (
        <motion.svg
          aria-hidden
          className="pointer-events-none absolute z-[70] size-16 -translate-x-1/2 -translate-y-1/2"
          style={{ left: ring.x, top: ring.y }}
          viewBox="0 0 64 64"
          // compare dopo un attimo: tocchi e swipe non fanno lampeggiare l'anello
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.1 }}
        >
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--accent)" strokeOpacity="0.2" strokeWidth="5" />
          <motion.circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="5"
            strokeLinecap="round"
            transform="rotate(-90 32 32)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: LONG_PRESS_MS / 1000, ease: 'linear' }}
          />
        </motion.svg>
      )}
    </div>
  )
}
