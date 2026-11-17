import { ctx2d, makeCanvas } from './canvas'
import { keepMainParts } from './components'
import type { Category } from '@/lib/garments'

type P = { x: number; y: number }

/** Un capo pronto da indossare: immagine rielaborata + i suoi punti di riferimento (px dell'immagine). */
export type Dressed = {
  url: string
  w: number
  h: number
  kind: 'top' | 'bottom' | 'shoes'
  /** top: spalle del capo (attaccatura delle maniche) */
  shoulderL?: P
  shoulderR?: P
  /** bottom: vita (bordo superiore) */
  waist?: { y: number; cx: number; width: number }
}

const TOPS: Category[] = ['maglie', 'camicie', 'canotte', 'felpe_maglioni', 'giacche_cappotti']
const BOTTOMS: Category[] = ['pantaloni', 'jeans']

// direzione verso cui deve "cadere" la manica: quasi verticale, un po' aperta (come le braccia)
const ARM_OPEN = 0.2

const cache = new Map<string, Promise<Dressed>>()

/** Rielabora il capo una volta sola per immagine (cache in memoria). */
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

type Bbox = { x0: number; y0: number; x1: number; y1: number }

function bboxOf(a: Uint8ClampedArray, w: number, h: number): Bbox | null {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[(y * w + x) * 4 + 3] > 100) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

/** Ritaglia al contenuto e restituisce lo spostamento applicato. */
function trim(c: HTMLCanvasElement): { canvas: HTMLCanvasElement; dx: number; dy: number } {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data
  const b = bboxOf(d, c.width, c.height)
  if (!b) return { canvas: c, dx: 0, dy: 0 }
  const out = makeCanvas(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1)
  ctx2d(out).drawImage(c, -b.x0, -b.y0)
  return { canvas: out, dx: -b.x0, dy: -b.y0 }
}

async function build(src: string, category: Category): Promise<Dressed> {
  const img = await loadImage(src)
  const base = makeCanvas(img.naturalWidth, img.naturalHeight)
  ctx2d(base).drawImage(img, 0, 0)
  keepMainParts(base, BOTTOMS.includes(category) ? 0.1 : 0.15)
  const { canvas } = trim(base)

  if (TOPS.includes(category)) return dressTop(canvas)
  if (BOTTOMS.includes(category)) {
    const w = canvas.width
    const d = ctx2d(canvas).getImageData(0, 0, w, canvas.height).data
    // larghezza in vita: mediana dei bordi nelle prime righe
    const rows = Math.max(2, Math.round(canvas.height * 0.04))
    const spans: [number, number][] = []
    for (let y = 0; y < rows; y++) {
      let l = -1
      let r = -1
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 100) {
          if (l < 0) l = x
          r = x
        }
      }
      if (l >= 0) spans.push([l, r])
    }
    const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    const l = spans.length ? mid(spans.map((s) => s[0])) : 0
    const r = spans.length ? mid(spans.map((s) => s[1])) : w - 1
    return {
      url: await toUrl(canvas),
      w,
      h: canvas.height,
      kind: 'bottom',
      waist: { y: 0, cx: (l + r) / 2, width: Math.max(1, r - l) },
    }
  }
  return { url: await toUrl(canvas), w: canvas.width, h: canvas.height, kind: 'shoes' }
}

/**
 * Maglie e giacche fotografate stese hanno le maniche aperte. Trovo il busto (colonne alte quasi
 * quanto il capo), considero maniche tutto il resto e le ruoto attorno alla spalla finché cadono
 * lungo il braccio. Il busto viene ridisegnato sopra, così l'attaccatura resta pulita.
 */
async function dressTop(src: HTMLCanvasElement): Promise<Dressed> {
  const w = src.width
  const h = src.height
  const d = ctx2d(src).getImageData(0, 0, w, h).data
  const opaque = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 100

  const colCount = new Uint32Array(w)
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (opaque(x, y)) colCount[x]++

  // busto: colonne contigue attorno al centro con altezza ≥ 55% del capo
  const cx = Math.round(w / 2)
  let tl = cx
  let tr = cx
  while (tl > 0 && colCount[tl - 1] >= h * 0.55) tl--
  while (tr < w - 1 && colCount[tr + 1] >= h * 0.55) tr++

  const topAt = (x: number) => {
    for (let y = 0; y < h; y++) if (opaque(x, y)) return y
    return 0
  }

  const torsoW = tr - tl
  const noSleeves = torsoW < w * 0.25 || torsoW > w * 0.85
  if (noSleeves) {
    // canotta, capo già "indossato" o forma non riconosciuta: lo uso così com'è
    const l = Math.round(w * 0.2)
    const r = Math.round(w * 0.8)
    return {
      url: await toUrl(src),
      w,
      h,
      kind: 'top',
      shoulderL: { x: l, y: topAt(l) },
      shoulderR: { x: r, y: topAt(r) },
    }
  }

  const pivotL: P = { x: tl, y: topAt(tl) + h * 0.02 }
  const pivotR: P = { x: tr, y: topAt(tr) + h * 0.02 }

  // baricentro di ogni manica → angolo attuale
  const centroid = (from: number, to: number) => {
    let sx = 0
    let sy = 0
    let n = 0
    for (let x = from; x < to; x++) {
      for (let y = 0; y < h; y++) {
        if (opaque(x, y)) {
          sx += x
          sy += y
          n++
        }
      }
    }
    return n > w * h * 0.01 ? { x: sx / n, y: sy / n } : null
  }
  const cl = centroid(0, tl)
  const cr = centroid(tr + 1, w)

  const rotation = (pivot: P, c: P | null, side: -1 | 1) => {
    if (!c) return 0
    const current = Math.atan2(c.y - pivot.y, c.x - pivot.x)
    const target = Math.atan2(1, side * ARM_OPEN)
    let r = target - current
    while (r > Math.PI) r -= 2 * Math.PI
    while (r < -Math.PI) r += 2 * Math.PI
    return Math.max(-1.45, Math.min(1.45, r))
  }

  // tela più alta e larga: le maniche ruotate scendono sotto la spalla
  const pad = Math.round(Math.max(w, h) * 0.6)
  const out = makeCanvas(w + pad * 2, h + pad * 2)
  const o = ctx2d(out)

  const sleeve = (pivot: P, from: number, to: number, angle: number) => {
    o.save()
    o.translate(pad + pivot.x, pad + pivot.y)
    o.rotate(angle)
    o.translate(-pivot.x, -pivot.y)
    o.beginPath()
    o.rect(from, 0, to - from, h)
    o.clip()
    o.drawImage(src, 0, 0)
    o.restore()
  }
  // un po' di sovrapposizione col busto: niente fessure all'attaccatura
  const overlap = Math.round(torsoW * 0.06)
  sleeve(pivotL, 0, tl + overlap, rotation(pivotL, cl, -1))
  sleeve(pivotR, tr - overlap, w, rotation(pivotR, cr, 1))
  o.save()
  o.beginPath()
  o.rect(pad + tl, pad, torsoW + 1, h)
  o.clip()
  o.drawImage(src, pad, pad)
  o.restore()

  const { canvas, dx, dy } = trim(out)
  const shift = (p: P): P => ({ x: p.x + pad + dx, y: p.y + pad + dy })
  return {
    url: await toUrl(canvas),
    w: canvas.width,
    h: canvas.height,
    kind: 'top',
    shoulderL: shift(pivotL),
    shoulderR: shift(pivotR),
  }
}
