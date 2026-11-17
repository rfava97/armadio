import { canvasToBlob, ctx2d, drawScaled } from './canvas'

const MAX_SIDE = 1000
const THUMB_SIDE = 400
const TARGET_BYTES = 200 * 1024

let nativeWebp: boolean | null = null

async function supportsNativeWebp(): Promise<boolean> {
  if (nativeWebp === null) {
    const c = document.createElement('canvas')
    c.width = c.height = 2
    try {
      nativeWebp = (await canvasToBlob(c, 'image/webp', 0.8)).type === 'image/webp'
    } catch {
      nativeWebp = false
    }
  }
  return nativeWebp
}

/** WebP con trasparenza. Safari (iPhone) non codifica WebP dal canvas → encoder WASM caricato al bisogno. */
async function toWebp(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  if (await supportsNativeWebp()) return canvasToBlob(c, 'image/webp', quality)
  const { encode } = await import('@jsquash/webp')
  const data = ctx2d(c).getImageData(0, 0, c.width, c.height)
  const buf = await encode(data, { quality: Math.round(quality * 100) })
  return new Blob([buf], { type: 'image/webp' })
}

export type EncodedGarment = { image: Blob; thumb: Blob }

/** Immagine principale (lato lungo 1000px, q 0.85, < 200 KB se possibile) + miniatura 400px. */
export async function encodeGarment(src: HTMLCanvasElement): Promise<EncodedGarment> {
  const main = drawScaled(src, MAX_SIDE)
  let image = await toWebp(main, 0.85)
  for (const q of [0.75, 0.65]) {
    if (image.size <= TARGET_BYTES) break
    image = await toWebp(main, q)
  }
  const thumb = await toWebp(drawScaled(src, THUMB_SIDE), 0.8)
  return { image, thumb }
}

/** Foto del corpo: lato lungo 1400px (serve precisione per la calibrazione), WebP con trasparenza. */
export async function encodeBodyPhoto(src: HTMLCanvasElement): Promise<Blob> {
  const main = drawScaled(src, 1400)
  let image = await toWebp(main, 0.85)
  for (const q of [0.75, 0.65]) {
    if (image.size <= 400 * 1024) break
    image = await toWebp(main, q)
  }
  return image
}

/** Immagine generata da "Provalo su di me": WebP lato lungo 1400px per i preferiti. */
export async function encodeRender(src: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(src)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  ctx2d(c).drawImage(bmp, 0, 0)
  bmp.close()
  return toWebp(drawScaled(c, 1400), 0.85)
}

/** Livello "Su di me" (capo ritagliato dalla foto generata): WebP con trasparenza. */
export async function encodeLayer(src: HTMLCanvasElement): Promise<Blob> {
  return toWebp(drawScaled(src, 1400), 0.85)
}
