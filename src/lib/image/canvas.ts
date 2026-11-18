/** Utilità canvas comuni. */

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  // imageOrientation: rispetta l'EXIF delle foto scattate col telefono
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/**
 * Libera subito la memoria di un canvas che non serve più: Safari su iPhone ha un tetto basso per
 * la memoria dei canvas e li libera tardi; oltre il tetto la pagina diventa bianca.
 */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined) {
  if (!c) return
  c.width = 0
  c.height = 0
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D non disponibile')
  return ctx
}

/** Ridimensiona mantenendo le proporzioni con lato lungo <= maxSide (mai ingrandisce). */
export function drawScaled(src: CanvasImageSource & { width: number; height: number }, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height))
  const c = makeCanvas(src.width * scale, src.height * scale)
  const ctx = ctx2d(c)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversione immagine non riuscita'))), type, quality),
  )
}
