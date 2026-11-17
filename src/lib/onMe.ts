import { ctx2d, makeCanvas } from './image/canvas'
import { keepMainParts } from './image/components'
import { callTryOn, flatten } from './tryon'

/**
 * "Su di me" (SPEC 2.2): per ogni capo una foto di te che lo indossi, generata una volta sola con il
 * try-on di Hugging Face. Il modello lascia identico tutto ciò che non è il capo, quindi dal confronto
 * con la foto inviata si ritaglia il capo (con le braccia ridisegnate) come livello trasparente.
 * Nel camerino i livelli dei capi scelti si sovrappongono alla tua foto: lo swipe resta istantaneo.
 *
 * Il livello copre la foto del corpo allargata di ON_ME_PAD × lato lungo su ogni lato (lo stesso
 * margine aggiunto prima di inviarla), così maniche e pantaloni larghi non vengono tagliati.
 */
export const ON_ME_PAD = 0.06

const BACKGROUND = '#f3f1ec'
const BG_RGB = [0xf3, 0xf1, 0xec]
/** differenza di colore (0..441) oltre cui un pixel è cambiato */
const THRESHOLD = 28

export type OnMeCategory = 'tops' | 'bottoms'

/** Foto del corpo su fondo pieno con il margine, come la riceve il modello. */
async function flattenBody(src: string): Promise<HTMLCanvasElement> {
  const blob = await (await fetch(src)).blob()
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k)
  const h = Math.round(bmp.height * k)
  const pad = Math.round(Math.max(w, h) * ON_ME_PAD)
  const c = makeCanvas(w + pad * 2, h + pad * 2)
  const ctx = ctx2d(c)
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, pad, pad, w, h)
  bmp.close()
  return c
}

/** Somma su una finestra (2r+1) in orizzontale e in verticale: media locale senza librerie. */
function boxFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    let acc = 0
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / ((2 * r + 1) * (2 * r + 1))
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

/** Dilatazione (max) o erosione (min) quadrata di raggio r su una maschera 0/1. */
function morph(m: Uint8Array, w: number, h: number, r: number, dilate: boolean): Uint8Array {
  const avg = boxFilter(Float32Array.from(m), w, h, r)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = dilate ? (avg[i] > 0.001 ? 1 : 0) : avg[i] > 0.999 ? 1 : 0
  return out
}

/** Riempie i buchi chiusi della maschera (zone del capo uguali per caso alla foto originale). */
function fillHoles(m: Uint8Array, w: number, h: number) {
  const outside = new Uint8Array(w * h)
  const stack: number[] = []
  const seed = (i: number) => {
    if (!m[i] && !outside[i]) {
      outside[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    seed(x)
    seed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    seed(y * w)
    seed(y * w + w - 1)
  }
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    if (x > 0) seed(p - 1)
    if (x < w - 1) seed(p + 1)
    if (p >= w) seed(p - w)
    if (p < w * (h - 1)) seed(p + w)
  }
  for (let i = 0; i < w * h; i++) if (!outside[i]) m[i] = 1
}

/** Livello trasparente con i soli pixel cambiati tra la foto inviata e quella generata. */
export function extractLayer(
  base: HTMLCanvasElement,
  render: ImageBitmap | HTMLCanvasElement,
  /** colore del fondo inviato: dove il modello ha ridisegnato solo fondo, il livello resta trasparente */
  background: number[] | null = BG_RGB,
): HTMLCanvasElement {
  const w = render.width
  const h = render.height
  const layer = makeCanvas(w, h)
  const lctx = ctx2d(layer)
  lctx.drawImage(render, 0, 0)
  const ref = makeCanvas(w, h)
  const rctx = ctx2d(ref)
  rctx.imageSmoothingQuality = 'high'
  rctx.drawImage(base, 0, 0, w, h)

  const img = lctx.getImageData(0, 0, w, h)
  const a = img.data
  const b = rctx.getImageData(0, 0, w, h).data
  const diff = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const dr = a[i * 4] - b[i * 4]
    const dg = a[i * 4 + 1] - b[i * 4 + 1]
    const db = a[i * 4 + 2] - b[i * 4 + 2]
    diff[i] = Math.sqrt(dr * dr + dg * dg + db * db)
  }
  // media su una piccola finestra: il rumore della compressione non conta, le zone cambiate sì
  const smooth = boxFilter(diff, w, h, 2)
  let mask: Uint8Array = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) mask[i] = smooth[i] > THRESHOLD ? 1 : 0
  const r = Math.max(2, Math.round(Math.max(w, h) * 0.005))
  mask = morph(morph(mask, w, h, r, true), w, h, r, false) // chiude le crepe
  fillHoles(mask, w, h)
  mask = morph(mask, w, h, 1, false) // via il filo chiaro di sfondo lungo i bordi

  for (let i = 0; i < w * h; i++) {
    let on = mask[i] === 1
    if (on && background) {
      const dr = a[i * 4] - background[0]
      const dg = a[i * 4 + 1] - background[1]
      const db = a[i * 4 + 2] - background[2]
      on = dr * dr + dg * dg + db * db > 14 * 14
    }
    a[i * 4 + 3] = on ? 255 : 0
  }
  lctx.putImageData(img, 0, 0)
  // via i puntini isolati: restano il capo e le braccia
  keepMainParts(layer, 0.03, 100)

  // bordo morbido di un paio di pixel
  const after = lctx.getImageData(0, 0, w, h)
  const alpha = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) alpha[i] = after.data[i * 4 + 3]
  const soft = boxFilter(alpha, w, h, 1)
  for (let i = 0; i < w * h; i++) after.data[i * 4 + 3] = Math.min(after.data[i * 4 + 3], Math.round(soft[i] * 1.3))
  lctx.putImageData(after, 0, 0)
  return layer
}

/** Genera il livello "su di me" di un capo: una chiamata al try-on (fino a un paio di minuti). */
export async function makeOnMeLayer(
  bodyUrl: string,
  garmentUrl: string,
  category: OnMeCategory,
): Promise<{ layer: HTMLCanvasElement; model: string }> {
  const base = await flattenBody(bodyUrl)
  const garment = await flatten(garmentUrl, '#ffffff', 768)
  const out = await callTryOn(base.toDataURL('image/jpeg', 0.92), garment, category).catch((e: unknown) => {
    // i messaggi della funzione tryon sono già per l'utente (quota finita, servizio occupato…)
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { userFacing: true })
  })
  const bmp = await createImageBitmap(out.blob)
  try {
    return { layer: extractLayer(base, bmp), model: out.model }
  } finally {
    bmp.close()
  }
}
