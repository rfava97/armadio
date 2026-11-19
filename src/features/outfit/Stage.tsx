import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { useGesture } from '@use-gesture/react'
import type { GarmentWithThumb } from '@/features/garments/api'
import type { Category } from '@/lib/garments'
import { layerRow, ON_ME_PAD } from '@/lib/onMe'
import { useTopShapes } from '@/lib/image/topShape'
import { useCoverMasks } from './useCoverMasks'
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
  /** riga delle spalle sulla foto (frazione), per i cappucci degli strati sotto */
  shoulderY?: number
}

type Props = {
  garments: GarmentWithThumb[]
  state: CamerinoState
  /** se presente, vista "Su di me"; altrimenti il tavolo con i capi stesi */
  onMe: OnMeSource | null
  onSelectZone: (zone: StageZone) => void
  onStep: (dir: 1 | -1) => void
  /** "Su di me": anteprima della correzione del capo attivo, disegnata fuori da React */
  adjustCanvas?: HTMLCanvasElement | null
  /** "Su di me": per ogni strato del busto coperto, cosa può spuntare sopra i capi esterni */
  onCollars?: (kinds: Map<string, 'hood' | 'collar'>) => void
}

/**
 * Sul tavolo i capi sono in proporzione tra loro, come stesi davvero: ogni foto viene scalata sulla
 * lunghezza tipica della sua categoria (cm). Una maglia è lunga circa 70 cm, un pantalone 104,
 * un paio di scarpe largo 30. Il busto copre la vita dei pantaloni, le scarpe ne toccano l'orlo.
 */
const LENGTH_CM: Partial<Record<Category, number>> = {
  canotte: 66,
  maglie: 70,
  camicie: 78,
  felpe_maglioni: 68,
  giacche_cappotti: 76,
  pantaloni: 104,
  jeans: 104,
}
const SHOES_CM = 30
/**
 * Larghezza del petto (capo steso, cm): i capi del busto si scalano su questa, riconosciuta nella
 * foto, così un cappuccio o le maniche aperte non falsano le proporzioni.
 */
const CHEST_CM: Partial<Record<Category, number>> = {
  canotte: 46,
  maglie: 52,
  camicie: 54,
  felpe_maglioni: 58,
  giacche_cappotti: 60,
}
/** quote verticali sul tavolo (cm dall'alto): spalle, inizio pantaloni, inizio scarpe, altezza totale */
const SHOULDER_Y = 24 // spazio sopra le spalle per cappucci e colletti alti
const PANTS_Y = 72
const SHOES_Y = 171
const TABLE_H = 192
/** larghezza da far stare nel palco (una felpa con le maniche aperte) */
const TABLE_W = 110
const PEEK = 0.16 // quota di schermo occupata dal capo che si intravede ai lati
const SHADOW = 'drop-shadow(0 3px 6px rgba(11, 31, 68, 0.22))'

/** fit "height": la foto è alta quanto il riquadro e centrata (larghezza naturale) */
type Item = {
  key: string
  g: GarmentWithThumb
  zone: StageZone
  layer: number
  box: Box
  z: number
  src: string
  fit?: 'height'
  /** mask-image CSS (immagine o gradiente) */
  mask?: string
  /** solo da vedere: non si sposta con lo swipe (es. il cappuccio sopra la giacca) */
  still?: boolean
}

/**
 * Il palco del camerino. Swipe orizzontale: capo precedente/successivo della zona attiva.
 * Tocco: sceglie la zona. Sul tavolo i capi sono le loro foto; "su di me" sono i livelli generati.
 */
export function Stage({ garments, state, onMe, onSelectZone, onStep, adjustCanvas, onCollars }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const dragX = useMotionValue(0)
  // su di te il capo non segue il dito (la maschera dei capi sopra resterebbe ferma e lo taglierebbe):
  // sbiadisce mentre trascini e cambia in dissolvenza
  const dragFade = useTransform(dragX, (v) => Math.max(0.35, 1 - Math.abs(v) / 260))
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
  const aspect = onMe?.aspect
  const av = useMemo<Box>(() => {
    if (!aspect) return { left: 0, top: 0, width: size.w, height: size.h }
    let h = size.h
    let w = h * aspect
    if (w > size.w * 0.7) {
      w = size.w * 0.7
      h = w / aspect
    }
    return { left: (size.w - w) / 2, top: size.h - h, width: w, height: h }
  }, [size, aspect])

  // tavolo: px per cm, e la composizione centrata in verticale
  const cm = Math.max(0.01, Math.min(size.h / TABLE_H, size.w / TABLE_W))
  const y0cm = (size.h - TABLE_H * cm) / 2

  /** Riquadro di una zona sul tavolo, o fascia del corpo "su di me". */
  const zoneBox = (z: StageZone): Box => {
    if (onMe) {
      const [a, b] = onMe.split
      const y0 = z === 'busto' ? 0.08 : z === 'gambe' ? a : b
      const y1 = z === 'busto' ? a : z === 'gambe' ? b : 1
      return { left: av.left, top: av.top + y0 * av.height, width: av.width, height: (y1 - y0) * av.height }
    }
    const cx = size.w / 2
    if (z === 'busto') return { left: cx - 45 * cm, top: y0cm, width: 90 * cm, height: (SHOULDER_Y + 68) * cm }
    if (z === 'gambe') return { left: cx - 28 * cm, top: y0cm + PANTS_Y * cm, width: 56 * cm, height: 104 * cm }
    return { left: cx - 22 * cm, top: y0cm + SHOES_Y * cm, width: 44 * cm, height: 19 * cm }
  }

  const zoneAt = (y: number): StageZone => {
    if (onMe) {
      const f = (y - av.top) / av.height
      return f < onMe.split[0] ? 'busto' : f < onMe.split[1] ? 'gambe' : 'piedi'
    }
    const c = (y - y0cm) / cm
    return c < (PANTS_Y + SHOULDER_Y + 68) / 2 ? 'busto' : c < SHOES_Y + 2 ? 'gambe' : 'piedi'
  }

  // cambiando capo, zona o vista il capo attivo riparte sempre dal centro
  const onMeView = !!onMe
  useEffect(() => {
    dragX.set(0)
  }, [activeId, activeZone, activeLayer, onMeView, dragX])

  // rete di sicurezza: su iPhone a volte il gesto finisce senza l'ultimo evento e il capo resterebbe
  // spostato di lato. Dopo ogni tocco, se non si sta trascinando, torna al suo posto.
  const dragging = useRef(false)
  useEffect(() => {
    let timer = 0
    const settle = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (!dragging.current && dragX.get() !== 0) animate(dragX, 0, { type: 'spring', stiffness: 300, damping: 30 })
      }, 350)
    }
    const events = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'] as const
    for (const e of events) window.addEventListener(e, settle, { passive: true })
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, settle)
    }
  }, [dragX])

  const prevId = neighbor(state, garments, -1)
  const nextId = neighbor(state, garments, 1)
  const step = (d: 1 | -1) => {
    setDir(d)
    onStep(d)
  }

  const bind = useGesture(
    {
      onDrag: ({ movement: [mx], last, tap, event, velocity: [vx], canceled, active }) => {
        dragging.current = active && !canceled
        if (tap) {
          dragX.set(0)
          const r = stage.current!.getBoundingClientRect()
          onSelectZone(zoneAt((event as PointerEvent).clientY - r.top))
          return
        }
        if (canceled || event.type === 'pointercancel') {
          // il sistema si è preso il gesto (es. scorrimento): il capo torna al suo posto
          animate(dragX, 0, { type: 'spring', stiffness: 300, damping: 30 })
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
    // mentre correggi un capo niente swipe: resta fermo quello che stai regolando
    { drag: { filterTaps: true, axis: 'x' }, enabled: !adjustCanvas },
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
  const shapes = useTopShapes(busto.map(({ g }) => ({ id: g.id, url: g.thumbUrl })))
  // su di me: ogni strato del busto è nascosto dove esce dai capi sopra (es. felpa sotto la giacca)
  const tops = onMe ? busto.flatMap(({ g }) => (onMe.layers.get(g.id) ? [{ id: g.id, url: onMe.layers.get(g.id)! }] : [])) : []
  const onMeTops = tops.map((t) => t.url)
  const shoulderLine = onMe?.shoulderY !== undefined ? layerRow(onMe.shoulderY, onMe.aspect) : undefined
  const covers = useCoverMasks(
    onMeTops,
    shoulderLine,
    tops.map((t) => (state.outfit.inside ?? []).includes(t.id)),
    tops.map((t) => (state.outfit.collarIn ?? []).includes(t.id)),
  )
  const collarKey = tops.flatMap((t, i) => (covers.kinds[i] ? [`${t.id}:${covers.kinds[i]}`] : [])).join(',')
  useEffect(() => {
    onCollars?.(new Map(collarKey ? collarKey.split(',').map((p) => p.split(':') as [string, 'hood' | 'collar']) : []))
  }, [collarKey, onCollars])

  if (onMe) {
    // il livello copre la foto allargata del margine usato nella generazione
    const pad = ON_ME_PAD * Math.max(av.width, av.height)
    const box = { left: av.left - pad, top: av.top - pad, width: av.width + pad * 2, height: av.height + pad * 2 }
    // scarpe, pantaloni, poi gli strati del busto dal più interno
    // scarpe sotto i pantaloni: un pantalone largo ci ricade sopra
    const pl = piedi && onMe.layers.get(piedi.id)
    if (piedi && pl) items.push({ key: 'piedi', g: piedi, zone: 'piedi', layer: 0, box, z: 5, src: pl })
    const gl = gambe && onMe.layers.get(gambe.id)
    if (gambe && gl) items.push({ key: 'gambe', g: gambe, zone: 'gambe', layer: 0, box, z: 10, src: gl })
    busto.forEach(({ g, i }, n) => {
      const src = onMe.layers.get(g.id)
      if (!src) return
      const k = onMeTops.indexOf(src)
      const m = covers.masks[k]
      items.push({ key: `busto-${i}`, g, zone: 'busto', layer: i, box, z: 20 + n, src, mask: m && `url(${m})` })
      // cappuccio tirato fuori: solo la sua forma, sopra tutti i capi
      const hood = covers.hoods[k]
      if (hood) {
        items.push({ key: `cappuccio-${i}`, g, zone: 'busto', layer: i, box, z: 35, src, still: true, mask: `url(${hood})` })
      }
    })
  } else {
    const full = (top: number, height: number, shift = 0): Box => ({ left: shift, top, width: size.w, height })
    if (gambe?.thumbUrl) {
      const h = (LENGTH_CM[gambe.category] ?? 104) * cm
      items.push({ key: 'gambe', g: gambe, zone: 'gambe', layer: 0, box: full(y0cm + PANTS_Y * cm, h), z: 10, src: gambe.thumbUrl, fit: 'height' })
    }
    if (piedi?.thumbUrl) {
      const box = { left: size.w / 2 - (SHOES_CM / 2) * cm, top: y0cm + SHOES_Y * cm, width: SHOES_CM * cm, height: 19 * cm }
      items.push({ key: 'piedi', g: piedi, zone: 'piedi', layer: 0, box, z: 15, src: piedi.thumbUrl })
    }
    // strati del busto: i più interni spuntano in alto a sinistra, come capi sovrapposti sul tavolo
    // strati del busto: tutti allineati alle spalle e al centro del petto, uno dietro l'altro
    const shoulders = y0cm + SHOULDER_Y * cm
    busto.forEach(({ g, i }, n) => {
      if (!g.thumbUrl) return
      const shape = shapes[g.id]
      let box: Box | null = null
      if (shape) {
        const width = ((CHEST_CM[g.category] ?? 54) * cm) / (shape.torsoR - shape.torsoL)
        const height = width / shape.aspect
        const below = (height * (1 - shape.shoulderY)) / cm // lunghezza dalle spalle, in cm
        // forma riconosciuta solo se plausibile (da canotta corta a cappotto)
        if (below > 35 && below < 125) {
          box = {
            left: size.w / 2 - ((shape.torsoL + shape.torsoR) / 2) * width,
            top: shoulders - shape.shoulderY * height,
            width,
            height,
          }
        }
      }
      items.push(
        box
          ? { key: `busto-${i}`, g, zone: 'busto', layer: i, box, z: 20 + n, src: g.thumbUrl }
          : { key: `busto-${i}`, g, zone: 'busto', layer: i, box: full(shoulders - 3 * cm, (LENGTH_CM[g.category] ?? 70) * cm), z: 20 + n, src: g.thumbUrl, fit: 'height' },
      )
    })
  }

  const isActive = (it: Item) => it.zone === activeZone && (activeZone !== 'busto' || it.layer === activeLayer)
  // su di me: il capo scelto che non si vede addosso (scarpe, accessori, non ancora preparato)
  const activeGarment = activeId ? byId.get(activeId) : undefined
  const card = onMe && activeGarment?.thumbUrl && !items.some((it) => !it.still && isActive(it)) ? activeGarment : undefined
  const cardSide = Math.min(size.w * 0.28, 120)

  const picture = (src: string, alt: string, fit?: 'height'): ReactNode => (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={fit === 'height' ? 'mx-auto block h-full w-auto max-w-none' : 'h-full w-full object-contain'}
    />
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
            const mask = it.mask && {
              maskImage: it.mask,
              WebkitMaskImage: it.mask,
              maskSize: '100% 100%',
              WebkitMaskSize: '100% 100%',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
            }
            const style = { ...it.box, zIndex: it.z, filter: onMe ? undefined : SHADOW, ...mask }
            if (it.still || !isActive(it)) {
              return (
                <div key={it.key} className="pointer-events-none absolute" style={style}>
                  {picture(it.src, it.g.name, it.fit)}
                </div>
              )
            }
            return (
              <motion.div key={it.key} className="pointer-events-none absolute" style={onMe ? { ...style, opacity: dragFade } : { ...style, x: dragX }}>
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
                    {onMe && adjustCanvas ? <CanvasHost canvas={adjustCanvas} /> : picture(it.src, it.g.name, it.fit)}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            )
          })}

          {card && (
            <div
              className="pointer-events-none absolute z-[45] flex flex-col overflow-hidden rounded-card border border-border bg-garment-bg shadow-sm"
              style={{ right: 0, bottom: 0, width: cardSide }}
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ height: cardSide, x: dragX }}
                  className="p-2"
                >
                  {picture(card.thumbUrl!, card.name)}
                </motion.div>
              </AnimatePresence>
              <p className="truncate bg-surface px-2 py-1 text-caption">{card.name}</p>
            </div>
          )}
          {!adjustCanvas && peek(prevId, 'left')}
          {!adjustCanvas && peek(nextId, 'right')}
        </>
      )}
    </div>
  )
}

/** Mostra un canvas che viene ridisegnato da fuori (anteprima della correzione). */
function CanvasHost({ canvas }: { canvas: HTMLCanvasElement }) {
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    el.appendChild(canvas)
    return () => {
      if (canvas.parentNode === el) el.removeChild(canvas)
    }
  }, [canvas])
  return <div ref={host} className="h-full w-full" />
}
