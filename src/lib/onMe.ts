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
  /** per ogni strato del busto: colletto o cappuccio lasciato sotto i capi sopra (non tirato fuori) */
  collarIn: boolean[] = [],
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
    const cover = k >= 0 ? await coverMask(tops.slice(k + 1), !!inside[k], tops[k]) : null
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
    // solo lo strato subito sotto il più esterno: con un capo in mezzo il colletto resta sotto
    for (const [k, u] of tops.slice(0, -1).entries()) {
      if (collarIn[k] || k !== tops.length - 2) continue
      const hole = await collarHole(bodyUrl, u, line, tops.slice(k + 1))
      if (hole) {
        ctx.drawImage(hole, -pad, -pad, w + pad * 2, h + pad * 2)
        releaseCanvas(hole)
      }
      const hood = await hoodMask(u, line, tops.slice(k + 1))
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
type Extent = { mask: HTMLCanvasElement; top: number; rowL: Int16Array; rowR: Int16Array; colTop: Float32Array; colBottom: Float32Array }
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
      // Dove si vede lo strato sotto, riga per riga:
      // - righe senza il capo (o solo pezzi stretti): tutta la riga (l'orlo che esce sotto);
      // - sotto il capo (rientrando di 2 px: sul bordo non deve trasparire);
      // - nel vuoto che contiene il centro del corpo: l'apertura di una giacca aperta, lo scollo,
      //   tra le maniche sotto l'orlo. Non nei vuoti di lato (ascelle) né oltre le maniche.
      const e = 2
      // aperture vere (vuoto al centro con il capo da entrambi i lati: zip aperta, scollo): lì lo
      // strato sotto si vede sempre, anche contro la regola per colonne qui sotto
      const vHalf = W * 0.06
      const gaps = makeCanvas(W, H)
      const gctx = ctx2d(gaps)
      gctx.fillStyle = '#000'
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
        // apertura vera (capo da entrambi i lati), solo vicino al centro: la V di una zip o di uno
        // scollo. Più in là (es. un vuoto tra colletto e spalla) vale la regola per colonne
        if (left && right) {
          const a0 = Math.max(g0, Math.round(cx - vHalf))
          const a1 = Math.min(g1, Math.round(cx + vHalf))
          if (a1 >= a0) gctx.fillRect(a0, y, a1 - a0 + 1, 1)
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
      ctx.drawImage(gaps, 0, 0)
      releaseCanvas(cols)
      releaseCanvas(gaps)
      return { mask: c, top: top < 0 ? 1 : top / H, rowL, rowR, colTop, colBottom }
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
/** hood: cappuccio (appoggiato sul colletto dei capi sopra); collar: collo alto (in piedi attorno al collo, davanti al colletto) */
type HoodShape = {
  W: number
  H: number
  top: number
  x0: number
  bottom: Float32Array
  kind: 'hood' | 'collar'
  /** fine della parte stretta (cappuccio) o base del colletto */
  endRow: number
  /** colletto: colonne del collo (le altre sono le punte) */
  neck?: [number, number]
  /** colletto: colonne in cui si è trovato il bordino (lì il colletto arriva fino al bordino) */
  piped?: Uint8Array
  /** colletto morbido (polo): tra le punte si rimette la foto del collo */
  soft?: boolean
}

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
  // spunta sopra i capi esterni: un collo alto (sale almeno il 3% sopra le spalle, anche stretto) o un
  // cappuccio abbassato (basso ma largo attorno al collo). Il bordo di un girocollo è basso e stretto.
  if (end - top < 0.025 * H) return null
  const widths: number[] = []
  for (let y = top; y < end; y++) widths.push(width(y))
  widths.sort((a, b) => a - b)
  const wide = widths[widths.length >> 1] >= 0.15 * W
  if (end - top < 0.03 * H && !wide) return null
  const kind = wide ? 'hood' : 'collar'
  if (kind === 'collar') {
    // il colletto finisce appena lo strato si allarga verso le spalle (oltre un terzo della larghezza
    // del colletto): così non spuntano le punte delle spalle
    const firstHalf: number[] = []
    for (let y = top; y < top + Math.max(1, (end - top) >> 1); y++) firstHalf.push(width(y))
    firstHalf.sort((a, b) => a - b)
    const collar = firstHalf[firstHalf.length >> 1]
    let e2 = top + 1
    while (e2 < end && width(e2) <= collar * 1.33) e2++
    end = e2
  }

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
  // il bordino è sottile: a 400 px sparisce, il colletto si analizza a piena risoluzione. Anche un
  // "cappuccio" può essere un colletto molto aperto (felpa con la zip a 3/4): se il bordino a contrasto
  // chiude un colletto, è un colletto.
  const big = await bitmapOf(url, 1200)
  const bc = makeCanvas(big.width, big.height)
  ctx2d(bc).drawImage(big, 0, 0)
  big.close()
  const bd = ctx2d(bc).getImageData(0, 0, bc.width, bc.height).data
  const f = bc.width / W
  const shape = collarShape(bd, bc.width, bc.height, Math.round(top * f), Math.round(x0 * f), Math.round(x1 * f), Math.round(end * f), kind === 'hood')
  releaseCanvas(bc)
  return shape ?? { W, H, top, x0, bottom, kind, endRow: end }
}

/**
 * Collo alto: il colletto, con le punte del bavero quando è aperto. Nelle colonne del collo arriva
 * alla sua base. Un po' più in largo, le punte si riconoscono dal bordino a contrasto (chiaro e poco
 * colorato) che le contorna: si tiene fino al bordino più basso vicino alla cima della colonna. Senza
 * bordino (una spalla, o un capo senza bordino) lì il colletto non c'è.
 */
function collarShape(
  d: Uint8ClampedArray,
  W: number,
  H: number,
  top: number,
  x0: number,
  x1: number,
  base: number,
  /** solo un colletto chiuso dal bordino (altrimenti null) */
  onlyPiped = false,
): HoodShape | null {
  const g = Math.round(0.07 * W)
  const c0 = Math.max(0, x0 - g)
  const c1 = Math.min(W - 1, x1 + g)
  // un colletto non è mai alto più del 4% dell'altezza (la base calcolata dalla larghezza può finire
  // molto più giù, sul petto); le punte con il bordino arrivano al massimo al 9%
  base = Math.min(base, top + Math.round(0.04 * H))
  const ye = Math.min(H - 4, top + Math.round(0.09 * H))
  const at = (x: number, y: number) => (y * W + x) * 4
  const light = (i: number) => {
    const mx = Math.max(d[i], d[i + 1], d[i + 2])
    const mn = Math.min(d[i], d[i + 1], d[i + 2])
    return mn > 130 && mx - mn < 70
  }
  // il bordino si riconosce solo se fa contrasto: in un capo chiaro (una polo bianca) è chiaro tutto,
  // e il colletto resta quello del collo, senza punte
  let opaque = 0
  let pale = 0
  for (let y = Math.min(H - 1, top + Math.round(0.1 * H)); y <= Math.min(H - 1, top + Math.round(0.16 * H)); y += 2)
    for (let x = x0; x <= x1; x += 2) {
      const i = at(x, y)
      if (d[i + 3] < 200) continue
      opaque++
      if (light(i)) pale++
    }
  const contrast = opaque > 0 && pale / opaque < 0.4
  if (contrast) {
    const shape = pipedCollar(d, W, H, top, x0, x1, c0, c1, light)
    if (shape) return shape
  }
  if (onlyPiped) return null
  // capo chiaro con le righe scure sul colletto (polo): le punte arrivano fino alle righe
  if (!contrast) {
    const shape = tippedCollar(d, W, H, top, x0, x1, c0, c1)
    if (shape) return shape
  }
  const raw = new Float32Array(c1 - c0 + 1).fill(-1)
  const piped = new Uint8Array(c1 - c0 + 1)
  for (let x = c0; x <= c1; x++) {
    // il bordino del colletto (chiaro e poco colorato): il pixel più basso vicino alla cima della
    // colonna. Una spalla non ha bordino; una scritta colorata non conta.
    let colTop = top
    while (colTop < ye && d[at(x, colTop) + 3] < 200) colTop++
    // Il bordino parte dalla cima della colonna (il bordo del colletto, entro l'1,5% dell'altezza) e
    // scende senza interruzioni lunghe: dopo più del 3% senza chiaro ci si ferma. Così la cerniera
    // (grigio chiaro) e le scritte sul petto, più in basso e staccate, non contano.
    let low = -1
    for (let y = colTop; contrast && y <= Math.min(ye, colTop + 0.08 * H); y++) {
      const i = at(x, y)
      if (d[i + 3] >= 200 && light(i)) {
        if (low < 0 && y - colTop > 0.015 * H) break
        low = y
      } else if ((low < 0 ? y - colTop > 0.015 * H : y - low > 0.03 * H)) break
    }
    // nelle colonne del collo il colletto arriva almeno alla sua base, e fino al bordino se scende
    // (il bavero aperto); di lato c'è solo dove c'è il bordino (le punte)
    if (low >= 0) piped[x - c0] = 1
    if (x >= x0 && x <= x1) raw[x - c0] = low >= 0 ? Math.max(low + 1, base) : base
    else if (low >= 0) raw[x - c0] = low + 1
  }
  // le colonne in più ai lati valgono solo se attaccate al colletto: un buco corto (fino a 5 colonne)
  // tra colonne buone si riempie con la media delle vicine, uno più lungo chiude la punta
  const gap = Math.max(2, Math.round(0.012 * W))
  const walk = (from: number, to: number, step: 1 | -1) => {
    let last = from - step
    for (let x = from; step > 0 ? x <= to : x >= to; x += step) {
      if (raw[x - c0] >= 0) {
        const holes = Math.abs(x - last) - 1
        for (let j = 1; j <= holes; j++) {
          const a = raw[last - c0]
          raw[last + j * step - c0] = a + ((raw[x - c0] - a) * j) / (holes + 1)
        }
        last = x
      } else if (Math.abs(x - last) > gap) {
        for (let j = x; step > 0 ? j <= to : j >= to; j += step) raw[j - c0] = -1
        return
      }
    }
    // in fondo, i buchi dopo l'ultima colonna buona restano vuoti
    for (let j = last + step; step > 0 ? j <= to : j >= to; j += step) raw[j - c0] = -1
  }
  walk(x0 - 1, c0, -1)
  walk(x1 + 1, c1, 1)
  // il bordo basso del colletto è una linea continua (la diagonale del bordino): niente avvallamenti
  // stretti dove in una colonna si è trovato solo il bordino di sopra. Ogni colonna prende il più
  // basso tra lei e le vicine (4 per lato), senza allargarsi a colonne senza colletto.
  const spread = Math.max(1, Math.round(0.006 * W))
  const dil = Float32Array.from(raw, (v, i) => {
    if (v < 0) return -1
    let m = v
    for (let j = Math.max(0, i - spread); j <= Math.min(raw.length - 1, i + spread); j++) if (raw[j] > m) m = raw[j]
    return m
  })
  raw.set(dil)
  // via i salti isolati (mediana corta)
  const bottom = Float32Array.from(raw, (v, i) => {
    if (v < 0) return -1
    const near: number[] = []
    for (let j = Math.max(0, i - spread); j <= Math.min(raw.length - 1, i + spread); j++) if (raw[j] >= 0) near.push(raw[j])
    near.sort((a, b) => a - b)
    return near[near.length >> 1]
  })
  return { W, H, top, x0: c0, bottom, kind: 'collar', endRow: base, neck: [x0, x1], piped }
}

/**
 * Colletto con il bordino a contrasto (felpa con la zip): la sua forma è la zona chiusa dal bordino.
 * Si parte dal colletto attorno al collo (la riga all'1% sotto la cima, nelle colonne del collo) e ci
 * si allarga tra i pixel del capo senza attraversare il bordino (che resta incluso): così le punte e il
 * bavero hanno la stessa forma di quando la felpa si vede intera, senza la spalla sopra il bordino.
 * null se il bordino non chiude il colletto (la zona arriva al 12% sotto la cima): vale la regola per colonne.
 */
function pipedCollar(
  d: Uint8ClampedArray,
  W: number,
  H: number,
  top: number,
  x0: number,
  x1: number,
  c0: number,
  c1: number,
  light: (i: number) => boolean,
): HoodShape | null {
  const y1 = Math.min(H - 1, top + Math.round(0.12 * H))
  const w = c1 - c0 + 1
  const rows = y1 - top + 1
  const seen = new Uint8Array(w * rows)
  // per i pixel del bordino: quanti passi dentro il bordino (0 = fuori)
  const depth = new Uint8Array(w * rows)
  const queue = new Int32Array(w * rows)
  let head = 0
  let tail = 0
  const at = (x: number, y: number) => (y * W + x) * 4
  // il bordino fa parte del colletto e lo chiude: si attraversa solo per il suo spessore (al massimo
  // l'1,2% dell'altezza), così si prende tutto anche quando è largo ma non si scappa lungo le righe
  const thick = Math.max(2, Math.min(250, Math.round(0.012 * H)))
  const visit = (x: number, y: number, from: number) => {
    if (x < c0 || x > c1 || y < top || y > y1) return
    const k = (y - top) * w + (x - c0)
    if (seen[k]) return
    const i = at(x, y)
    if (d[i + 3] < 200) return
    if (light(i)) {
      const dd = from + 1
      if (dd > thick) return
      seen[k] = 1
      depth[k] = dd
      queue[tail++] = k
      return
    }
    // dal bordino non si torna nel capo: oltre il bordino c'è il resto della felpa
    if (from > 0) return
    seen[k] = 1
    queue[tail++] = k
  }
  const ys = Math.min(y1, top + Math.round(0.01 * H))
  for (let x = x0; x <= x1; x++) visit(x, ys, 0)
  while (head < tail) {
    const k = queue[head++]
    const x = (k % w) + c0
    const y = Math.floor(k / w) + top
    const dd = depth[k]
    visit(x + 1, y, dd)
    visit(x - 1, y, dd)
    visit(x, y + 1, dd)
    visit(x, y - 1, dd)
  }
  const bottom = new Float32Array(w).fill(-1)
  for (let k = 0; k < seen.length; k++) {
    if (!seen[k]) continue
    const x = k % w
    const y = Math.floor(k / w) + top
    if (y >= y1) return null
    if (y > bottom[x]) bottom[x] = y
  }
  if (!bottom.some((v) => v >= 0)) return null
  // il bordo morbido del bordino (1-2 px oltre l'ultimo pixel trovato)
  for (let x = 0; x < w; x++) if (bottom[x] >= 0) bottom[x] += 2
  const piped = Uint8Array.from(bottom, (v) => (v >= 0 ? 1 : 0))
  return { W, H, top, x0: c0, bottom, kind: 'collar', endRow: top, neck: [x0, x1], piped }
}

/**
 * Colletto di una polo (capo chiaro) con le righe scure lungo il bordo delle punte: in ogni colonna le
 * punte arrivano poco sotto la riga più bassa (il bordo del colletto è appena oltre le righe); tra le
 * righe di sinistra e di destra (le punte che si toccano davanti) il bordo si unisce in linea retta.
 * Così sopra un girocollo si vedono le punte come quando la polo è da sola. null se non ci sono righe
 * da entrambi i lati.
 */
function tippedCollar(d: Uint8ClampedArray, W: number, H: number, top: number, x0: number, x1: number, c0: number, c1: number): HoodShape | null {
  const ye = Math.min(H - 1, top + Math.round(0.07 * H))
  const cx = Math.round((x0 + x1) / 2)
  const w = c1 - c0 + 1
  const low = new Float32Array(w).fill(-1)
  for (let x = c0; x <= c1; x++) {
    for (let y = top; y <= ye; y++) {
      const i = (y * W + x) * 4
      if (d[i + 3] < 200) continue
      if (Math.max(d[i], d[i + 1], d[i + 2]) < 110) low[x - c0] = y
    }
  }
  // per lato, solo le colonne vicine alla riga vera (entro il 3% dell'altezza dalla mediana del lato):
  // un'ombra o un bottone scuro più in basso non conta
  const side = (from: number, to: number) => {
    const ys: number[] = []
    for (let i = from; i <= to; i++) if (low[i] >= 0) ys.push(low[i])
    if (ys.length < 2) return false
    ys.sort((p, q) => p - q)
    const med = ys[ys.length >> 1]
    for (let i = from; i <= to; i++) if (low[i] >= 0 && Math.abs(low[i] - med) > 0.03 * H) low[i] = -1
    return true
  }
  if (!side(0, cx - c0 - 1) || !side(cx - c0, w - 1)) return null
  const margin = Math.round(0.012 * H)
  // la riga di ogni lato: la colonna più interna (verso il collo) e la sua fine
  let iL = -1
  for (let i = 0; i < cx - c0; i++) if (low[i] >= 0) iL = i
  let iR = -1
  for (let i = w - 1; i >= cx - c0; i--) if (low[i] >= 0) iR = i
  let oL = iL
  for (let i = 0; i < iL; i++) if (low[i] >= 0) {
    oL = i
    break
  }
  let oR = iR
  for (let i = w - 1; i > iR; i--) if (low[i] >= 0) {
    oR = i
    break
  }
  const bL = low[iL] + margin
  const bR = low[iR] + margin
  // la punta della V davanti: al centro, la prima riga del capo sotto lo scollo
  let vy = top
  const atA = (x: number, y: number) => d[(y * W + x) * 4 + 3]
  while (vy < H - 1 && vy < top + 0.12 * H && atA(cx, vy) < 200) vy++
  const bC = Math.max(bL, bR, Math.min(vy, top + 0.12 * H) + margin)
  // il bordo basso: dalle righe scende dritto verso la punta della V; oltre le righe il bordo bianco
  // (l'1% della larghezza) risale verso la cima
  const bottom = new Float32Array(w).fill(-1)
  const pad = Math.round(0.01 * W)
  for (let i = Math.max(0, oL - pad); i <= Math.min(w - 1, oR + pad); i++) {
    if (i < oL) bottom[i] = bL - ((oL - i) / pad) * (bL - top) * 0.5
    else if (i <= iL) bottom[i] = bL
    else if (i < cx - c0) bottom[i] = bL + ((bC - bL) * (i - iL)) / Math.max(1, cx - c0 - iL)
    else if (i < iR) bottom[i] = bC + ((bR - bC) * (i - (cx - c0))) / Math.max(1, iR - (cx - c0))
    else if (i <= oR) bottom[i] = bR
    else bottom[i] = bR - ((i - oR) / pad) * (bR - top) * 0.5
  }
  const piped = Uint8Array.from(bottom, (v) => (v >= 0 ? 1 : 0))
  return { W, H, top, x0: c0, bottom, kind: 'collar', endRow: top, neck: [x0, x1], piped, soft: true }
}

/** quanto il cappuccio scende sopra il colletto dei capi esterni: tirato fuori e steso sul colletto */
const HOOD_OVERLAP = 0.04

/**
 * Forma del cappuccio da disegnare sopra i capi `above`, a piena risoluzione (`size`: lato lungo del
 * livello) con un bordo morbido di 2 px. In basso finisce al bordo vero del cappuccio, ma al massimo
 * poco sotto il bordo alto dei capi sopra (il colletto, la pelliccia): così segue il loro profilo
 * invece di tagliarli con una riga.
 */
/** cosa spunta dallo strato sopra i capi esterni: cappuccio, collo alto o niente */
export async function hoodKind(url: string, shoulder: number): Promise<'hood' | 'collar' | null> {
  return (await shapeOf(url, shoulder))?.kind ?? null
}

function shapeOf(url: string, shoulder: number): Promise<HoodShape | null> {
  const key = `${url}|${shoulder.toFixed(4)}`
  let p = hoods.get(key)
  if (!p) {
    p = hoodShape(url, shoulder)
    hoods.set(key, p)
    if (hoods.size > 24) hoods.delete(hoods.keys().next().value!)
  }
  return p
}

export async function hoodMask(url: string, shoulder: number, above: string[] = [], size = 1200): Promise<HTMLCanvasElement | null> {
  const shape = await shapeOf(url, shoulder)
  if (!shape) return null
  const { W, H, top, x0, bottom, kind, endRow, neck, piped } = shape
  // bordo alto dei capi sopra, per colonna (alla scala del cappuccio)
  const outerTop = new Float32Array(W).fill(-1)
  for (const e of await Promise.all(above.map(layerExtent))) {
    const k = e.colTop.length / W
    for (let x = 0; x < W; x++) {
      const t = e.colTop[Math.min(e.colTop.length - 1, Math.floor(x * k))]
      if (t >= 0) outerTop[x] = outerTop[x] < 0 ? t / k : Math.min(outerTop[x], t / k)
    }
  }
  // il capo sopra è chiuso al centro appena sotto il suo bordo (uno scollo tondo, non una V o
  // un'apertura): conta per le punte di una polo
  let crew = false
  if (shape.soft && above.length && neck) {
    const cx = Math.round((neck[0] + neck[1]) / 2)
    const t = outerTop[cx]
    if (t >= 0) {
      const ob = await bitmapOf(above[above.length - 1], 400)
      const oc = makeCanvas(ob.width, ob.height)
      const octx = ctx2d(oc)
      octx.drawImage(ob, 0, 0)
      ob.close()
      const f = oc.width / W
      const px = octx.getImageData(Math.round(cx * f), Math.round((t + 0.025 * H) * f), 1, 1).data
      crew = px[3] > 200
      releaseCanvas(oc)
    }
  }
  // Collo alto: in piedi davanti al colletto dei capi sopra, intero fino alla sua base.
  // Cappuccio: tirato fuori e steso sul colletto dei capi sopra, fino a poco sotto il suo bordo alto
  // (il bordo vero del cappuccio sulle spalle è un'ombra leggera, non affidabile), solo nelle colonne
  // della parte stretta: sulle spalle cappuccio e felpa sono dello stesso colore e non si distinguono.
  const overlap = HOOD_OVERLAP * H
  // l'orlo del cappuccio è una curva morbida: il bordo dei capi sopra (ciuffi di una pelliccia,
  // cuciture) viene ammorbidito su una fascia larga (mediana, poi media)
  // il colletto ne segue il bordo su una fascia più stretta: niente scalini dove lo scollo scende ripido
  {
    const r = Math.max(2, Math.round((kind === 'hood' ? 0.03 : 0.012) * W))
    const win = (src: Float32Array, f: (v: number[]) => number) =>
      Float32Array.from(src, (v, x) => {
        if (v < 0) return -1
        const near: number[] = []
        for (let j = Math.max(0, x - r); j <= Math.min(W - 1, x + r); j++) if (src[j] >= 0) near.push(src[j])
        return f(near)
      })
    const med = win(outerTop, (v) => v.sort((a, b) => a - b)[v.length >> 1])
    outerTop.set(win(med, (v) => v.reduce((a, b) => a + b, 0) / v.length))
  }
  const grow = 0
  const xs = Math.max(0, x0 - grow)
  const xe = Math.min(W - 1, x0 + bottom.length - 1 + grow)
  const end = new Float32Array(xe - xs + 1)
  for (let x = xs; x <= xe; x++) {
    const own = x >= x0 && x < x0 + bottom.length ? bottom[x - x0] : -1
    const t = outerTop[x]
    // ai lati il cappuccio scende sempre meno: il profilo si chiude con una curva, non con un taglio
    const edge = Math.min(x - xs, xe - x) / Math.max(1, 0.035 * W)
    const k = Math.min(1, edge)
    const depth = overlap * k * k * (3 - 2 * k)
    if (kind === 'hood') {
      // steso sul colletto, ma mai più del 3% sotto la fine della sua parte stretta: sulle spalle il
      // bordo dei capi sopra è più in basso e il cappuccio ci scenderebbe come due ali
      // e il limite è un arco su tutta la larghezza: al centro il 3% sotto, verso i lati risale fino
      // alla fine della parte stretta (niente bordo dritto dove la pelliccia è bassa)
      const a = Math.min(1, Math.min(x - xs, xe - x) / Math.max(1, 0.5 * (xe - xs)))
      end[x - xs] = t >= 0 ? Math.min(t + depth, endRow + 0.03 * H * a * a * (3 - 2 * a)) : own
    } else {
      // colletto, nelle colonne del collo: esce sopra il colletto dei capi sopra senza portarsi dietro
      // il davanti della felpa (al massimo il 3% sotto il loro bordo alto); le punte restano intere
      // (dove c'è il bordino il colletto arriva fino a lui: sono le punte del bavero)
      // e almeno poco sotto il loro bordo alto: tra la base del colletto e uno scollo più basso (un
      // girocollo) non resta un buco con la pelle
      const inNeck = neck && x >= neck[0] && x <= neck[1] && !piped?.[x - x0]
      end[x - xs] = inNeck && t >= 0 && own >= 0 ? Math.min(Math.max(own, t + 0.012 * H), t + 0.03 * H) : own
      // polo sotto uno scollo tondo (girocollo): ai lati il colletto non copre lo scollo, si ferma appena
      // sotto il suo bordo alto; al centro le punte scendono sopra lo scollo
      if (crew && t >= 0 && end[x - xs] >= 0 && neck) {
        // le punte: un V sotto il bordo dello scollo, profondo il 2,5% dell'altezza al centro e largo il
        // 5% della larghezza per lato
        const tip = Math.max(0, 1 - Math.abs(x - (neck[0] + neck[1]) / 2) / (0.05 * W))
        end[x - xs] = Math.min(end[x - xs], t + 0.012 * H + 0.025 * H * tip)
      }
    }
  }
  if (kind === 'hood') {
    // l'orlo del cappuccio è una curva unica: via angoli e tratti dritti (media sul 4% della larghezza)
    const r = Math.max(2, Math.round(0.04 * W))
    const src = Float32Array.from(end)
    for (let i = 0; i < end.length; i++) {
      if (src[i] < 0) continue
      let sum = 0
      let n = 0
      for (let j = Math.max(0, i - r); j <= Math.min(end.length - 1, i + r); j++) {
        if (src[j] < 0) continue
        sum += src[j]
        n++
      }
      end[i] = sum / n
    }
  }
  if (kind === 'collar' && neck) {
    // le estremità del colletto si chiudono sul bordo dei capi sopra con una curva, non con un taglio
    // dritto: nelle colonne del collo vicine alla fine del colletto (2,5% della larghezza) scende sempre meno
    const n = end.length
    // distanza dalla colonna senza colletto più vicina (o dal bordo)
    const dist = new Float32Array(n)
    let d = 0
    for (let i = 0; i < n; i++) dist[i] = d = end[i] < 0 ? 0 : d + 1
    d = 0
    for (let i = n - 1; i >= 0; i--) {
      d = end[i] < 0 ? 0 : d + 1
      dist[i] = Math.min(dist[i], d)
    }
    for (let i = 0; i < n; i++) {
      const x = i + xs
      const t = outerTop[x]
      if (end[i] < 0 || t < 0 || end[i] <= t || x < neck[0] || x > neck[1] || piped?.[x - x0]) continue
      const k = Math.min(1, dist[i] / Math.max(1, 0.025 * W))
      end[i] = t + (end[i] - t) * k * k * (3 - 2 * k)
    }
  }
  // a piena risoluzione: colonne interpolate, bordo di 2 px
  const S = size / Math.max(W, H)
  const c = makeCanvas(W * S, H * S)
  const ctx = ctx2d(c)
  ctx.fillStyle = '#000'
  const at = (X: number) => {
    const f = Math.min(end.length - 1, Math.max(0, X / S - xs))
    const i = Math.floor(f)
    const j = Math.min(end.length - 1, i + 1)
    // colonne senza colletto (-1): niente, e niente interpolazione verso di loro
    if (end[i] < 0) return -1
    if (end[j] < 0) return end[i] * S
    return (end[i] + (end[j] - end[i]) * (f - i)) * S
  }
  const y0 = top * S
  for (let X = Math.floor(xs * S); X < Math.ceil((xs + end.length) * S); X++) {
    const b = at(X)
    if (b <= y0) continue
    ctx.globalAlpha = 1
    ctx.fillRect(X, y0, 1, Math.max(0, b - 2 - y0))
    ctx.globalAlpha = 0.66
    ctx.fillRect(X, b - 2, 1, 1)
    ctx.globalAlpha = 0.33
    ctx.fillRect(X, b - 1, 1, 1)
  }
  return c
}

/**
 * Collo alto aperto (le punte di una polo) sopra un capo con lo scollo più basso (un girocollo): tra le
 * punte lo strato è aperto e lì si vedrebbe il bordo del capo sopra, come un triangolo scuro sotto il
 * mento. Qui la foto del corpo ritagliata su quel buco (dove c'è il colletto ma lo strato è vuoto), nel
 * fotogramma dei livelli: si disegna sopra i capi esterni, sotto il colletto. Solo per un colletto senza
 * bordino a contrasto. null se non serve.
 */
export async function collarHole(bodyUrl: string, url: string, shoulder: number, above: string[], size = 1200): Promise<HTMLCanvasElement | null> {
  // solo un colletto senza bordino a contrasto (polo, camicia): con le punte del bavero (una felpa
  // con la zip) tra le punte c'è il colletto dei capi sopra, che resta
  const shape = await shapeOf(url, shoulder)
  if (shape?.kind !== 'collar' || (!shape.soft && shape.piped?.some((v) => v))) return null
  const mask = await hoodMask(url, shoulder, above, size)
  if (!mask) return null
  const W = mask.width
  const H = mask.height
  const ctx = ctx2d(mask)
  ctx.globalAlpha = 1
  // via dove lo strato c'è: resta il buco tra le punte
  const layer = await bitmapOf(url, size)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(layer, 0, 0, W, H)
  layer.close()
  const d = ctx.getImageData(0, 0, W, H).data
  let n = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++
  if (n < 0.0004 * W * H) {
    releaseCanvas(mask)
    return null
  }
  // la foto, al suo posto nel fotogramma dei livelli (con il margine)
  const body = await bitmapOf(bodyUrl, size)
  const margin = ON_ME_PAD * Math.max(body.width, body.height)
  const pad = margin * (W / (body.width + 2 * margin))
  ctx.globalCompositeOperation = 'source-in'
  ctx.drawImage(body, pad, pad, W - 2 * pad, H - 2 * pad)
  ctx.globalCompositeOperation = 'source-over'
  body.close()
  return mask
}

/**
 * Dove si vede uno strato che ha sopra questi livelli (null se sopra non c'è niente).
 * inside: lo strato è tenuto dentro i capi sopra e non esce sotto il loro orlo (per colonne, l'orlo
 * più basso tra i capi sopra; ganci e lacci stretti non contano).
 */
export async function coverMask(above: string[], inside = false, self?: string): Promise<HTMLCanvasElement | null> {
  if (!above.length) return null
  const extents = await Promise.all(above.map(layerExtent))
  const masks = extents.map((e) => e.mask)
  const c = makeCanvas(masks[0].width, masks[0].height)
  const ctx = ctx2d(c)
  ctx.drawImage(masks[0], 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  for (const m of masks.slice(1)) ctx.drawImage(m, 0, 0, c.width, c.height)
  const W = c.width
  const H = c.height
  const hem = hemOf(extents, W)
  // fin dove si vede lo strato, per colonna: dentro, fino all'orlo dei capi sopra; fuori, tutto, ma un
  // orlo che sporge solo di un filo (meno dell'1,2% dell'altezza) sembra un difetto e si nasconde
  const limit = new Float32Array(W).fill(H)
  if (inside) {
    for (let x = 0; x < W; x++) if (hem[x] >= 0) limit[x] = hem[x] + 1
  } else if (self) {
    const own = await layerExtent(self)
    const k = own.colBottom.length / W
    // l'orlo più basso nei dintorni (5% della larghezza per lato): sui fianchi l'orlo dei capi sopra
    // risale con il loro bordo, e uno strato sotto un po' più largo spunterebbe a pezzetti ai lati
    // (o nell'apertura di una giacca, sotto il lembo); conta quanto esce sotto l'orlo vero, e si taglia
    // lì (sopra, fuori dai capi, lo nasconde già la regola per righe)
    const r = Math.round(0.05 * W)
    const low = new Float32Array(W).fill(-1)
    const bot = new Float32Array(W).fill(-1)
    const out: number[] = []
    for (let x = 0; x < W; x++) {
      if (hem[x] < 0) continue
      let l = hem[x]
      for (let j = Math.max(0, x - r); j <= Math.min(W - 1, x + r); j++) if (hem[j] > l) l = hem[j]
      low[x] = l
      const b = own.colBottom[Math.min(own.colBottom.length - 1, Math.floor(x * k))]
      bot[x] = b < 0 ? -1 : b / k
      // solo il busto: le maniche corte finiscono molto più su dell'orlo e non contano
      if (bot[x] >= hem[x] - 0.05 * H) out.push(Math.max(0, bot[x] - l))
    }
    // la fascia che esce sotto l'orlo è tutta o niente: se lungo l'orlo esce (mediana) meno del 2,5%
    // dell'altezza è un difetto della generazione (una striscia, o pezzi qua e là) e si nasconde tutta;
    // altrimenti si vede intera (via solo i pezzetti di un filo, meno dell'1%)
    out.sort((a, b) => a - b)
    const band = out.length > 0 && out[out.length >> 1] >= 0.025 * H
    for (let x = 0; x < W; x++) {
      if (low[x] < 0 || bot[x] <= hem[x]) continue
      if (!band || bot[x] - low[x] < 0.01 * H) limit[x] = low[x] + 1
    }
  }
  if (inside || self) {
    const keep = makeCanvas(W, H)
    const kctx = ctx2d(keep)
    kctx.fillStyle = '#000'
    for (let x = 0; x < W; x++) kctx.fillRect(x, 0, 1, limit[x])
    ctx.drawImage(keep, 0, 0)
    releaseCanvas(keep)
  }
  return c
}

/**
 * L'orlo dei capi sopra, per colonna: per ognuno l'orlo più basso, con l'apertura di una giacca aperta
 * riempita dai due lembi accanto e ganci e lacci ignorati; poi il più alto tra i capi (quello del capo
 * che copre davvero: una maglia dentro una felpa non esce sotto la felpa anche se la giacca è più lunga).
 */
function hemOf(extents: Extent[], W: number): Float32Array {
  const one = (e: Extent) => {
    const k = e.colBottom.length / W
    const bottom = Float32Array.from({ length: W }, (_, x) => {
      const v = e.colBottom[Math.min(e.colBottom.length - 1, Math.floor(x * k))]
      return v < 0 ? -1 : v / k
    })
    // un orlo più basso solo in poche colonne (un gancio, i lacci) non conta: mediana larga
    const r = Math.max(3, Math.round(W * 0.03))
    const median = (src: Float32Array) =>
      Float32Array.from(src, (v, x) => {
        if (v < 0) return -1
        const near: number[] = []
        for (let j = Math.max(0, x - r); j <= Math.min(W - 1, x + r); j++) if (src[j] >= 0) near.push(src[j])
        near.sort((p, q) => p - q)
        return near[near.length >> 1]
      })
    const even = median(bottom)
    // giacca aperta: nelle colonne dell'apertura l'orlo non c'è (o c'è solo la punta del colletto, molto
    // più in alto): si prende quello dei due lembi accanto, il più basso entro il 12% della larghezza per
    // lato. Dopo la mediana: i lacci sono già spariti e tra due lacci l'orlo resta quello vero.
    const R = Math.round(W * 0.12)
    const filled = Float32Array.from(even, (v, x) => {
      let lf = -1
      let rt = -1
      for (let j = Math.max(0, x - R); j < x; j++) lf = Math.max(lf, even[j])
      for (let j = x + 1; j <= Math.min(W - 1, x + R); j++) rt = Math.max(rt, even[j])
      if (lf < 0 || rt < 0) return v
      return Math.max(v, Math.min(lf, rt))
    })
    // e di nuovo la mediana: l'orlo riempito resta senza scalini ai bordi dell'apertura
    return median(filled)
  }
  const hem = new Float32Array(W).fill(-1)
  for (const e of extents) {
    const h = one(e)
    for (let x = 0; x < W; x++) if (h[x] >= 0) hem[x] = hem[x] < 0 ? h[x] : Math.min(hem[x], h[x])
  }
  return hem
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
