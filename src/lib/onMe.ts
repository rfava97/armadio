import { ctx2d, makeCanvas, releaseCanvas } from './image/canvas'
import { keepMainParts } from './image/components'
import { callTryOn, flatten } from './tryon'
import type { Anchors } from './mannequin'

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

/** tops/bottoms: con FASHN o Gemini; shoes: solo con Gemini (FASHN non veste le scarpe) */
export type OnMeCategory = 'tops' | 'bottoms' | 'shoes'

/** Foto del corpo su fondo pieno con il margine, come la riceve il modello. */
async function flattenBody(src: string): Promise<{ canvas: HTMLCanvasElement; pad: number; height: number }> {
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
  return { canvas: c, pad, height: h }
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

/**
 * Livello trasparente del capo dalla foto generata. Due regole insieme:
 * - i pixel cambiati rispetto alla foto inviata (il capo, le braccia ridisegnate, l'orlo che scende);
 * - tutta la parte del corpo del capo (sopra la linea vita/fianchi per il busto, sotto per le gambe):
 *   così un capo dello stesso colore di quello che avevi nella foto (felpa bianca su canotta bianca)
 *   non resta bucato. Lì la foto generata è uguale all'originale dove il capo non arriva.
 * Il fondo resta trasparente solo dove era fondo anche nella foto inviata: i capi chiari non spariscono.
 */
export function extractLayer(
  base: HTMLCanvasElement,
  render: ImageBitmap | HTMLCanvasElement,
  opts: {
    /** zona del capo e linea vita/fianchi in frazione dell'altezza dell'immagine */
    region?: { category: OnMeCategory; split: number }
    /** colore del fondo inviato */
    background?: number[] | null
  } = {},
): HTMLCanvasElement {
  const background = opts.background === undefined ? BG_RGB : opts.background
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

  const splitY = opts.region ? Math.round(opts.region.split * h) : -1
  const tops = opts.region?.category === 'tops'
  const isBg = (d: Uint8ClampedArray, i: number) => {
    if (!background) return false
    const dr = d[i * 4] - background[0]
    const dg = d[i * 4 + 1] - background[1]
    const db = d[i * 4 + 2] - background[2]
    return dr * dr + dg * dg + db * db <= 14 * 14
  }
  for (let i = 0; i < w * h; i++) {
    const y = (i / w) | 0
    const inRegion = splitY >= 0 && (tops ? y < splitY : y >= splitY)
    let on = mask[i] === 1 || inRegion
    // fondo vero: fondo sia nella foto generata sia in quella inviata
    if (on && isBg(a, i) && isBg(b, i)) on = false
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
  category: Exclude<OnMeCategory, 'shoes'>,
  /** capo fotografato indossato da qualcuno: il modello ne copia vestibilità e chiusura */
  worn = false,
  /** linea vita/fianchi in frazione dell'altezza della foto del corpo */
  split = 0.5,
): Promise<{ layer: HTMLCanvasElement; model: string }> {
  const flat = await flattenBody(bodyUrl)
  const base = flat.canvas
  const splitFrac = (flat.pad + split * flat.height) / base.height
  const garment = await flatten(garmentUrl, '#ffffff', 768)
  const out = await callTryOn(base.toDataURL('image/jpeg', 0.92), garment, category, worn ? 'model' : 'flat-lay').catch((e: unknown) => {
    // i messaggi della funzione tryon sono già per l'utente (quota finita, servizio occupato…)
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { userFacing: true })
  })
  const bmp = await createImageBitmap(out.blob)
  try {
    return { layer: extractLayer(base, bmp, { region: { category, split: splitFrac } }), model: out.model }
  } finally {
    bmp.close()
  }
}

/**
 * L'immagine "Su di me" come si vede nel camerino: la tua foto e, sopra, i livelli dei capi
 * (pantaloni, poi gli strati del busto dal più interno) su fondo chiaro. Per salvarla nei preferiti.
 */
export async function composeOnMe(
  bodyUrl: string,
  layerUrls: string[],
  topsFrom = layerUrls.length,
  /** riga delle spalle sulla foto (frazione), per i cappucci degli strati sotto */
  shoulderY?: number,
  /** per ogni strato del busto (dal più interno): tenuto dentro i capi sopra */
  inside: boolean[] = [],
): Promise<Blob> {
  const load = async (u: string) => createImageBitmap(await (await fetch(u)).blob())
  const body = await load(bodyUrl)
  const w = body.width
  const h = body.height
  const pad = ON_ME_PAD * Math.max(w, h)
  const c = makeCanvas(w, h)
  const ctx = ctx2d(c)
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(body, 0, 0)
  body.close()
  const tops = layerUrls.slice(topsFrom)
  for (const [n, u] of layerUrls.entries()) {
    const l = await load(u)
    const k = n - topsFrom
    const cover = k >= 0 ? await coverMask(tops.slice(k + 1), !!inside[k]) : null
    if (cover) {
      // lo strato coperto, ritagliato dove esce dai capi sopra
      const t = makeCanvas(l.width, l.height)
      const tctx = ctx2d(t)
      tctx.drawImage(l, 0, 0)
      tctx.globalCompositeOperation = 'destination-in'
      tctx.drawImage(cover, 0, 0, t.width, t.height)
      ctx.drawImage(t, -pad, -pad, w + pad * 2, h + pad * 2)
      releaseCanvas(t)
    } else {
      ctx.drawImage(l, -pad, -pad, w + pad * 2, h + pad * 2)
    }
    l.close()
  }
  // cappucci degli strati sotto, sopra i capi esterni
  if (shoulderY !== undefined) {
    const line = layerRow(shoulderY, w / h)
    for (const u of tops.slice(0, -1)) {
      const hood = await hoodMask(u, line)
      if (!hood) continue
      const l = await load(u)
      const t = makeCanvas(l.width, l.height)
      const tctx = ctx2d(t)
      tctx.drawImage(l, 0, 0)
      l.close()
      tctx.globalCompositeOperation = 'destination-in'
      tctx.drawImage(hood, 0, 0, t.width, t.height)
      releaseCanvas(hood)
      ctx.drawImage(t, -pad, -pad, w + pad * 2, h + pad * 2)
      releaseCanvas(t)
    }
  }
  const blob = await new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Immagine non valida'))), 'image/png'))
  releaseCanvas(c)
  return blob
}

/**
 * Strati del busto "su di me": ogni capo è generato da solo, quindi una felpa sotto una giacca
 * spunta ai lati delle maniche e sulle spalle. Riga per riga, lo strato sotto resta solo tra il punto
 * più a sinistra e quello più a destra dei capi sopra; dove sopra non c'è niente (cappuccio sopra il
 * collo, orlo che esce sotto) resta tutto. Dentro una giacca aperta si vede.
 * Maschera alfa (opaca = visibile), stesso fotogramma dei livelli.
 */
/** maschera per righe, riga più alta (frazione), e per ogni riga il primo e l'ultimo pixel del capo (-1 se vuota) */
type Extent = { mask: HTMLCanvasElement; top: number; rowL: Int16Array; rowR: Int16Array; colBottom: Float32Array }
const extents = new Map<string, Promise<Extent>>()

/** Maschera per righe del capo e riga più alta (frazione), in cache per URL. */
function layerExtent(url: string): Promise<Extent> {
  let p = extents.get(url)
  if (!p) {
    p = (async () => {
      const bmp = await bitmapOf(url, 400)
      const W = bmp.width
      const H = bmp.height
      const c = makeCanvas(W, H)
      const ctx = ctx2d(c)
      ctx.drawImage(bmp, 0, 0)
      bmp.close()
      const d = ctx.getImageData(0, 0, W, H).data
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#000'
      let top = -1
      const rowL = new Int16Array(H).fill(-1)
      const rowR = new Int16Array(H).fill(-1)
      // per riga, i pezzi del capo (ignorando quelli stretti: ganci, lacci, punte)
      const thin = Math.max(2, Math.round(W * 0.03))
      const runs: [number, number][][] = []
      for (let y = 0; y < H; y++) {
        let l = -1
        let r = -1
        const list: [number, number][] = []
        let run = 0
        for (let x = 0; x <= W; x++) {
          if (x < W && d[(y * W + x) * 4 + 3] > 100) {
            run++
            if (l < 0) l = x
            r = x
          } else {
            if (run >= thin) list.push([x - run, x - 1])
            run = 0
          }
        }
        rowL[y] = l
        rowR[y] = r
        if (l >= 0 && top < 0) top = y
        runs.push(list)
      }
      // centro del corpo: la mediana dei centri delle righe
      const mids = runs.filter((l) => l.length).map((l) => (l[0][0] + l[l.length - 1][1]) / 2).sort((p, q) => p - q)
      const cx = mids.length ? mids[mids.length >> 1] : W / 2
      // Dove si vede lo strato sotto, riga per riga:
      // - righe senza il capo (o solo pezzi stretti): tutta la riga (l'orlo che esce sotto);
      // - sotto il capo (rientrando di 2 px: sul bordo non deve trasparire);
      // - nel vuoto che contiene il centro del corpo: l'apertura di una giacca aperta, lo scollo,
      //   tra le maniche sotto l'orlo. Non nei vuoti di lato (ascelle) né oltre le maniche.
      const e = 2
      for (let y = 0; y < H; y++) {
        const list = runs[y]
        if (!list.length) {
          ctx.fillRect(0, y, W, 1)
          continue
        }
        for (const [a0, a1] of list) if (a1 - a0 > 2 * e) ctx.fillRect(a0 + e, y, a1 - a0 + 1 - 2 * e, 1)
        if (list.some(([a0, a1]) => a0 <= cx && cx <= a1)) continue
        const left = list.filter(([, a1]) => a1 < cx).pop()
        const right = list.find(([a0]) => a0 > cx)
        const g0 = left ? left[1] + 1 - e : 0
        const g1 = right ? right[0] - 1 + e : W - 1
        ctx.fillRect(g0, y, g1 - g0 + 1, 1)
      }
      // e per colonne: dove c'è il capo, sotto non si vede niente sopra il suo bordo più alto (le
      // spalle oblique di una giacca lasciano dei vuoti nelle righe, ma non nelle colonne)
      const colTop = new Float32Array(W).fill(-1)
      // orlo per colonne (più basso pixel pieno): per gli strati tenuti "dentro"
      const colBottom = new Float32Array(W).fill(-1)
      for (let x = 0; x < W; x++) {
        for (let y = H - 1; y >= 0; y--) {
          if (d[(y * W + x) * 4 + 3] > 100) {
            colBottom[x] = y
            break
          }
        }
        for (let y = 0; y < H; y++) {
          // anche il bordo sfumato del capo conta: sotto non deve trasparire
          if (d[(y * W + x) * 4 + 3] > 20) {
            colTop[x] = y
            break
          }
        }
      }
      // bordo ammorbidito (un pixel isolato non alza tutta la colonna)
      const smooth = Float32Array.from(colTop, (v, x) => {
        if (v < 0) return -1
        const near: number[] = []
        for (let k = Math.max(0, x - 3); k <= Math.min(W - 1, x + 3); k++) if (colTop[k] >= 0) near.push(colTop[k])
        near.sort((a, b) => a - b)
        return near[near.length >> 1]
      })
      const cols = makeCanvas(W, H)
      const cctx = ctx2d(cols)
      cctx.fillStyle = '#000'
      for (let x = 0; x < W; x++) {
        // qualche pixel sotto il bordo: lo strato sotto non fa da contorno al capo sopra
        const t = smooth[x] < 0 ? 0 : Math.min(H, smooth[x] + 3)
        cctx.fillRect(x, t, 1, H - t)
      }
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(cols, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      releaseCanvas(cols)
      return { mask: c, top: top < 0 ? 1 : top / H, rowL, rowR, colBottom }
    })()
    extents.set(url, p)
    // gli URL firmati cambiano: non tengo in memoria quelli vecchi all'infinito
    if (extents.size > 24) extents.delete(extents.keys().next().value!)
  }
  return p
}

/**
 * Riga delle spalle nel fotogramma dei livelli (frazione), dalla riga sulla foto del corpo
 * (frazione) e dalle proporzioni della foto.
 */
export function layerRow(photoY: number, photoAspect: number) {
  const pad = ON_ME_PAD * Math.max(photoAspect, 1)
  return (pad + photoY) / (1 + 2 * pad)
}

/**
 * Cappuccio di uno strato sotto, da disegnare sopra i capi esterni (come tirato fuori dalla giacca).
 * È la parte alta dello strato, molto più stretta delle spalle: dall'alto, riga per riga, finché lo
 * strato resta sotto il 60% della sua larghezza alle spalle (o poco sotto la riga delle spalle): quella
 * riga è il limite più basso. Dentro, il taglio segue il bordo vero del cappuccio: colonna per colonna
 * il cambio di colore più netto (bordo o ombra) tra metà cappuccio e poco sotto la riga,
 * poi la linea viene ammorbidita; dove il bordo non si trova vale la riga. Mai sulle spalle. null se lo strato non ha cappuccio (un girocollo).
 * `shoulder`: riga delle spalle nel fotogramma dei livelli.
 */
const hoods = new Map<string, Promise<HoodShape | null>>()
type HoodShape = { W: number; H: number; top: number; x0: number; bottom: Float32Array }

async function hoodShape(url: string, shoulder: number): Promise<HoodShape | null> {
  const { mask, rowL, rowR } = await layerExtent(url)
  const W = mask.width
  const H = mask.height
  const width = (y: number) => (rowL[y] < 0 ? 0 : rowR[y] - rowL[y] + 1)
  let top = 0
  while (top < H && rowL[top] < 0) top++
  if (top >= H) return null
  // larghezza alle spalle: la più larga attorno alla riga delle spalle
  const sy = Math.round(shoulder * H)
  let ref = 0
  for (let y = Math.max(0, sy - Math.round(0.02 * H)); y <= Math.min(H - 1, sy + Math.round(0.04 * H)); y++) ref = Math.max(ref, width(y))
  if (!ref) return null
  // fino a dove lo strato resta stretto (sotto il 60% delle spalle): è il limite più basso del taglio
  const limit = Math.min(H, Math.round((shoulder + 0.02) * H))
  let end = top
  while (end < limit && width(end) > 0 && width(end) < ref * 0.6) end++
  if (end - top < 0.04 * H) return null

  // colonne del cappuccio: solo quelle della parte stretta (niente spalle)
  let x0 = W
  let x1 = 0
  for (let y = top; y < end; y++) {
    x0 = Math.min(x0, rowL[y])
    x1 = Math.max(x1, rowR[y])
  }

  // colori dello strato, alla stessa scala della maschera
  const bmp = await bitmapOf(url, 400)
  const c = makeCanvas(W, H)
  ctx2d(c).drawImage(bmp, 0, 0, W, H)
  bmp.close()
  const d = ctx2d(c).getImageData(0, 0, W, H).data
  releaseCanvas(c)
  const at = (x: number, y: number) => (y * W + x) * 4

  // per colonna: il cambio di colore più netto tra metà cappuccio e poco sotto la riga
  const ys = Math.round(top + (end - top) * 0.5)
  const ye = Math.min(H - 4, Math.round(end + 0.03 * H))
  const n = x1 - x0 + 1
  const raw = new Float32Array(n).fill(NaN)
  const k = 3
  for (let x = x0; x <= x1; x++) {
    let best = 0
    let by = -1
    for (let y = Math.max(ys, k); y <= ye; y++) {
      let ok = true
      const up = [0, 0, 0]
      const dn = [0, 0, 0]
      for (let j = 1; j <= k && ok; j++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(W - 1, Math.max(0, x + dx))
          const u = at(xx, y - j)
          const v = at(xx, y + j)
          if (d[u + 3] < 200 || d[v + 3] < 200) {
            ok = false
            break
          }
          for (let ch = 0; ch < 3; ch++) {
            up[ch] += d[u + ch]
            dn[ch] += d[v + ch]
          }
        }
      }
      if (!ok) continue
      const score = Math.hypot(up[0] - dn[0], up[1] - dn[1], up[2] - dn[2]) / (3 * k)
      // a parità, il più in basso: il bordo esterno del cappuccio, non la fodera vicino al collo
      if (score >= best * 0.95 && score > 0) {
        if (score > best) best = score
        by = y
      }
    }
    if (best >= 18 && by >= 0) raw[x - x0] = by
  }

  // buchi: dalla colonna valida più vicina; nessuna valida: la riga di prima
  const valid = [...raw].map((v, i) => (Number.isNaN(v) ? -1 : i)).filter((i) => i >= 0)
  const filled = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(raw[i])) filled[i] = raw[i]
    else if (!valid.length) filled[i] = end
    else {
      const j = valid.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a))
      filled[i] = raw[j]
    }
  }
  // linea morbida: mediana (via i salti isolati), poi media
  const win = (arr: Float32Array, r: number, f: (v: number[]) => number) =>
    Float32Array.from(arr, (_, i) => f([...arr.slice(Math.max(0, i - r), Math.min(n, i + r + 1))]))
  const median = win(filled, 4, (v) => v.sort((a, b) => a - b)[v.length >> 1])
  const bottom = win(median, 5, (v) => v.reduce((a, b) => a + b, 0) / v.length)
  return { W, H, top, x0, bottom }
}

export async function hoodMask(url: string, shoulder: number): Promise<HTMLCanvasElement | null> {
  const key = `${url}|${shoulder.toFixed(4)}`
  let p = hoods.get(key)
  if (!p) {
    p = hoodShape(url, shoulder)
    hoods.set(key, p)
    if (hoods.size > 24) hoods.delete(hoods.keys().next().value!)
  }
  const shape = await p
  if (!shape) return null
  const { W, H, top, x0, bottom } = shape
  const c = makeCanvas(W, H)
  const ctx = ctx2d(c)
  ctx.fillStyle = '#000'
  const fade = Math.max(2, Math.round(0.006 * H))
  for (let i = 0; i < bottom.length; i++) {
    const b = bottom[i]
    ctx.globalAlpha = 1
    ctx.fillRect(x0 + i, top, 1, Math.max(0, b - fade - top))
    // sfumatura di pochi pixel sul bordo
    for (let y = Math.max(top, Math.floor(b - fade)); y < b; y++) {
      ctx.globalAlpha = Math.min(1, (b - y) / fade)
      ctx.fillRect(x0 + i, y, 1, 1)
    }
  }
  return c
}

/**
 * Dove si vede uno strato che ha sopra questi livelli (null se sopra non c'è niente).
 * inside: lo strato è tenuto dentro i capi sopra e non esce sotto il loro orlo (per colonne, l'orlo
 * più basso tra i capi sopra; ganci e lacci stretti non contano).
 */
export async function coverMask(above: string[], inside = false): Promise<HTMLCanvasElement | null> {
  if (!above.length) return null
  const extents = await Promise.all(above.map(layerExtent))
  const masks = extents.map((e) => e.mask)
  const c = makeCanvas(masks[0].width, masks[0].height)
  const ctx = ctx2d(c)
  ctx.drawImage(masks[0], 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  for (const m of masks.slice(1)) ctx.drawImage(m, 0, 0, c.width, c.height)
  if (inside) {
    const W = c.width
    const H = c.height
    const bottom = new Float32Array(W).fill(-1)
    for (const e of extents) {
      const k = e.colBottom.length / W
      for (let x = 0; x < W; x++) bottom[x] = Math.max(bottom[x], e.colBottom[Math.min(e.colBottom.length - 1, Math.floor(x * k))] / k)
    }
    // un orlo più basso solo in poche colonne (un gancio) non conta: mediana larga
    const r = Math.max(3, Math.round(W * 0.03))
    const hem = Float32Array.from(bottom, (v, x) => {
      if (v < 0) return -1
      const near: number[] = []
      for (let j = Math.max(0, x - r); j <= Math.min(W - 1, x + r); j++) if (bottom[j] >= 0) near.push(bottom[j])
      near.sort((a, b) => a - b)
      return near[near.length >> 1]
    })
    const keep = makeCanvas(W, H)
    const kctx = ctx2d(keep)
    kctx.fillStyle = '#000'
    for (let x = 0; x < W; x++) kctx.fillRect(x, 0, 1, hem[x] < 0 ? H : hem[x] + 1)
    ctx.drawImage(keep, 0, 0)
    releaseCanvas(keep)
  }
  return c
}

/**
 * Correzione a mano di un livello "Su di me" (quando Gemini o il modello lo fanno un po' grande,
 * lungo, stretto o dritto). Prima le parti, riga per riga (niente strappi tra una parte e l'altra):
 * - busto e braccia (capi del busto): il busto si allarga dal centro, ogni braccio dal bordo del busto;
 * - gambe (pantaloni): ognuna si allarga dal centro e si apre verso l'esterno a partire dal cavallo,
 *   per seguire le gambe un po' divaricate della foto.
 * Poi l'insieme: grandezza e lunghezza dal centro in alto del capo (colletto o elastico), spostamento.
 * Spostamenti e aperture sono frazioni della larghezza/altezza del livello.
 */
export type LayerAdjust = {
  scale: number
  stretch: number
  dx: number
  dy: number
  torso: number
  armL: number
  armR: number
  legL: number
  legR: number
  openL: number
  openR: number
  /** lunghezza delle maniche, lungo il braccio */
  sleeveL: number
  sleeveR: number
  /** inclinazione delle maniche attorno alla spalla, in gradi (positivo = verso l'esterno) */
  tiltL: number
  tiltR: number
}
export const NO_ADJUST: LayerAdjust = {
  scale: 1,
  stretch: 1,
  dx: 0,
  dy: 0,
  torso: 1,
  armL: 1,
  armR: 1,
  legL: 1,
  legR: 1,
  openL: 0,
  openR: 0,
  sleeveL: 1,
  sleeveR: 1,
  tiltL: 0,
  tiltR: 0,
}

type Pt = { x: number; y: number }
/**
 * Riferimenti sul livello, in frazioni: punto fisso, centro del corpo, bordi del busto (le spalle),
 * altezza delle spalle, polsini (il punto della manica più lontano dalla spalla), fianchi e caviglie.
 */
export type AdjustGuide = {
  origin: Pt
  cx: number
  torsoL: number
  torsoR: number
  shoulderY: number
  cuffL: Pt
  cuffR: Pt
  hipY: number
  ankleY: number
}

export const FALLBACK_GUIDE: AdjustGuide = {
  origin: { x: 0.5, y: 0.3 },
  cx: 0.5,
  torsoL: 0.39,
  torsoR: 0.61,
  shoulderY: 0.24,
  cuffL: { x: 0.27, y: 0.52 },
  cuffR: { x: 0.73, y: 0.52 },
  hipY: 0.5,
  ankleY: 0.88,
}

const bitmapOf = async (url: string, maxSide?: number) => {
  const blob = await (await fetch(url)).blob()
  if (!maxSide) return createImageBitmap(blob)
  const full = await createImageBitmap(blob)
  const k = Math.min(1, maxSide / Math.max(full.width, full.height))
  if (k === 1) return full
  const small = await createImageBitmap(full, { resizeWidth: Math.round(full.width * k), resizeHeight: Math.round(full.height * k), resizeQuality: 'high' })
  full.close()
  return small
}

/** Riferimenti per la correzione: dal capo (punto fisso) e dai punti del corpo segnati nel Profilo. */
export async function layerGuide(url: string, anchors: Anchors | null | undefined): Promise<AdjustGuide> {
  const bmp = await bitmapOf(url, 300)
  const c = makeCanvas(bmp.width, bmp.height)
  ctx2d(c).drawImage(bmp, 0, 0)
  bmp.close()
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data
  let top = c.height
  let left = c.width
  let right = 0
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] < 100) continue
      if (y < top) top = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }
  const origin = right < left ? { x: 0.5, y: 0.3 } : { x: (left + right + 1) / 2 / c.width, y: top / c.height }
  if (!anchors) return { ...FALLBACK_GUIDE, origin }
  // dalla foto del corpo al livello, che ha ON_ME_PAD × lato lungo di margine su ogni lato
  const W = c.width
  const H = c.height
  const pad = (ON_ME_PAD * Math.max(W, H)) / (1 + 2 * ON_ME_PAD)
  const fx = (x: number) => (pad + x * (W - 2 * pad)) / W
  const fy = (y: number) => (pad + y * (H - 2 * pad)) / H
  const torsoL = fx(Math.min(anchors.shoulder_l.x, anchors.shoulder_r.x))
  const torsoR = fx(Math.max(anchors.shoulder_l.x, anchors.shoulder_r.x))
  const shoulderY = fy((anchors.shoulder_l.y + anchors.shoulder_r.y) / 2)
  // polsino: il punto della manica più lontano dalla spalla, fuori dal busto e sotto le spalle
  const cuff = (side: -1 | 1, fallback: Pt): Pt => {
    const sx = (side < 0 ? torsoL : torsoR) * W
    const sy = shoulderY * H
    const margin = 0.03 * W
    let best = -1
    let p = fallback
    for (let y = Math.ceil(sy); y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (side < 0 ? x > sx - margin : x < sx + margin) continue
        if (d[(y * W + x) * 4 + 3] < 100) continue
        const dist = (x - sx) ** 2 + (y - sy) ** 2
        if (dist > best) {
          best = dist
          p = { x: x / W, y: y / H }
        }
      }
    }
    return p
  }
  return {
    origin,
    cx: fx((anchors.hips.x + anchors.neck.x) / 2),
    torsoL,
    torsoR,
    shoulderY,
    cuffL: cuff(-1, FALLBACK_GUIDE.cuffL),
    cuffR: cuff(1, FALLBACK_GUIDE.cuffR),
    hipY: fy(anchors.hips.y),
    ankleY: fy((anchors.ankle_l.y + anchors.ankle_r.y) / 2),
  }
}

const partsChanged = (a: LayerAdjust) =>
  a.torso !== 1 || a.armL !== 1 || a.armR !== 1 || a.legL !== 1 || a.legR !== 1 || a.openL !== 0 || a.openR !== 0
const sleevesChanged = (a: LayerAdjust) => a.sleeveL !== 1 || a.sleeveR !== 1 || a.tiltL !== 0 || a.tiltR !== 0

type Sleeve = { edge: number; shoulder: Pt; cuff: Pt; len: number; tilt: number; left: boolean }

/**
 * Maniche: ognuna ruota attorno alla spalla e si allunga lungo il braccio (spalla → polsino), senza
 * ingrossarsi. Pixel per pixel all'indietro, con interpolazione; vicino al busto l'effetto sfuma a zero,
 * così la giuntura con il busto non si apre. Coordinate in pixel.
 */
function warpSleeves(c: HTMLCanvasElement, sleeves: Sleeve[]) {
  const W = c.width
  const H = c.height
  const ctx = ctx2d(c)
  const src = ctx.getImageData(0, 0, W, H)
  const out = ctx.createImageData(W, H)
  const s = src.data
  const o = out.data
  o.set(s)
  const ramp = Math.max(2, 0.02 * W)
  for (const sl of sleeves) {
    if (sl.len === 1 && sl.tilt === 0) continue
    let ux = sl.cuff.x - sl.shoulder.x
    let uy = sl.cuff.y - sl.shoulder.y
    const n = Math.hypot(ux, uy) || 1
    // l'effetto cresce piano dalla spalla lungo il braccio: la manica si piega, non si strappa
    const bend = n * 0.4
    ux /= n
    uy /= n
    // rotazione inversa: a sinistra "verso l'esterno" è in senso orario sullo schermo
    const b = ((sl.left ? -1 : 1) * sl.tilt * Math.PI) / 180
    const cos = Math.cos(b)
    const sin = Math.sin(b)
    const k = 1 / sl.len - 1
    // solo il riquadro della manica, prima e dopo la correzione (con margine): fuori resta com'è
    const fa = -b
    const cx = sl.cuff.x - sl.shoulder.x
    const cy = sl.cuff.y - sl.shoulder.y
    const nx = sl.shoulder.x + sl.len * (cx * Math.cos(fa) - cy * Math.sin(fa))
    const ny = sl.shoulder.y + sl.len * (cx * Math.sin(fa) + cy * Math.cos(fa))
    const mx = 0.1 * W
    const my = 0.08 * H
    const bx0 = Math.min(sl.shoulder.x, sl.cuff.x, nx) - mx
    const bx1 = Math.max(sl.shoulder.x, sl.cuff.x, nx) + mx
    const x0 = Math.max(0, Math.floor(sl.left ? bx0 : sl.edge))
    const x1 = Math.min(W, Math.ceil(sl.left ? sl.edge : bx1))
    const y0 = Math.max(0, Math.floor(sl.shoulder.y - my))
    const y1 = Math.min(H, Math.ceil(Math.max(sl.cuff.y, ny) + my))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const we = Math.min(1, Math.max(0, (sl.left ? sl.edge - x : x - sl.edge) / ramp))
        if (we === 0) continue
        const dx = x - sl.shoulder.x
        const dy = y - sl.shoulder.y
        const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / bend)
        const w = we * t * t * (3 - 2 * t)
        if (w === 0) continue
        let rx = dx * cos - dy * sin
        let ry = dx * sin + dy * cos
        const p = Math.max(0, rx * ux + ry * uy) * k
        rx += p * ux
        ry += p * uy
        const fx = x + w * (sl.shoulder.x + rx - x)
        const fy = y + w * (sl.shoulder.y + ry - y)
        const i = (y * W + x) * 4
        // la manica si prende solo dal lato del braccio: niente pezzi di busto ruotati fuori
        // (con un pixel di margine per l'interpolazione, solo dove il campione si è spostato verso il busto)
        if (sl.left ? fx > sl.edge - 1.5 && fx > x + 0.5 : fx < sl.edge + 1.5 && fx < x - 0.5) {
          o[i] = o[i + 1] = o[i + 2] = o[i + 3] = 0
          continue
        }
        // interpolazione bilineare (fuori dall'immagine: trasparente)
        const ix = Math.floor(fx)
        const iy = Math.floor(fy)
        const ax = fx - ix
        const ay = fy - iy
        const in0 = ix >= 0 && ix < W
        const in1 = ix + 1 >= 0 && ix + 1 < W
        const r0 = iy >= 0 && iy < H
        const r1 = iy + 1 >= 0 && iy + 1 < H
        const j00 = (iy * W + ix) * 4
        const j10 = j00 + 4
        const j01 = j00 + W * 4
        const j11 = j01 + 4
        const w00 = in0 && r0 && s[j00 + 3] ? (1 - ax) * (1 - ay) : 0
        const w10 = in1 && r0 && s[j10 + 3] ? ax * (1 - ay) : 0
        const w01 = in0 && r1 && s[j01 + 3] ? (1 - ax) * ay : 0
        const w11 = in1 && r1 && s[j11 + 3] ? ax * ay : 0
        // vuoto tutt'intorno: trasparente (il caso più frequente, subito)
        if (!w00 && !w10 && !w01 && !w11) {
          o[i] = o[i + 1] = o[i + 2] = o[i + 3] = 0
          continue
        }
        for (let ch = 0; ch < 4; ch++) {
          o[i + ch] =
            (w00 ? s[j00 + ch] * w00 : 0) + (w10 ? s[j10 + ch] * w10 : 0) + (w01 ? s[j01 + ch] * w01 : 0) + (w11 ? s[j11 + ch] * w11 : 0)
        }
      }
    }
  }
  ctx.putImageData(out, 0, 0)
}

/**
 * Disegna in `out` (stesse dimensioni di `src`) il livello corretto. `scratch` è un canvas di appoggio
 * da riusare tra un disegno e l'altro (l'anteprima ridisegna a ogni movimento del dito); senza, ne
 * crea uno e lo libera alla fine.
 */
export function renderAdjusted(
  src: ImageBitmap,
  a: LayerAdjust,
  g: AdjustGuide,
  category: OnMeCategory,
  out: HTMLCanvasElement,
  scratch?: HTMLCanvasElement,
) {
  const W = src.width
  const H = src.height
  if (out.width !== W || out.height !== H) {
    out.width = W
    out.height = H
  }
  let parts: CanvasImageSource = src
  const sleeves = category === 'tops' && sleevesChanged(a)
  if (partsChanged(a) || sleeves) {
    const tmp = scratch ?? makeCanvas(W, H)
    if (tmp.width !== W || tmp.height !== H) {
      tmp.width = W
      tmp.height = H
    }
    const t = ctx2d(tmp)
    t.setTransform(1, 0, 0, 1, 0, 0)
    t.clearRect(0, 0, W, H)
    const c = g.cx * W
    // mezzo pixel di sovrapposizione tra le parti: niente righe trasparenti sulle giunture
    const strip = (sx: number, sw: number, y: number, dx: number, dw: number) => {
      if (sw > 0 && dw > 0) t.drawImage(src, sx, y, sw, 1, dx - 0.5, y, dw + 1, 1)
    }
    if (category === 'tops') {
      const tl = g.torsoL * W
      const tr = g.torsoR * W
      const nl = c - (c - tl) * a.torso
      const nr = c + (tr - c) * a.torso
      // busto e braccia della larghezza originale: niente strisce, si copia e basta (molto più veloce)
      if (a.torso === 1 && a.armL === 1 && a.armR === 1) t.drawImage(src, 0, 0)
      else {
        for (let y = 0; y < H; y++) {
          strip(0, tl, y, nl - tl * a.armL, tl * a.armL)
          strip(tl, tr - tl, y, nl, nr - nl)
          strip(tr, W - tr, y, nr, (W - tr) * a.armR)
        }
      }
      if (sleeves) {
        // spalle e polsini spostati come il busto e le braccia qui sopra
        const sy = g.shoulderY * H
        const cl = { x: nl - (tl - g.cuffL.x * W) * a.armL, y: g.cuffL.y * H }
        const cr = { x: nr + (g.cuffR.x * W - tr) * a.armR, y: g.cuffR.y * H }
        warpSleeves(tmp, [
          { edge: nl, shoulder: { x: nl, y: sy }, cuff: cl, len: a.sleeveL, tilt: a.tiltL, left: true },
          { edge: nr, shoulder: { x: nr, y: sy }, cuff: cr, len: a.sleeveR, tilt: a.tiltR, left: false },
        ])
      }
    } else {
      // l'apertura cresce dal cavallo (poco sotto i fianchi) fino alle caviglie, e continua sotto
      const crotch = g.hipY + (g.ankleY - g.hipY) * 0.15
      for (let y = 0; y < H; y++) {
        const k = Math.max(0, (y / H - crotch) / Math.max(0.05, g.ankleY - crotch))
        strip(0, c, y, c - c * a.legL - a.openL * k * W, c * a.legL)
        strip(c, W - c, y, c + a.openR * k * W, (W - c) * a.legR)
      }
    }
    parts = tmp
  }
  const ctx = ctx2d(out)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, W, H)
  const ox = g.origin.x * W
  const oy = g.origin.y * H
  ctx.translate(ox + a.dx * W, oy + a.dy * H)
  ctx.scale(a.scale, a.scale * a.stretch)
  ctx.translate(-ox, -oy)
  ctx.drawImage(parts, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (!scratch && parts !== src) releaseCanvas(parts as HTMLCanvasElement)
}

/** Immagine del livello per l'anteprima della correzione (più piccola, per seguire il dito). */
export const previewBitmap = (url: string) => bitmapOf(url, 520)

/** Il livello a piena risoluzione, per l'anteprima nitida a dito fermo. */
export const fullBitmap = (url: string) => bitmapOf(url)

/** Il livello corretto a piena risoluzione, da salvare. */
export async function adjustLayer(url: string, a: LayerAdjust, g: AdjustGuide, category: OnMeCategory): Promise<HTMLCanvasElement> {
  const bmp = await bitmapOf(url)
  const c = makeCanvas(bmp.width, bmp.height)
  renderAdjusted(bmp, a, g, category, c)
  bmp.close()
  return c
}
