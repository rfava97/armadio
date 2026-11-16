import { ctx2d, makeCanvas } from './canvas'

/** Ritaglia al riquadro dei pixel non trasparenti + padding 4% (SPEC 1.2). */
export function cropToSubject(src: HTMLCanvasElement, padding = 0.04, alphaThreshold = 16): HTMLCanvasElement {
  const { width: w, height: h } = src
  const data = ctx2d(src).getImageData(0, 0, w, h).data
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return src // tutto trasparente: lascio com'è

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * padding)
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const out = makeCanvas(bw + pad * 2, bh + pad * 2)
  ctx2d(out).drawImage(src, minX, minY, bw, bh, pad, pad, bw, bh)
  return out
}
