import { useEffect, useRef, useState } from 'react'
import { releaseCanvas } from '@/lib/image/canvas'
import { previewBitmap, renderAdjusted, type AdjustGuide, type LayerAdjust, type OnMeCategory } from '@/lib/onMe'

/**
 * Anteprima della correzione: il livello (rimpicciolito) ridisegnato quando si muovono i cursori in
 * un canvas, che il palco mostra al posto del capo attivo. Al massimo un disegno per fotogramma
 * (i cursori mandano molti eventi: sul telefono si intaserebbe) e sempre sugli stessi due canvas.
 */
export function useAdjustPreview(url: string | undefined, guide: AdjustGuide | null, category: OnMeCategory | null, value: LayerAdjust) {
  const [loaded, setLoaded] = useState<{ url: string; bmp: ImageBitmap } | null>(null)
  const [canvas] = useState(() => {
    const c = document.createElement('canvas')
    c.style.cssText = 'display:block;width:100%;height:100%'
    return c
  })
  const [scratch] = useState(() => document.createElement('canvas'))
  const frame = useRef(0)

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

  // chiusa la correzione, la memoria dei canvas torna libera
  useEffect(
    () => () => {
      releaseCanvas(canvas)
      releaseCanvas(scratch)
    },
    [canvas, scratch],
  )

  const bmp = loaded && loaded.url === url ? loaded.bmp : null
  useEffect(() => {
    if (!bmp || !guide || !category) return
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      try {
        renderAdjusted(bmp, value, guide, category, canvas, scratch)
      } catch (e) {
        console.error(e)
      }
    })
  }, [bmp, guide, category, value, canvas, scratch])
  return bmp && guide && category ? canvas : null
}
