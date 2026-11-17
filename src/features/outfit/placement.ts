import type { Garment } from '@/lib/garments'
import type { Anchors } from '@/lib/mannequin'
import type { StageZone } from './state'

export type Box = { left: number; top: number; width: number; height: number }

/**
 * Larghezza del capo rispetto alla distanza tra le spalle. Le foto dei capi sono stese, con le
 * maniche aperte: una maglia è ~1.75 volte le spalle, una canotta (senza maniche) poco più.
 */
const BUST_WIDTH: Record<string, number> = {
  canotte: 1.2,
  maglie: 1.75,
  camicie: 1.75,
  felpe_maglioni: 1.8,
  giacche_cappotti: 1.85,
}

/**
 * Riquadro (in px, rispetto all'avatar) di un capo, dato l'avatar w×h e i suoi ancoraggi (SPEC 2.3):
 * busto collo → spalle, gambe vita → caviglie, scarpe ai piedi. Poi la vestibilità del capo.
 */
export function placeGarment(
  g: Pick<Garment, 'category' | 'fit_scale' | 'fit_offset_x' | 'fit_offset_y'>,
  zone: StageZone,
  aspect: number,
  a: Anchors,
  w: number,
  h: number,
): Box {
  const px = (p: { x: number; y: number }) => ({ x: p.x * w, y: p.y * h })
  const neck = px(a.neck)
  const sl = px(a.shoulder_l)
  const sr = px(a.shoulder_r)
  const waist = px(a.waist)
  const al = px(a.ankle_l)
  const ar = px(a.ankle_r)
  const fit = Number(g.fit_scale) || 1

  let width: number
  let height: number
  let cx: number
  let top: number

  if (zone === 'busto') {
    const shoulders = Math.hypot(sr.x - sl.x, sr.y - sl.y)
    width = shoulders * (BUST_WIDTH[g.category] ?? 1.75) * fit
    height = width / aspect
    cx = (sl.x + sr.x) / 2
    // il colletto sta appena sopra la base del collo
    top = neck.y - height * 0.05
  } else if (zone === 'gambe') {
    const ankleY = (al.y + ar.y) / 2
    height = (ankleY - waist.y) * 1.06 * fit
    width = height * aspect
    cx = waist.x
    top = waist.y - height * 0.02
  } else {
    const spread = Math.max(Math.abs(ar.x - al.x), w * 0.08)
    width = spread * 2.4 * fit
    height = width / aspect
    cx = (al.x + ar.x) / 2
    top = (al.y + ar.y) / 2 - height * 0.3
  }

  const ox = (Number(g.fit_offset_x) || 0) * width
  const oy = (Number(g.fit_offset_y) || 0) * height
  return { left: cx - width / 2 + ox, top: top + oy, width, height }
}
