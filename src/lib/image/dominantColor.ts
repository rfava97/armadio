import { ctx2d, drawScaled } from './canvas'

/**
 * Colore dominante con k-means sui pixel non trasparenti (nessuna libreria).
 * Restituisce il centro del cluster più numeroso.
 */
export function dominantColor(src: HTMLCanvasElement, k = 4, iterations = 12): [number, number, number] | null {
  const c = drawScaled(src, 96)
  const data = ctx2d(c).getImageData(0, 0, c.width, c.height).data
  const px: [number, number, number][] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]])
  }
  if (px.length === 0) return null

  // inizializzazione deterministica: k pixel equidistanti
  let centers = Array.from({ length: Math.min(k, px.length) }, (_, i) => [
    ...px[Math.floor((i * px.length) / Math.min(k, px.length))],
  ]) as [number, number, number][]
  const assign = new Uint8Array(px.length)

  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0])
    px.forEach((p, i) => {
      let best = 0
      let bestD = Infinity
      centers.forEach((cn, j) => {
        const d = (p[0] - cn[0]) ** 2 + (p[1] - cn[1]) ** 2 + (p[2] - cn[2]) ** 2
        if (d < bestD) {
          bestD = d
          best = j
        }
      })
      assign[i] = best
      const s = sums[best]
      s[0] += p[0]
      s[1] += p[1]
      s[2] += p[2]
      s[3]++
    })
    centers = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[j])) as [
      number,
      number,
      number,
    ][]
  }

  const counts = new Array(centers.length).fill(0)
  assign.forEach((a) => counts[a]++)
  const top = counts.indexOf(Math.max(...counts))
  return centers[top].map(Math.round) as [number, number, number]
}
