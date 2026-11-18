import { ctx2d, makeCanvas } from './image/canvas'
import { keepMainParts } from './image/components'
import { ON_ME_PAD, type OnMeCategory } from './onMe'

/**
 * Esperimento "Su di me con Gemini" (alternativa a FASHN, anche quando la sua quota è finita).
 * A Gemini non va la tua foto ma la tua SAGOMA (figura verde uniforme, stesse proporzioni e posa)
 * e la foto del capo: veste la sagoma solo con quel capo e la lascia verde dove il capo non la copre.
 * All'import l'app toglie lo sfondo, allinea tutta la figura alla sagoma e toglie il verde: resta il
 * capo, salvato come livello "Su di me".
 *
 * Il fotogramma è lo stesso dei livelli di FASHN: la foto del corpo con ON_ME_PAD di margine.
 */

const LONG_SIDE = 1024
/** verde "chroma key": raro nei vestiti, facile da togliere */
const GREEN = [0, 177, 64]

type Frame = { canvas: HTMLCanvasElement; pad: number; bw: number; bh: number }

/** Sagoma verde su bianco, nel fotogramma dei livelli. */
export async function makeSilhouette(bodyUrl: string): Promise<Frame> {
  const body = await createImageBitmap(await (await fetch(bodyUrl)).blob())
  const k = Math.min(1, LONG_SIDE / Math.max(body.width, body.height))
  const bw = Math.round(body.width * k)
  const bh = Math.round(body.height * k)
  const pad = Math.round(Math.max(bw, bh) * ON_ME_PAD)
  const c = makeCanvas(bw + pad * 2, bh + pad * 2)
  const ctx = ctx2d(c)
  ctx.drawImage(body, pad, pad, bw, bh)
  body.close()
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  let opaque = 0
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] > 128
    if (on) opaque++
    d[i] = on ? GREEN[0] : 255
    d[i + 1] = on ? GREEN[1] : 255
    d[i + 2] = on ? GREEN[2] : 255
    d[i + 3] = 255
  }
  // foto non scontornata: niente sagoma possibile
  if (opaque > (bw * bh) * 0.9) throw Object.assign(new Error('Serve la tua foto scontornata: rifalla nel Profilo.'), { userFacing: true })
  ctx.putImageData(img, 0, 0)
  return { canvas: c, pad, bw, bh }
}

const HOW: Record<string, string> = {
  aperta: 'open (fully unzipped / unbuttoned), the two front panels hanging loose; it must be green under the opened zip',
  aperto: 'open (fully unzipped / unbuttoned), the two front panels hanging loose; it must be green under the opened zip',
  chiusa: 'closed (fully zipped / buttoned)',
  chiuso: 'closed (fully zipped / buttoned)',
}

/**
 * Prompt per vestire la sagoma verde con il capo: è il testo che ha funzionato con Gemini, da non
 * ritoccare (parole come "corpo" o "taglia" gli fanno disegnare una persona).
 */
export function geminiShapePrompt(kind: string, howIt: string): string {
  const how = HOW[howIt.trim().toLowerCase()] ?? (howIt.trim() || 'as it is normally worn')
  return [
    'Image 1 is a flat green mannequin silhouette seen from the front, on a white background. Image 2 is a garment.',
    `Dress the green mannequin with ONLY this ${kind}, worn like this: ${how}.`,
    'Fit it to the mannequin exactly: same pose, shoulders, neck, arms, torso, waist and legs, with a realistic fit, natural folds and drape (do not make loose or oversized garments tight). The collar sits around the neck, below the chin; the cuffs end at the wrists.',
    'Wherever the garment does not cover the mannequin (head, neck, inside of the collar, open front, hands, legs) keep the mannequin exactly the same flat green as in image 1. Do not draw a person, skin, face, hands or shadows on the mannequin.',
    'Reproduce the garment exactly: colour, fabric, texture, logos, prints, zips, buttons and details. The inside of the garment (lining, back of the collar) may be visible where it naturally would.',
    'Do not move, resize or crop the mannequin: same canvas size, framing and position as image 1. Plain white background, no shadows.',
    'Output: one single image.',
  ].join('\n\n')
}

const toFile = (c: HTMLCanvasElement, name: string, type: string) =>
  new Promise<File>((ok, ko) => c.toBlob((b) => (b ? ok(new File([b], name, { type })) : ko(new Error('Immagine non valida'))), type, 0.92))

/**
 * Copia il prompt e apre la condivisione dell'iPhone con la sagoma e la foto del capo (da mandare a
 * Gemini). Senza condivisione di file (computer) le scarica. Va chiamata dal tocco su un pulsante.
 */
export async function shareForGeminiShape(sil: HTMLCanvasElement, garmentUrl: string, prompt: string) {
  await navigator.clipboard?.writeText(prompt).catch(() => undefined)
  const g = await createImageBitmap(await (await fetch(garmentUrl)).blob())
  const gc = makeCanvas(g.width, g.height)
  const gctx = ctx2d(gc)
  gctx.fillStyle = '#ffffff'
  gctx.fillRect(0, 0, gc.width, gc.height)
  gctx.drawImage(g, 0, 0)
  g.close()
  const files = [await toFile(sil, '1-sagoma.png', 'image/png'), await toFile(gc, '2-capo.jpg', 'image/jpeg')]
  if (navigator.canShare?.({ files })) {
    await navigator.share({ files })
    return
  }
  for (const f of files) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(f)
    a.download = f.name
    a.click()
    URL.revokeObjectURL(a.href)
  }
}

const maskOf = (c: HTMLCanvasElement, test: (d: Uint8ClampedArray, i: number) => boolean) => {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data
  const m = new Uint8Array(c.width * c.height)
  for (let i = 0; i < m.length; i++) m[i] = test(d, i * 4) ? 1 : 0
  return m
}

/**
 * Dall'immagine di Gemini al livello "Su di me": sfondo tolto, capo allineato alla sagoma
 * (piccole correzioni di scala e posizione) nella zona del capo.
 * split: linea busto/gambe in frazione dell'altezza della foto del corpo.
 */
export async function importGeminiShape(
  file: Blob,
  bodyUrl: string,
  category: OnMeCategory,
  split: number,
  removeBg: (c: HTMLCanvasElement) => Promise<HTMLCanvasElement>,
): Promise<HTMLCanvasElement> {
  const frame = await makeSilhouette(bodyUrl)
  const W = frame.canvas.width
  const H = frame.canvas.height
  const splitFrac = (frame.pad + split * frame.bh) / H

  // l'immagine di Gemini nel fotogramma (se il formato è quasi uguale la stiro, se no la centro)
  const out = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const raw = makeCanvas(W, H)
  const rctx = ctx2d(raw)
  rctx.fillStyle = '#ffffff'
  rctx.fillRect(0, 0, W, H)
  if (Math.abs(out.width / out.height - W / H) < 0.06) rctx.drawImage(out, 0, 0, W, H)
  else {
    const s = Math.min(W / out.width, H / out.height)
    rctx.drawImage(out, (W - out.width * s) / 2, (H - out.height * s) / 2, out.width * s, out.height * s)
  }
  out.close()

  // via lo sfondo bianco (stesso scontorno dei capi): resta la figura, cioè sagoma verde + capo
  const cut = await removeBg(raw)
  const figure = makeCanvas(W, H)
  ctx2d(figure).drawImage(cut, 0, 0, W, H)

  // allineamento: scala e spostamento che fanno combaciare TUTTA la figura con la sagoma
  const N = 96
  const small = (c: HTMLCanvasElement) => {
    const s = makeCanvas(Math.round((N * W) / Math.max(W, H)), Math.round((N * H) / Math.max(W, H)))
    ctx2d(s).drawImage(c, 0, 0, s.width, s.height)
    return s
  }
  const sil = small(frame.canvas)
  const sw = sil.width
  const sh = sil.height
  const S = maskOf(sil, (d, i) => d[i] < 200)
  const F = maskOf(small(figure), (d, i) => d[i + 3] > 128)
  // la zona del capo pesa di più: è lì che l'allineamento deve essere preciso
  const splitRow = Math.round(splitFrac * sh)
  const weight = (y: number) => ((category === 'tops' ? y < splitRow + sh * 0.05 : y >= splitRow - sh * 0.02) ? 2 : 1)
  const cx = sw / 2
  const cy = sh / 2
  let best = { score: -1, s: 1, dx: 0, dy: 0 }
  for (let s = 0.86; s <= 1.141; s += 0.02) {
    for (let dy = -0.08; dy <= 0.0801; dy += 0.01) {
      for (let dx = -0.06; dx <= 0.0601; dx += 0.01) {
        let inter = 0
        let union = 0
        for (let y = 0; y < sh; y++) {
          const wgt = weight(y)
          for (let x = 0; x < sw; x++) {
            // dove finisce questo pixel della sagoma nella figura trasformata (trasformazione inversa)
            const fx = Math.round(cx + (x - cx - dx * sw) / s)
            const fy = Math.round(cy + (y - cy - dy * sh) / s)
            const f = fx >= 0 && fy >= 0 && fx < sw && fy < sh ? F[fy * sw + fx] : 0
            const b = S[y * sw + x]
            if (f && b) inter += wgt
            if (f || b) union += wgt
          }
        }
        const score = union ? inter / union : 0
        if (score > best.score) best = { score, s, dx, dy }
      }
    }
  }

  const layer = makeCanvas(W, H)
  const lctx = ctx2d(layer)
  lctx.translate(W / 2 + best.dx * W, H / 2 + best.dy * H)
  lctx.scale(best.s, best.s)
  lctx.drawImage(figure, -W / 2, -H / 2)
  lctx.setTransform(1, 0, 0, 1, 0, 0)

  // via il verde della sagoma; sul bordo tolgo il riflesso verde rimasto sul capo
  const img = lctx.getImageData(0, 0, W, H)
  const d = img.data
  const keyed = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4]
    const g = d[i * 4 + 1]
    const b = d[i * 4 + 2]
    // verde pieno e sfumature verde-bianco o verde-capo sul bordo (salvia e oliva restano)
    if (g > 80 && g > r + 45 && g > b + 25) {
      keyed[i] = 1
      d[i * 4 + 3] = 0
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (keyed[i] || d[i * 4 + 3] === 0) continue
    const x = i % W
    const near = [i - 1, i + 1, i - W, i + W, i - 2, i + 2, i - 2 * W, i + 2 * W].some(
      (j) => j >= 0 && j < W * H && Math.abs((j % W) - x) <= 2 && keyed[j],
    )
    if (!near) continue
    const m = Math.max(d[i * 4], d[i * 4 + 2])
    if (d[i * 4 + 1] > m) d[i * 4 + 1] = m
  }
  lctx.putImageData(img, 0, 0)
  // via i puntini rimasti: restano le parti del capo (anche separate, come i due lati di una giacca aperta)
  keepMainParts(layer, 0.05, 100)
  return layer
}
