import { useEffect, useState } from 'react'
import { previewBitmap, renderAdjusted, type AdjustGuide, type LayerAdjust, type OnMeCategory } from '@/lib/onMe'

/**
 * Anteprima della correzione: il livello (rimpicciolito) ridisegnato a ogni movimento dei cursori
 * in un canvas, che il palco mostra al posto del capo attivo.
 */
export function useAdjustPreview(url: string | undefined, guide: AdjustGuide | null, category: OnMeCategory | null, value: LayerAdjust) {
  const [loaded, setLoaded] = useState<{ url: string; bmp: ImageBitmap } | null>(null)
  const [canvas] = useState(() => {
    const c = document.createElement('canvas')
    c.style.cssText = 'display:block;width:100%;height:100%'
    return c
  })
  useEffect(() => {
    if (!url) return
    let cancelled = false
    let bmp: ImageBitmap | null = null
    previewBitmap(url)
      .then((b) => {
        if (cancelled) b.close()
        else {
          bmp = b
          setLoaded({ url, bmp: b })
        }
      })
      .catch((e) => console.error(e))
    return () => {
      cancelled = true
      bmp?.close()
    }
  }, [url])
  const bmp = loaded && loaded.url === url ? loaded.bmp : null
  useEffect(() => {
    if (bmp && guide && category) renderAdjusted(bmp, value, guide, category, canvas)
  }, [bmp, guide, category, value, canvas])
  return bmp && guide && category ? canvas : null
}
