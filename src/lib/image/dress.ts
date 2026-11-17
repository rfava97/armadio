import { ctx2d, makeCanvas } from './canvas'
import { keepMainParts } from './components'
import type { Category } from '@/lib/garments'

export type P = { x: number; y: number }

/** Un capo analizzato: immagine pulita + i pezzi da adattare al corpo (px dell'immagine). */
export type Dressed = {
  canvas: HTMLCanvasElement
  url: string
  w: number
  h: number
  kind: 'top' | 'bottom' | 'shoes'
  top?: {
    /** attaccatura delle maniche (o bordi del busto) */
    shoulderL: P
    shoulderR: P
  }
  bottom?: {
    waist: { cx: number; width: number }
  }
}

const TOPS: Category[] = ['maglie', 'camicie', 'canotte', 'felpe_maglioni', 'giacche_cappotti']
const BOTTOMS: Category[] = ['pantaloni', 'jeans']

const cache = new Map<string, Promise<Dressed>>()

/** Analizza il capo una volta sola per immagine (cache in memoria). */
export function dressGarment(key: string, src: string, category: Category): Promise<Dressed> {
  let p = cache.get(key)
  if (!p) {
    p = build(src, category)
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return p
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // serve per leggere i pixel (lo storage risponde con CORS aperto)
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Immagine del capo non caricata'))
    img.src = src
  })
}

const toUrl = (c: HTMLCanvasElement) =>
  new Promise<string>((resolve) => c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : c.toDataURL()), 'image/png'))

/** Ritaglia al contenuto. */
function trim(c: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = c
  const d = ctx2d(c).getImageData(0, 0, w, h).data
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 100) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return c
  const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1)
  ctx2d(out).drawImage(c, -x0, -y0)
  return out
}

async function build(src: string, category: Category): Promise<Dressed> {
  const img = await loadImage(src)
  const base = makeCanvas(img.naturalWidth, img.naturalHeight)
  ctx2d(base).drawImage(img, 0, 0)
  keepMainParts(base, BOTTOMS.includes(category) ? 0.1 : 0.15)
  const canvas = trim(base)
  const w = canvas.width
  const h = canvas.height
  const d = ctx2d(canvas).getImageData(0, 0, w, h).data
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 100
  const out: Dressed = { canvas, url: await toUrl(canvas), w, h, kind: 'shoes' }

  if (TOPS.includes(category)) {
    out.kind = 'top'
    out.top = analyzeTop(w, h, opaque)
  } else if (BOTTOMS.includes(category)) {
    out.kind = 'bottom'
    out.bottom = analyzeBottom(w, h, opaque)
  }
  return out
}

/**
 * Maglie e giacche stese: il busto sono le colonne alte quasi quanto il capo, ai lati ci sono le
 * maniche. Le spalle sono gli angoli in alto del busto.
 */
function analyzeTop(w: number, h: number, opaque: (x: number, y: number) => boolean): NonNullable<Dressed['top']> {
  const colCount = new Uint32Array(w)
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (opaque(x, y)) colCount[x]++
  const topAt = (x: number) => {
    for (let y = 0; y < h; y++) if (opaque(x, y)) return y
    return 0
  }

  const cx = Math.round(w / 2)
  let tl = cx
  let tr = cx
  while (tl > 0 && colCount[tl - 1] >= h * 0.55) tl--
  while (tr < w - 1 && colCount[tr + 1] >= h * 0.55) tr++

  const torsoW = tr - tl
  if (torsoW < w * 0.25 || torsoW > w * 0.85) {
    // canotta o forma non riconosciuta: spalle a una distanza tipica
    tl = Math.round(w * 0.2)
    tr = Math.round(w * 0.8)
    return { shoulderL: { x: tl, y: topAt(tl) }, shoulderR: { x: tr, y: topAt(tr) } }
  }
  return {
    shoulderL: { x: tl, y: topAt(tl) + h * 0.03 },
    shoulderR: { x: tr, y: topAt(tr) + h * 0.03 },
  }
}

/** Pantaloni: vita (bordo superiore). */
function analyzeBottom(w: number, h: number, opaque: (x: number, y: number) => boolean): NonNullable<Dressed['bottom']> {
  const span = (y: number, from = 0, to = w): [number, number] | null => {
    let l = -1
    let r = -1
    for (let x = from; x < to; x++) {
      if (opaque(x, y)) {
        if (l < 0) l = x
        r = x
      }
    }
    return l < 0 ? null : [l, r]
  }

  // vita: mediana dei bordi nelle prime righe
  const rows = Math.max(2, Math.round(h * 0.04))
  const ls: number[] = []
  const rs: number[] = []
  for (let y = 0; y < rows; y++) {
    const s = span(y)
    if (s) {
      ls.push(s[0])
      rs.push(s[1])
    }
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
  const wl = median(ls)
  const wr = ls.length ? median(rs) : w - 1
  const cx = Math.round((wl + wr) / 2)

  return { waist: { cx, width: Math.max(1, wr - wl) } }
}
