import { useEffect, useState } from 'react'
import { ctx2d, makeCanvas } from './canvas'

/**
 * Forma di una maglia/felpa/giacca stesa, letta dalla sua foto scontornata (frazioni dell'immagine):
 * il busto sono le colonne alte quasi quanto il capo, ai lati ci sono le maniche; le spalle sono la
 * riga più alta del busto (sotto un eventuale cappuccio, che è più stretto).
 * Serve al tavolo per mettere i capi in proporzione sul petto e allineare gli strati alle spalle.
 */
export type TopShape = { torsoL: number; torsoR: number; shoulderY: number; aspect: number }

const cache = new Map<string, Promise<TopShape | null>>()

async function analyze(url: string): Promise<TopShape | null> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const k = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * k))
  const h = Math.max(1, Math.round(img.naturalHeight * k))
  const c = makeCanvas(w, h)
  ctx2d(c).drawImage(img, 0, 0, w, h)
  const d = ctx2d(c).getImageData(0, 0, w, h).data
  const on = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 100

  // riquadro del capo (le foto sono già ritagliate, ma per sicurezza)
  let top = h
  let bottom = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y) }
  const H = bottom - top + 1
  if (H < 10) return null

  // busto: colonne piene per più del 55% dell'altezza, cresciute dal centro
  const col = new Uint16Array(w)
  for (let x = 0; x < w; x++) for (let y = top; y <= bottom; y++) if (on(x, y)) col[x]++
  let cx = Math.round(w / 2)
  // il centro potrebbe cadere in un buco (giacca aperta): cerco la colonna piena più vicina
  for (let r = 0; r < w / 4 && col[cx] < H * 0.55; r++) {
    if (col[cx + r] >= H * 0.55) cx += r
    else if (col[cx - r] >= H * 0.55) cx -= r
  }
  let l = cx
  let rr = cx
  const full = (x: number) => col[x] >= H * 0.55
  const grow = () => {
    while (l > 0 && full(l - 1)) l--
    while (rr < w - 1 && full(rr + 1)) rr++
  }
  grow()
  // giacca aperta: oltre un varco stretto c'è l'altro lato del busto
  const gap = Math.round(w * 0.12)
  for (let x = rr + 1; x <= Math.min(w - 1, rr + gap); x++) if (full(x)) { rr = x; grow(); break }
  for (let x = l - 1; x >= Math.max(0, l - gap); x--) if (full(x)) { l = x; grow(); break }
  const torso = rr - l
  if (torso < w * 0.2 || torso > w * 0.9) return null

  // spalle: prima riga piena agli angoli del busto (più in basso del cappuccio)
  const firstAt = (x: number) => {
    for (let y = top; y <= bottom; y++) if (on(x, y)) return y
    return top
  }
  const inset = Math.max(1, Math.round(torso * 0.12))
  const shoulderY = Math.max(firstAt(l + inset), firstAt(rr - inset))
  return { torsoL: l / w, torsoR: (rr + 1) / w, shoulderY: shoulderY / h, aspect: img.naturalWidth / img.naturalHeight }
}

/** Forma del capo (null finché non è pronta o se non si riconosce). */
export function useTopShapes(items: { id: string; url: string | null }[]) {
  const [shapes, setShapes] = useState<Record<string, TopShape | null>>({})
  const key = items.map((i) => `${i.id}:${i.url ? 1 : 0}`).join(',')
  useEffect(() => {
    let cancelled = false
    for (const it of items) {
      if (!it.url || it.id in shapes) continue
      let p = cache.get(it.id)
      if (!p) {
        p = analyze(it.url).catch(() => null)
        cache.set(it.id, p)
      }
      void p.then((s) => !cancelled && setShapes((m) => (it.id in m ? m : { ...m, [it.id]: s })))
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dipende solo dall'elenco dei capi
  }, [key])
  return shapes
}
