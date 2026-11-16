import { canvasToBlob, ctx2d, drawScaled, loadBitmap, makeCanvas } from './canvas'

const READY_KEY = 'armadio.bg-model-ready'

/** true se il modello di scontornatura è già stato scaricato almeno una volta su questo dispositivo. */
export function bgModelReady(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === '1'
  } catch {
    return false
  }
}

export type Progress = (fraction: number) => void

/**
 * Scontornatura nel browser con @imgly/background-removal (caricata in lazy).
 * Modello quantizzato (~40 MB, circa metà tempo rispetto a fp16) e input ridotto a 1024px,
 * la risoluzione interna del modello: l'immagine salvata è comunque max 1000px.
 */
export async function removeBackground(src: HTMLCanvasElement, onProgress?: Progress): Promise<HTMLCanvasElement> {
  const { removeBackground: run } = await import('@imgly/background-removal')
  const input = await canvasToBlob(drawScaled(src, 1024), 'image/png')
  const blob = await run(input, {
    model: 'isnet_quint8',
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      if (key.startsWith('fetch') && total > 0) onProgress?.(current / total)
    },
  })
  try {
    localStorage.setItem(READY_KEY, '1')
  } catch {
    /* storage non disponibile */
  }
  const bmp = await loadBitmap(blob)
  const out = makeCanvas(bmp.width, bmp.height)
  ctx2d(out).drawImage(bmp, 0, 0)
  bmp.close()
  return out
}
