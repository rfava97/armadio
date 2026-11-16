import { ctx2d, makeCanvas } from './canvas'

/** Rettangolo di ritaglio manuale in coordinate normalizzate 0..1. */
export type CropRect = { x: number; y: number; w: number; h: number }
export const DEFAULT_CROP: CropRect = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }

/** Applica il ritaglio manuale scelto dall'utente. */
export function applyCrop(src: HTMLCanvasElement, r: CropRect): HTMLCanvasElement {
  const sx = Math.round(r.x * src.width)
  const sy = Math.round(r.y * src.height)
  const sw = Math.max(1, Math.round(r.w * src.width))
  const sh = Math.max(1, Math.round(r.h * src.height))
  const out = makeCanvas(sw, sh)
  ctx2d(out).drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh)
  return out
}

/**
 * Ritaglia al riquadro del capo + padding 4% (SPEC 1.2), così tutti i capi riempiono
 * la card allo stesso modo. Conta solo i pixel ben opachi e ignora righe/colonne con
 * pochissimi pixel: aloni, ombre e puntini lasciati dalla scontornatura non allargano il riquadro.
 */
export function cropToSubject(src: HTMLCanvasElement, padding = 0.04): HTMLCanvasElement {
  const { width: w, height: h } = src
  const data = ctx2d(src).getImageData(0, 0, w, h).data
  const rows = new Uint32Array(h)
  const cols = new Uint32Array(w)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        rows[y]++
        cols[x]++
      }
    }
  }
  const rowMin = Math.max(2, Math.round(w * 0.01))
  const colMin = Math.max(2, Math.round(h * 0.01))
  let minY = rows.findIndex((c) => c >= rowMin)
  let maxY = h - 1 - [...rows].reverse().findIndex((c) => c >= rowMin)
  let minX = cols.findIndex((c) => c >= colMin)
  let maxX = w - 1 - [...cols].reverse().findIndex((c) => c >= colMin)
  if (minY < 0 || minX < 0 || maxY < minY || maxX < minX) {
    // soggetto troppo sottile o assente: ripiego su qualunque pixel visibile
    minX = w
    minY = h
    maxX = -1
    maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 16) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return src // tutto trasparente
  }

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const pad = Math.round(Math.max(bw, bh) * padding)
  // copio anche il margine: dettagli sottili (punte delle maniche, lacci) appena fuori
  // dal riquadro restano visibili, i puntini lontani no
  const out = makeCanvas(bw + pad * 2, bh + pad * 2)
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const ex = Math.min(w, maxX + 1 + pad)
  const ey = Math.min(h, maxY + 1 + pad)
  ctx2d(out).drawImage(src, sx, sy, ex - sx, ey - sy, sx - (minX - pad), sy - (minY - pad), ex - sx, ey - sy)
  return out
}
