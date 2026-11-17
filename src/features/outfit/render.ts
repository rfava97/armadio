import type { Category } from '@/lib/garments'
import type { Dressed, P } from '@/lib/image/dress'
import type { Skeleton } from '@/lib/skeleton'
import type { StageZone } from './state'

export type Rect = { left: number; top: number; width: number; height: number }

/** Scheletro in px dell'avatar. */
export type SkeletonPx = { [K in keyof Skeleton]: P }

export type GarmentLayout = {
  d: Dressed
  category: Category
  zone: StageZone
  fit: { scale: number; ox: number; oy: number }
  sk: SkeletonPx
  /** larghezza del corpo ai fianchi (px) */
  hipWidth: number
  /** se la maglia è infilata: riga (px) sotto cui il busto sparisce nei pantaloni */
  tuckY?: number
}

/**
 * Larghezza del busto del capo rispetto alla distanza tra le spalle. Il busto di un capo steso
 * corrisponde al petto, più stretto delle spalle: le braccia (e le maniche) stanno ai lati.
 * Felpe e giacche hanno più agio di una t-shirt.
 */
const EASE: Partial<Record<Category, number>> = {
  canotte: 0.8,
  maglie: 0.88,
  camicie: 0.9,
  felpe_maglioni: 0.96,
  giacche_cappotti: 1.02,
}
/** Dove cade l'orlo, in frazione del tratto anche → caviglie sotto le anche. */
const HEM: Partial<Record<Category, number>> = {
  canotte: 0.06,
  maglie: 0.1,
  camicie: 0.14,
  felpe_maglioni: 0.1,
  giacche_cappotti: 0.18,
}

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y })
const len = (a: P) => Math.hypot(a.x, a.y)
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Matrice affine [a, b, c, d, e, f] (come Canvas setTransform). */
type M = [number, number, number, number, number, number]
const apply = (m: M, q: P): P => ({ x: m[0] * q.x + m[2] * q.y + m[4], y: m[1] * q.x + m[3] * q.y + m[5] })

type Piece = {
  m: M
  /** rettangolo del capo (colonne/righe) da disegnare */
  rect: [number, number, number, number]
}

/**
 * Calcola i pezzi del capo trasformati sul corpo. Con un contesto li disegna, sempre restituisce
 * il riquadro occupato (per le anteprime ai lati e il contorno in "Regola").
 */
export function layoutGarment(L: GarmentLayout, ctx?: CanvasRenderingContext2D): Rect {
  const { d, sk, fit } = L
  const pieces: Piece[] = []
  let shift: P
  const shoulders = len(sub(sk.shoulderR, sk.shoulderL))

  if (L.zone === 'busto' && d.top) {
    const t = d.top
    const s = (shoulders * (EASE[L.category] ?? 1.08) * fit.scale) / Math.max(1, t.shoulderR.x - t.shoulderL.x)
    const g = mid(t.shoulderL, t.shoulderR)
    const a = mid(sk.shoulderL, sk.shoulderR)
    const ay = a.y - shoulders * 0.03 // la cucitura sta appena sopra il punto della spalla
    // lunghezza: le foto stese allungano il capo; se l'orlo scende troppo lo accorcio
    const hips = mid(sk.hipL, sk.hipR).y
    const ankle = mid(sk.ankleL, sk.ankleR).y
    const hem = hips + (ankle - hips) * (HEM[L.category] ?? 0.1) * fit.scale
    const natural = ay + (d.h - g.y) * s
    const sy = natural > hem ? Math.max(0.7, (hem - ay) / (natural - ay)) : 1
    shift = { x: fit.ox * d.w * s, y: fit.oy * d.h * s * sy }

    // il capo intero (busto e maniche) in un pezzo; se è infilato si ferma alla vita dei pantaloni
    const maxY = L.tuckY !== undefined ? clamp(g.y + (L.tuckY - ay) / (s * sy), 0, d.h) : d.h
    pieces.push({ m: [s, 0, 0, s * sy, a.x - g.x * s, ay - g.y * s * sy], rect: [0, 0, d.w, maxY] })
  } else if (L.zone === 'gambe' && d.bottom) {
    const b = d.bottom
    const hipW = L.hipWidth > 0 ? L.hipWidth : shoulders * 0.95
    const sx = (hipW * 1.06 * fit.scale) / b.waist.width
    const waistY = sk.waist.y
    const waistX = mid(sk.hipL, sk.hipR).x
    const thigh = len(sub(mid(sk.kneeL, sk.kneeR), mid(sk.hipL, sk.hipR)))
    // pantalone intero dalla vita alle caviglie, appena adattato in altezza
    const ankleY = mid(sk.ankleL, sk.ankleR).y
    const sy = clamp((ankleY + thigh * 0.08 - waistY) / d.h, sx * 0.77, sx * 1.3)
    pieces.push({ m: [sx, 0, 0, sy, waistX - b.waist.cx * sx, waistY], rect: [0, 0, d.w, d.h] })
    shift = { x: fit.ox * d.w * sx, y: fit.oy * d.h * sy }
  } else {
    // scarpe (o capo non analizzato): ai piedi, in scala uniforme
    const spread = Math.max(Math.abs(sk.ankleR.x - sk.ankleL.x), shoulders * 0.35)
    const width = spread * 2.3 * fit.scale
    const s = width / d.w
    const c = mid(sk.ankleL, sk.ankleR)
    const height = d.h * s
    pieces.push({ m: [s, 0, 0, s, c.x - width / 2, c.y - height * 0.3], rect: [0, 0, d.w, d.h] })
    shift = { x: fit.ox * width, y: fit.oy * height }
  }

  // riquadro occupato e disegno
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const pc of pieces) {
    const [rx, ry, rw, rh] = pc.rect
    for (const q of [
      { x: rx, y: ry },
      { x: rx + rw, y: ry },
      { x: rx, y: ry + rh },
      { x: rx + rw, y: ry + rh },
    ]) {
      const r = apply(pc.m, q)
      x0 = Math.min(x0, r.x)
      y0 = Math.min(y0, r.y)
      x1 = Math.max(x1, r.x)
      y1 = Math.max(y1, r.y)
    }
    if (ctx) {
      ctx.save()
      ctx.translate(shift.x, shift.y)
      ctx.transform(...pc.m)
      ctx.beginPath()
      ctx.rect(rx, ry, rw, rh)
      ctx.clip()
      ctx.drawImage(d.canvas, 0, 0)
      ctx.restore()
    }
  }
  return { left: x0 + shift.x, top: y0 + shift.y, width: x1 - x0, height: y1 - y0 }
}
