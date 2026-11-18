import { useEffect, useRef, useState } from 'react'
import { releaseCanvas } from '@/lib/image/canvas'
import { fullBitmap, previewBitmap, renderAdjusted, type AdjustGuide, type LayerAdjust, type OnMeCategory } from '@/lib/onMe'

/**
 * Anteprima della correzione: il livello ridisegnato quando si muovono i cursori in un canvas, che il
 * palco mostra al posto del capo attivo. Mentre il dito si muove, al massimo un disegno per
 * fotogramma su una copia piccola (sul telefono si intaserebbe); a dito fermo, dopo un attimo, a
 * piena risoluzione (la copia piccola ingrandita sembra sgranata). Sempre sugli stessi canvas.
 */
export function useAdjustPreview(url: string | undefined, guide: AdjustGuide | null, category: OnMeCategory | null, value: LayerAdjust) {
  const [loaded, setLoaded] = useState<{ url: string; small: ImageBitmap; full: ImageBitmap | null } | null>(null)
  const [canvas] = useState(() => {
    const c = document.createElement('canvas')
    c.style.cssText = 'display:block;width:100%;height:100%'
    return c
  })
  const [scratch] = useState(() => document.createElement('canvas'))
  const frame = useRef(0)
  const idle = useRef(0)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    const owned: ImageBitmap[] = []
    previewBitmap(url)
      .then((small) => {
        owned.push(small)
        if (cancelled) return
        setLoaded({ url, small, full: null })
        return fullBitmap(url).then((full) => {
          owned.push(full)
          if (!cancelled) setLoaded({ url, small, full })
        })
      })
      .catch((e) => console.error(e))
    return () => {
      cancelled = true
      owned.forEach((b) => b.close())
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

  const bmps = loaded && loaded.url === url ? loaded : null
  useEffect(() => {
    if (!bmps || !guide || !category) return
    const draw = (b: ImageBitmap) => {
      try {
        renderAdjusted(b, value, guide, category, canvas, scratch)
      } catch (e) {
        console.error(e)
      }
    }
    cancelAnimationFrame(frame.current)
    window.clearTimeout(idle.current)
    frame.current = requestAnimationFrame(() => draw(bmps.small))
    if (bmps.full) {
      const full = bmps.full
      idle.current = window.setTimeout(() => draw(full), 250)
    }
    return () => window.clearTimeout(idle.current)
  }, [bmps, guide, category, value, canvas, scratch])
  return bmps && guide && category ? canvas : null
}
