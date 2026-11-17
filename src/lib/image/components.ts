import { ctx2d } from './canvas'

/**
 * Tiene solo le parti principali di un'immagine scontornata: la più grande e quelle almeno
 * `minFraction` di lei (es. la seconda scarpa). Puntini e aloni staccati diventano trasparenti.
 * Modifica il canvas e lo restituisce.
 */
export function keepMainParts(canvas: HTMLCanvasElement, minFraction = 0.1, alphaMin = 100): HTMLCanvasElement {
  const { width: w, height: h } = canvas
  const ctx = ctx2d(canvas)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const label = new Int32Array(w * h) // 0 = non visitato / trasparente
  const sizes: number[] = [0]
  const stack = new Int32Array(w * h)

  for (let start = 0; start < w * h; start++) {
    if (label[start] || d[start * 4 + 3] <= alphaMin) continue
    const id = sizes.length
    let top = 0
    let size = 0
    stack[top++] = start
    label[start] = id
    while (top > 0) {
      const p = stack[--top]
      size++
      const x = p % w
      const y = (p - x) / w
      // 4 vicini
      if (x > 0) push(p - 1)
      if (x < w - 1) push(p + 1)
      if (y > 0) push(p - w)
      if (y < h - 1) push(p + w)
    }
    sizes.push(size)

    function push(q: number) {
      if (!label[q] && d[q * 4 + 3] > alphaMin) {
        label[q] = id
        stack[top++] = q
      }
    }
  }

  const largest = Math.max(0, ...sizes)
  if (largest === 0) return canvas
  const keep = sizes.map((s) => s >= largest * minFraction)
  for (let p = 0; p < w * h; p++) {
    // i pixel semitrasparenti (bordi morbidi) seguono il pezzo a cui sono attaccati: se non hanno
    // etichetta li tengo solo se un vicino diretto è tenuto
    const l = label[p]
    if (l ? keep[l] : nearKept(p)) continue
    d[p * 4 + 3] = 0
  }
  ctx.putImageData(img, 0, 0)
  return canvas

  function nearKept(p: number) {
    if (d[p * 4 + 3] === 0) return true
    const x = p % w
    const n = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]
    return n.some((q) => q >= 0 && q < w * h && label[q] > 0 && keep[label[q]])
  }
}
