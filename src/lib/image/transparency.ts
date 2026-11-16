import { ctx2d, drawScaled } from './canvas'

/**
 * true se l'immagine è già scontornata: più del 5% dei pixel della cornice esterna
 * (2% del lato) è trasparente (SPEC 1.2).
 */
export function hasTransparentBorder(src: HTMLCanvasElement | ImageBitmap): boolean {
  const c = drawScaled(src, 400)
  const { width: w, height: h } = c
  const data = ctx2d(c).getImageData(0, 0, w, h).data
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.02))
  let total = 0
  let transparent = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= band && x < w - band && y >= band && y < h - band) continue
      total++
      if (data[(y * w + x) * 4 + 3] < 250) transparent++
    }
  }
  return total > 0 && transparent / total > 0.05
}
