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
  /** modalità "Semplice": maniche dritte e pantaloni in un pezzo, senza piegarli sulle articolazioni */
  simple?: boolean
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
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k })
const len = (a: P) => Math.hypot(a.x, a.y)
const norm = (a: P): P => mul(a, 1 / (len(a) || 1))
const perp = (a: P): P => ({ x: -a.y, y: a.x })
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Matrice affine [a, b, c, d, e, f] (come Canvas setTransform). */
type M = [number, number, number, number, number, number]
const apply = (m: M, q: P): P => ({ x: m[0] * q.x + m[2] * q.y + m[4], y: m[1] * q.x + m[3] * q.y + m[5] })

/**
 * Porta un pezzo del capo lungo un segmento del corpo: il punto `p` del capo va in `S`, il suo
 * asse `a` si allinea alla direzione `D`; lungo l'asse scala `along`, di traverso `across`.
 */
function axisMatrix(p: P, a: P, S: P, D: P, along: number, across: number): M {
  const ap = perp(a)
  const Dp = perp(D)
  const m11 = along * D.x * a.x + across * Dp.x * ap.x
  const m12 = along * D.x * a.y + across * Dp.x * ap.y
  const m21 = along * D.y * a.x + across * Dp.y * ap.x
  const m22 = along * D.y * a.y + across * Dp.y * ap.y
  return [m11, m21, m12, m22, S.x - (m11 * p.x + m12 * p.y), S.y - (m21 * p.x + m22 * p.y)]
}

type Piece = {
  /** le maniche vanno su un livello a parte, con un'ombra che le stacca dal busto */
  sleeve?: boolean
  m: M
  /** rettangolo del capo (colonne/righe) da disegnare */
  rect: [number, number, number, number]
  /** facoltativo: striscia lungo un asse, t ∈ [t0, t1] dal punto p */
  band?: { p: P; a: P; t0: number; t1: number }
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
    const natural = ay + (t.torso.bottom - g.y) * s
    const sy = natural > hem ? Math.max(0.7, (hem - ay) / (natural - ay)) : 1
    const torso: M = [s, 0, 0, s * sy, a.x - g.x * s, ay - g.y * s * sy]
    shift = { x: fit.ox * d.w * s, y: fit.oy * d.h * s * sy }

    const maxY = L.tuckY !== undefined ? clamp(g.y + (L.tuckY - ay) / (s * sy), 0, d.h) : d.h
    pieces.push({ m: torso, rect: [t.torso.left, 0, t.torso.right - t.torso.left, maxY] })

    for (const sl of t.sleeves) {
      const left = sl.pivot.x < g.x
      const elbow = left ? sk.elbowL : sk.elbowR
      const wrist = left ? sk.wristL : sk.wristR
      const S0 = apply(torso, sl.pivot)
      const upper = len(sub(elbow, S0))
      const arm = upper + len(sub(wrist, elbow))
      const natural = sl.length * s
      // maniche lunghe: il polsino arriva al polso; maniche corte: restano corte
      const k = natural > arm * 0.55 ? clamp(arm / natural, 0.75, 1.35) : 1
      const split = upper / (s * k) // punto della manica che va sul gomito (px del capo)
      const D1 = norm(sub(elbow, S0))
      const rect: Piece['rect'] = [sl.from, 0, sl.to - sl.from, d.h]
      if (L.simple) {
        // manica rigida, dalla spalla verso il polso
        pieces.push({ sleeve: true, m: axisMatrix(sl.pivot, sl.axis, S0, norm(sub(wrist, S0)), s * k, s), rect })
        continue
      }
      pieces.push({
        sleeve: true,
        m: axisMatrix(sl.pivot, sl.axis, S0, D1, s * k, s),
        rect,
        band: { p: sl.pivot, a: sl.axis, t0: -sl.length, t1: split + 2 },
      })
      if (sl.length > split) {
        const p2 = add(sl.pivot, mul(sl.axis, split))
        const D2 = norm(sub(wrist, elbow))
        pieces.push({ sleeve: true, m: axisMatrix(p2, sl.axis, elbow, D2, s * k, s), rect, band: { p: p2, a: sl.axis, t0: -2, t1: sl.length } })
      }
    }
  } else if (L.zone === 'gambe' && d.bottom) {
    const b = d.bottom
    const hipW = L.hipWidth > 0 ? L.hipWidth : shoulders * 0.95
    const sx = (hipW * 1.06 * fit.scale) / b.waist.width
    const waistY = sk.waist.y
    const waistX = mid(sk.hipL, sk.hipR).x
    const hipJ = mid(sk.hipL, sk.hipR)
    const thigh = len(sub(mid(sk.kneeL, sk.kneeR), hipJ))
    const crotchBody = hipJ.y + thigh * 0.12
    const sy = clamp((crotchBody - waistY) / Math.max(1, b.crotchY), sx * 0.7, sx * 1.5)
    const pelvis: M = [sx, 0, 0, sy, waistX - b.waist.cx * sx, waistY]
    shift = { x: fit.ox * d.w * sx, y: fit.oy * d.h * sy }
    if (L.simple) {
      // pantalone intero dalla vita alle caviglie, appena adattato in altezza
      const ankleY = mid(sk.ankleL, sk.ankleR).y
      const syAll = clamp((ankleY * 1.0 + thigh * 0.08 - waistY) / d.h, sx * 0.77, sx * 1.3)
      pieces.push({ m: [sx, 0, 0, syAll, waistX - b.waist.cx * sx, waistY], rect: [0, 0, d.w, d.h] })
      shift = { x: fit.ox * d.w * sx, y: fit.oy * d.h * syAll }
    } else pieces.push({ m: pelvis, rect: [0, 0, d.w, b.crotchY + 4] })

    if (!L.simple) b.legs.forEach((leg, i) => {
      const knee = i === 0 ? sk.kneeL : sk.kneeR
      const ankle0 = i === 0 ? sk.ankleL : sk.ankleR
      const S = apply(pelvis, leg.top)
      // l'orlo copre la caviglia, come un pantalone vero sopra la scarpa
      const ankle = add(ankle0, mul(norm(sub(ankle0, knee)), len(sub(ankle0, knee)) * 0.05))
      const K = mid(leg.top, leg.bottom)
      const rect: Piece['rect'] = [leg.from, b.crotchY - 2, leg.to - leg.from, d.h - b.crotchY + 2]
      const a1 = norm(sub(K, leg.top))
      const l1 = len(sub(K, leg.top)) || 1
      pieces.push({
        m: axisMatrix(leg.top, a1, S, norm(sub(knee, S)), len(sub(knee, S)) / l1, sx),
        rect,
        band: { p: leg.top, a: a1, t0: -d.h, t1: l1 + 2 },
      })
      const a2 = norm(sub(leg.bottom, K))
      const l2 = len(sub(leg.bottom, K)) || 1
      pieces.push({
        m: axisMatrix(K, a2, knee, norm(sub(ankle, knee)), len(sub(ankle, knee)) / l2, sx),
        rect,
        band: { p: K, a: a2, t0: -2, t1: d.h },
      })
    })
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

  // le maniche si disegnano su una tela a parte e poi sopra il busto con un'ombra leggera
  let sleeveCtx: CanvasRenderingContext2D | null = null
  if (ctx && pieces.some((p) => p.sleeve)) {
    const off = document.createElement('canvas')
    off.width = ctx.canvas.width
    off.height = ctx.canvas.height
    sleeveCtx = off.getContext('2d')
    sleeveCtx?.setTransform(ctx.getTransform())
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
    const target = pc.sleeve && sleeveCtx ? sleeveCtx : ctx
    if (target) {
      const ctx = target
      ctx.save()
      ctx.translate(shift.x, shift.y)
      ctx.transform(...pc.m)
      ctx.beginPath()
      ctx.rect(rx, ry, rw, rh)
      ctx.clip()
      if (pc.band) {
        const { p, a, t0, t1 } = pc.band
        const B = d.w + d.h
        const ap = perp(a)
        const corner = (t: number, u: number) => add(add(p, mul(a, t)), mul(ap, u))
        const pts = [corner(t0, -B), corner(t1, -B), corner(t1, B), corner(t0, B)]
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y)
        ctx.closePath()
        ctx.clip()
      }
      ctx.drawImage(d.canvas, 0, 0)
      ctx.restore()
    }
  }
  if (ctx && sleeveCtx) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.shadowColor = 'rgba(11, 31, 68, 0.35)'
    ctx.shadowBlur = 5
    ctx.drawImage(sleeveCtx.canvas, 0, 0)
    ctx.restore()
  }
  return { left: x0 + shift.x, top: y0 + shift.y, width: x1 - x0, height: y1 - y0 }
}
