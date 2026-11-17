import type { Garment } from '@/lib/garments'
import type { Anchors } from '@/lib/mannequin'
import type { Dressed } from '@/lib/image/dress'
import type { StageZone } from './state'

export type Box = { left: number; top: number; width: number; height: number }

/**
 * Quanto il busto del capo (senza maniche) è più largo delle spalle: una t-shirt aderisce,
 * felpe e giacche stanno sopra altri strati e sono più ampie.
 */
const EASE: Record<string, number> = {
  canotte: 0.95,
  maglie: 1.06,
  camicie: 1.08,
  felpe_maglioni: 1.16,
  giacche_cappotti: 1.24,
}

type Fit = Pick<Garment, 'category' | 'fit_scale' | 'fit_offset_x' | 'fit_offset_y'>

/**
 * Dove cade l'orlo, in frazione del tratto fianchi → caviglie sotto i fianchi. Le foto stese
 * allungano il capo rispetto al corpo: se l'orlo scende oltre, accorcio il capo in altezza.
 */
const HEM: Record<string, number> = {
  canotte: 0.08,
  maglie: 0.12,
  camicie: 0.16,
  felpe_maglioni: 0.12,
  giacche_cappotti: 0.2,
}

/** Riga (px dell'avatar) dove una maglia infilata sparisce nei pantaloni. */
export const tuckLine = (a: Anchors, h: number) => (a.waist.y + (a.hips.y - a.waist.y) * 0.35) * h

/**
 * Riquadro (px, rispetto all'avatar w×h) di un capo già "vestito" (SPEC 2.3):
 * - busto: le spalle del capo sulle spalle dell'avatar, busto largo come le spalle × agio;
 * - gambe: vita del capo larga come i fianchi, dalla vita alle caviglie;
 * - scarpe: ai piedi.
 * Poi la vestibilità salvata sul capo (scala e spostamento).
 */
export function placeGarment(g: Fit, zone: StageZone, dressed: Dressed, a: Anchors, hipWidth: number, w: number, h: number): Box {
  const px = (p: { x: number; y: number }) => ({ x: p.x * w, y: p.y * h })
  const sl = px(a.shoulder_l)
  const sr = px(a.shoulder_r)
  const waist = px(a.waist)
  const al = px(a.ankle_l)
  const ar = px(a.ankle_r)
  const fit = Number(g.fit_scale) || 1
  const shoulders = Math.hypot(sr.x - sl.x, sr.y - sl.y)

  let box: Box
  if (zone === 'busto' && dressed.shoulderL && dressed.shoulderR) {
    const gl = dressed.shoulderL
    const gr = dressed.shoulderR
    const s = (shoulders * (EASE[g.category] ?? 1.08) * fit) / Math.max(1, gr.x - gl.x)
    const gx = (gl.x + gr.x) / 2
    const gy = (gl.y + gr.y) / 2
    const ax = (sl.x + sr.x) / 2
    const ay = (sl.y + sr.y) / 2 - shoulders * 0.03 // la cucitura sta appena sopra il punto della spalla
    // lunghezza: orlo atteso poco sotto i fianchi (la vestibilità salvata la scala insieme al resto)
    const hips = a.hips.y * h
    const ankle = ((a.ankle_l.y + a.ankle_r.y) / 2) * h
    const hem = hips + (ankle - hips) * (HEM[g.category] ?? 0.12) * fit
    const natural = ay + ((dressed.torso?.bottom ?? dressed.h) - gy) * s
    const sy = natural > hem ? Math.max(0.7, (hem - ay) / (natural - ay)) : 1
    box = { left: ax - gx * s, top: ay - gy * s * sy, width: dressed.w * s, height: dressed.h * s * sy }
  } else if (zone === 'gambe' && dressed.waist) {
    const hips = (hipWidth > 0 ? hipWidth * w : shoulders * 0.95) * 1.06 * fit
    const sx = hips / dressed.waist.width
    const ankleY = (al.y + ar.y) / 2
    let sy = ((ankleY - waist.y) * 1.04 * fit) / dressed.h
    // un po' di adattamento in altezza è credibile, troppo deforma il capo
    sy = Math.min(sx * 1.3, Math.max(sx * 0.77, sy))
    box = { left: waist.x - dressed.waist.cx * sx, top: waist.y - dressed.h * sy * 0.01, width: dressed.w * sx, height: dressed.h * sy }
  } else {
    const spread = Math.max(Math.abs(ar.x - al.x), w * 0.08)
    const width = spread * 2.3 * fit
    const height = (width / dressed.w) * dressed.h
    box = { left: (al.x + ar.x) / 2 - width / 2, top: (al.y + ar.y) / 2 - height * 0.3, width, height }
  }

  return {
    ...box,
    left: box.left + (Number(g.fit_offset_x) || 0) * box.width,
    top: box.top + (Number(g.fit_offset_y) || 0) * box.height,
  }
}
