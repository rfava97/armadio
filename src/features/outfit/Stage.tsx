import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'framer-motion'
import { useGesture } from '@use-gesture/react'
import type { GarmentWithThumb } from '@/features/garments/api'
import { ON_ME_PAD } from '@/lib/onMe'
import { getActiveId, neighbor, type CamerinoState, type StageZone } from './state'

type Box = { left: number; top: number; width: number; height: number }

/** Vista "Su di me": la tua foto e i livelli dei capi già preparati. */
export type OnMeSource = {
  url: string
  aspect: number
  /** confini busto/gambe e gambe/piedi, in frazione dell'altezza della foto */
  split: [number, number]
  /** id del capo → URL del livello */
  layers: Map<string, string>
}

type Props = {
  garments: GarmentWithThumb[]
  state: CamerinoState
  /** se presente, vista "Su di me"; altrimenti il tavolo con i capi stesi */
  onMe: OnMeSource | null
  onSelectZone: (zone: StageZone) => void
  onStep: (dir: 1 | -1) => void
}

/** Sul tavolo: dove stanno i capi di ogni zona (frazioni del palco), come un outfit steso. */
const TABLE: Record<StageZone, { x: number; y: number; w: number; h: number }> = {
  busto: { x: 0.14, y: 0.0, w: 0.72, h: 0.46 },
  gambe: { x: 0.24, y: 0.4, w: 0.52, h: 0.46 },
  piedi: { x: 0.28, y: 0.84, w: 0.44, h: 0.16 },
}
const PEEK = 0.16 // quota di schermo occupata dal capo che si intravede ai lati
const SHADOW = 'drop-shadow(0 3px 6px rgba(11, 31, 68, 0.22))'

type Item = { key: string; g: GarmentWithThumb; zone: StageZone; layer: number; box: Box; z: number; src: string; top?: boolean }

/**
 * Il palco del camerino. Swipe orizzontale: capo precedente/successivo della zona attiva.
 * Tocco: sceglie la zona. Sul tavolo i capi sono le loro foto; "su di me" sono i livelli generati.
 */
export function Stage({ garments, state, onMe, onSelectZone, onStep }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const dragX = useMotionValue(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const reduce = useReducedMotion()

  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setSize({ w: r.width, h: r.height })
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const byId = useMemo(() => new Map(garments.map((g) => [g.id, g])), [garments])
  const activeId = getActiveId(state)
  const { zone: activeZone, layer: activeLayer } = state.active

  // la foto: alta quanto il palco, centrata, appoggiata in basso
  const av = useMemo<Box>(() => {
    if (!onMe) return { left: 0, top: 0, width: size.w, height: size.h }
    let h = size.h
    let w = h * onMe.aspect
    if (w > size.w * 0.7) {
      w = size.w * 0.7
      h = w / onMe.aspect
    }
    return { left: (size.w - w) / 2, top: size.h - h, width: w, height: h }
  }, [size, onMe])

  /** Riquadro di una zona sul tavolo, o fascia del corpo "su di me". */
  const zoneBox = (z: StageZone): Box => {
    if (onMe) {
      const [a, b] = onMe.split
      const y0 = z === 'busto' ? 0.08 : z === 'gambe' ? a : b
      const y1 = z === 'busto' ? a : z === 'gambe' ? b : 1
      return { left: av.left, top: av.top + y0 * av.height, width: av.width, height: (y1 - y0) * av.height }
    }
    const t = TABLE[z]
    return { left: t.x * size.w, top: t.y * size.h, width: t.w * size.w, height: t.h * size.h }
  }

  const zoneAt = (y: number): StageZone => {
    if (onMe) {
      const f = (y - av.top) / av.height
      return f < onMe.split[0] ? 'busto' : f < onMe.split[1] ? 'gambe' : 'piedi'
    }
    const f = y / size.h
    return f < 0.43 ? 'busto' : f < 0.85 ? 'gambe' : 'piedi'
  }

  const prevId = neighbor(state, garments, -1)
  const nextId = neighbor(state, garments, 1)
  const step = (d: 1 | -1) => {
    setDir(d)
    onStep(d)
  }

  const bind = useGesture(
    {
      onDrag: ({ movement: [mx], last, tap, event, velocity: [vx] }) => {
        if (tap) {
          const r = stage.current!.getBoundingClientRect()
          onSelectZone(zoneAt((event as PointerEvent).clientY - r.top))
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
    },
    { drag: { filterTaps: true, axis: 'x' } },
  )

  // sulla foto i capi cambiano in dissolvenza; sul tavolo scorrono di lato
  const slide =
    reduce || onMe
      ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
      : {
          enter: (d: number) => ({ x: d * 70, opacity: 0, scale: 0.94 }),
          center: { x: 0, opacity: 1, scale: 1 },
          exit: (d: number) => ({ x: d * -70, opacity: 0, scale: 0.94 }),
        }

  // ---- capi visibili, con riquadro e ordine ----
  const items: Item[] = []
  const busto = state.outfit.busto
    .map((id, i) => ({ g: id ? byId.get(id) : undefined, i }))
    .filter((x): x is { g: GarmentWithThumb; i: number } => !!x.g)
    .sort((a, b) => a.g.layer_rank - b.g.layer_rank || a.i - b.i)
  const gambe = state.outfit.gambe ? byId.get(state.outfit.gambe) : undefined
  const piedi = state.outfit.piedi ? byId.get(state.outfit.piedi) : undefined

  if (onMe) {
    // il livello copre la foto allargata del margine usato nella generazione
    const pad = ON_ME_PAD * Math.max(av.width, av.height)
    const box = { left: av.left - pad, top: av.top - pad, width: av.width + pad * 2, height: av.height + pad * 2 }
    // pantaloni sotto, poi gli strati del busto dal più interno; le scarpe restano quelle della foto
    const gl = gambe && onMe.layers.get(gambe.id)
    if (gambe && gl) items.push({ key: 'gambe', g: gambe, zone: 'gambe', layer: 0, box, z: 10, src: gl })
    busto.forEach(({ g, i }, n) => {
      const src = onMe.layers.get(g.id)
      if (src) items.push({ key: `busto-${i}`, g, zone: 'busto', layer: i, box, z: 20 + n, src })
    })
  } else {
    if (gambe?.thumbUrl) items.push({ key: 'gambe', g: gambe, zone: 'gambe', layer: 0, box: zoneBox('gambe'), z: 10, src: gambe.thumbUrl, top: true })
    if (piedi?.thumbUrl) items.push({ key: 'piedi', g: piedi, zone: 'piedi', layer: 0, box: zoneBox('piedi'), z: 15, src: piedi.thumbUrl })
    // strati del busto: i più interni spuntano in alto a sinistra, come capi sovrapposti sul tavolo
    const b = zoneBox('busto')
    busto.forEach(({ g, i }, n) => {
      if (!g.thumbUrl) return
      const depth = busto.length - 1 - n
      const k = 1 - depth * 0.1
      const box = {
        left: b.left + (b.width * (1 - k)) / 2 - depth * b.width * 0.12,
        top: b.top + (b.height * (1 - k)) / 2 - depth * b.height * 0.05,
        width: b.width * k,
        height: b.height * k,
      }
      items.push({ key: `busto-${i}`, g, zone: 'busto', layer: i, box, z: 20 + n, src: g.thumbUrl })
    })
  }

  const isActive = (it: Item) => it.zone === activeZone && (activeZone !== 'busto' || it.layer === activeLayer)

  const picture = (src: string, alt: string, top?: boolean): ReactNode => (
    <img src={src} alt={alt} draggable={false} className={top ? 'h-full w-full object-contain object-top' : 'h-full w-full object-contain'} />
  )

  const peek = (id: string | null, side: 'left' | 'right') => {
    if (!id || id === activeId) return null
    const g = byId.get(id)
    if (!g?.thumbUrl) return null
    const zb = zoneBox(activeZone)
    const w = Math.min(zb.width, size.w * 0.5)
    const left = side === 'left' ? size.w * PEEK - w : size.w * (1 - PEEK)
    return (
      <button
        key={`peek-${side}`}
        type="button"
        aria-label={`${side === 'left' ? 'Capo precedente' : 'Capo successivo'}: ${g.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => step(side === 'left' ? -1 : 1)}
        className="absolute z-[40] opacity-40"
        style={{ left, top: zb.top, width: w, height: zb.height }}
      >
        {picture(g.thumbUrl, '')}
      </button>
    )
  }

  return (
    <div
      ref={stage}
      // isolate: i livelli interni restano sotto i fogli che si aprono sopra.
      // Le immagini non reagiscono al tocco: niente menu "salva immagine", niente selezione.
      className="relative isolate h-full w-full touch-pan-y overflow-hidden select-none [-webkit-touch-callout:none] [&_img]:pointer-events-none [&_img]:select-none"
      {...bind()}
    >
      {size.w > 0 && (
        <>
          {/* quando cambia zona, un alone breve la indica */}
          <motion.div
            key={activeZone + (onMe ? '-me' : '')}
            aria-hidden
            className="pointer-events-none absolute rounded-[28px] bg-accent/10"
            style={zoneBox(activeZone)}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.9, times: [0, 0.25, 1] }}
          />

          {onMe && (
            <div className="absolute" style={av}>
              <img src={onMe.url} alt="La tua foto" className="h-full w-full" draggable={false} />
            </div>
          )}

          {items.map((it) => {
            const style = { ...it.box, zIndex: it.z, filter: onMe ? undefined : SHADOW }
            if (!isActive(it)) {
              return (
                <div key={it.key} className="pointer-events-none absolute" style={style}>
                  {picture(it.src, it.g.name, it.top)}
                </div>
              )
            }
            return (
              <motion.div key={it.key} className="pointer-events-none absolute" style={{ ...style, x: dragX }}>
                <AnimatePresence custom={dir} initial={false} mode="popLayout">
                  <motion.div
                    key={it.g.id}
                    custom={dir}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="h-full w-full"
                  >
                    {picture(it.src, it.g.name, it.top)}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            )
          })}

          {peek(prevId, 'left')}
          {peek(nextId, 'right')}
        </>
      )}
    </div>
  )
}
