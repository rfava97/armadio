/**
 * "Stessa massa" nella griglia: ogni capo deve occupare circa la stessa superficie
 * della card. Un capo largo (giacca con maniche aperte) riempie già la larghezza e non
 * può crescere; quelli compatti (t-shirt) vengono rimpiccioliti fino alla stessa superficie.
 */
const TARGET = 0.21 // frazione dell'area interna della card coperta dal capo
const BOX_W = 4 // area interna della card: proporzione 4:5
const BOX_H = 5

const cache = new Map<string, number>()

export const cachedMassScale = (key: string) => cache.get(key)

/** Fattore 0..1 da applicare all'immagine adattata alla card. 1 se non misurabile. */
export function massScale(key: string, img: HTMLImageElement): number {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let k = 1
  try {
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (w > 0 && h > 0) {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, w, h).data
      let opaque = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opaque++
      const fill = opaque / (w * h)
      if (fill > 0) {
        const contain = Math.min(BOX_W / w, BOX_H / h)
        const covered = (fill * w * h * contain * contain) / (BOX_W * BOX_H)
        k = Math.min(1, Math.sqrt(TARGET / covered))
      }
    }
  } catch {
    k = 1 // immagine non leggibile (CORS): resta com'è
  }
  cache.set(key, k)
  return k
}
