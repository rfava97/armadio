import type { Garment } from './garments'
import type { Anchors } from './mannequin'
import { ctx2d, makeCanvas } from './image/canvas'
import { flatten } from './tryon'

/**
 * "Prova con Gemini" (sperimentale): niente API. L'app prepara le foto e un prompt, l'utente li
 * condivide con l'app Gemini (gratuita) e poi importa il risultato. Gemini ridisegna tutta
 * l'immagine: all'import il viso viene rimesso dalla foto originale quando l'inquadratura combacia.
 */

const KIND: Record<string, string> = {
  maglie: 'top',
  camicie: 'shirt',
  canotte: 'tank top',
  felpe_maglioni: 'sweatshirt / sweater',
  giacche_cappotti: 'jacket / coat',
  pantaloni: 'trousers',
  jeans: 'jeans',
  scarpe: 'shoes',
}

export type GeminiItem = { garment: Garment; url: string }

/** Prompt in inglese (Gemini lo segue meglio); le note di vestibilità restano come le scrive l'utente. */
export function geminiPrompt(items: Garment[], notes: string): string {
  const lines = items.map((g, i) => {
    const worn = g.fit_photo_path ? ' — shown worn by another person: copy only the garment and the way it fits, not the person' : ''
    return `- Image ${i + 2}: ${KIND[g.category] ?? 'garment'} "${g.name}"${worn}`
  })
  const shoes = items.some((g) => g.category === 'scarpe')
  const layered = items.filter((g) => g.zone === 'busto').length > 1
  return [
    'Virtual try-on, photorealistic.',
    'Image 1 is a full-body photo of me. The other images are clothes from my wardrobe:',
    ...lines,
    '',
    'Dress me in these clothes.' + (layered ? ' Layer the upper-body garments in the order listed (first = innermost).' : ''),
    '',
    'Keep EXACTLY as in image 1: my face, hair, skin tone, body shape and proportions, height, pose, arm and leg position, framing, camera angle, lighting and the plain light background. Do not slim, bulk up, retouch or beautify me. Same image size and composition as image 1.',
    '',
    "Clothes: reproduce colour, fabric, texture, logos, prints and details exactly as in the reference images. Realistic fit with natural folds and drape, true to each garment's real cut: do not make loose or oversized garments tight.",
    notes.trim() ? `How I want to wear them: ${notes.trim()}` : '',
    shoes ? '' : 'Feet: keep them exactly as in image 1.',
    '',
    'Output: one single full-body image.',
  ]
    .filter((l, i, all) => !(l === '' && all[i - 1] === ''))
    .join('\n')
    .trim()
}

const dataUrlToFile = async (dataUrl: string, name: string) =>
  new File([await (await fetch(dataUrl)).blob()], name, { type: 'image/jpeg' })

/**
 * Copia il prompt e apre la condivisione dell'iPhone con la tua foto e i capi (la foto indossata,
 * se c'è). Va chiamata direttamente dal tocco su un pulsante.
 */
export async function shareWithGemini(bodyUrl: string, items: GeminiItem[], prompt: string): Promise<'shared' | 'copied'> {
  await navigator.clipboard?.writeText(prompt).catch(() => undefined)
  const files = [
    await dataUrlToFile(await flatten(bodyUrl, '#f3f1ec', 1280), '1-io.jpg'),
    ...(await Promise.all(items.map(async (it, i) => dataUrlToFile(await flatten(it.url, '#ffffff', 1024), `${i + 2}-capo.jpg`)))),
  ]
  if (navigator.canShare?.({ files })) {
    await navigator.share({ files, text: prompt })
    return 'shared'
  }
  // computer senza condivisione di file: scarico le foto
  for (const f of files) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(f)
    a.download = f.name
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return 'copied'
}

/** Riquadro della testa nella foto inviata a Gemini (frazioni dell'immagine con il margine). */
function headBox(a: Anchors, w: number, h: number, pad: number) {
  const sd = Math.hypot((a.shoulder_r.x - a.shoulder_l.x) * w, (a.shoulder_r.y - a.shoulder_l.y) * h)
  const cx = pad + a.neck.x * w
  const neck = pad + a.neck.y * h
  const half = sd * 0.42
  return { x: cx - half, y: Math.max(0, neck - sd * 1.05), w: half * 2, h: Math.min(neck, sd * 1.05) }
}

export type GeminiImport = { blob: Blob; restored: boolean; note: string | null }

/**
 * Importa l'immagine di Gemini. Cerca la tua testa nel risultato (piccoli spostamenti e scale):
 * se combacia, rimette il tuo viso originale; se no, avvisa che Gemini potrebbe averti cambiato.
 */
export async function importGeminiResult(file: Blob, bodyUrl: string, anchors: Anchors | null | undefined): Promise<GeminiImport> {
  const out = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const bodyBlob = await (await fetch(bodyUrl)).blob()
  const body = await createImageBitmap(bodyBlob)
  try {
    // stessa composizione inviata: foto del corpo con il 6% di margine, lato lungo 1280
    const k = Math.min(1, 1280 / Math.max(body.width, body.height))
    const bw = Math.round(body.width * k)
    const bh = Math.round(body.height * k)
    const pad = Math.round(Math.max(bw, bh) * 0.06)
    const W = bw + pad * 2
    const H = bh + pad * 2

    // il risultato portato alla stessa grandezza (Gemini a volte cambia formato)
    const res = makeCanvas(W, H)
    const rctx = ctx2d(res)
    rctx.fillStyle = '#f3f1ec'
    rctx.fillRect(0, 0, W, H)
    const s = Math.min(W / out.width, H / out.height)
    rctx.drawImage(out, (W - out.width * s) / 2, (H - out.height * s) / 2, out.width * s, out.height * s)

    const finish = async (restored: boolean, note: string | null): Promise<GeminiImport> => ({
      blob: await new Promise<Blob>((ok, ko) => res.toBlob((b) => (b ? ok(b) : ko(new Error('Immagine non valida'))), 'image/jpeg', 0.92)),
      restored,
      note,
    })

    const aspectOk = Math.abs(out.width / out.height - W / H) < 0.04
    if (!anchors || !aspectOk) {
      return finish(false, 'Gemini ha cambiato il formato della foto: controlla che il tuo aspetto sia rimasto lo stesso.')
    }

    // la tua testa (con la sua sagoma scontornata) dalla foto originale
    const orig = makeCanvas(W, H)
    const octx = ctx2d(orig)
    octx.drawImage(body, pad, pad, bw, bh)
    const hb = headBox(anchors, bw, bh, pad)
    const N = 48
    // confronto in scala di grigi con correlazione normalizzata: regge luce e contrasto diversi
    const sample = (src: HTMLCanvasElement, x: number, y: number, w: number, h: number) => {
      const c = makeCanvas(N, N)
      const cx = ctx2d(c)
      cx.fillStyle = '#f3f1ec'
      cx.fillRect(0, 0, N, N)
      cx.drawImage(src, x, y, w, h, 0, 0, N, N)
      const d = cx.getImageData(0, 0, N, N).data
      const g = new Float32Array(N * N)
      let mean = 0
      for (let i = 0; i < N * N; i++) mean += g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11
      mean /= N * N
      let norm = 0
      for (let i = 0; i < N * N; i++) norm += (g[i] -= mean) ** 2
      return { g, norm: Math.sqrt(norm) || 1 }
    }
    const ref = sample(orig, hb.x, hb.y, hb.w, hb.h)
    let best = { ncc: -1, dx: 0, dy: 0, sc: 1 }
    for (const sc of [0.94, 0.97, 1, 1.03, 1.06]) {
      for (let dy = -0.06; dy <= 0.0601; dy += 0.012) {
        for (let dx = -0.06; dx <= 0.0601; dx += 0.012) {
          const w = hb.w * sc
          const h = hb.h * sc
          const cand = sample(res, hb.x + hb.w / 2 - w / 2 + dx * W, hb.y + hb.h - h + dy * H, w, h)
          let dot = 0
          for (let i = 0; i < N * N; i++) dot += ref.g[i] * cand.g[i]
          const ncc = dot / (ref.norm * cand.norm)
          if (ncc > best.ncc) best = { ncc, dx, dy, sc }
        }
      }
    }
    if (best.ncc < 0.6) {
      return finish(false, 'Gemini ha cambiato posa o inquadratura: il viso non è stato ripristinato, controlla che sia rimasto il tuo.')
    }

    // rimetto la testa originale nella posizione trovata, con il bordo sfumato verso il collo
    const w = hb.w * best.sc
    const h = hb.h * best.sc
    const x = hb.x + hb.w / 2 - w / 2 + best.dx * W
    const y = hb.y + hb.h - h + best.dy * H
    const head = makeCanvas(hb.w, hb.h)
    const hctx = ctx2d(head)
    hctx.drawImage(orig, hb.x, hb.y, hb.w, hb.h, 0, 0, hb.w, hb.h)
    // bordi sfumati: sotto verso il collo, ai lati e in alto (serve se la foto non è scontornata)
    hctx.globalCompositeOperation = 'destination-in'
    const edges: [number, number, number, number, number, number][] = [
      [0, hb.h * 0.78, 0, hb.h, 1, 0],
      [0, 0, 0, hb.h * 0.06, 0, 1],
      [0, 0, hb.w * 0.12, 0, 0, 1],
      [hb.w * 0.88, 0, hb.w, 0, 1, 0],
    ]
    for (const [x0, y0, x1, y1, a0, a1] of edges) {
      const g = hctx.createLinearGradient(x0, y0, x1, y1)
      g.addColorStop(0, `rgba(0,0,0,${a0})`)
      g.addColorStop(1, `rgba(0,0,0,${a1})`)
      hctx.fillStyle = g
      hctx.fillRect(0, 0, hb.w, hb.h)
    }
    rctx.drawImage(head, x, y, w, h)
    return finish(true, best.ncc < 0.8 ? 'Il tuo viso è stato ripristinato; Gemini ha però ritoccato un po’ l’immagine: controlla corpo e proporzioni.' : null)
  } finally {
    out.close()
    body.close()
  }
}
