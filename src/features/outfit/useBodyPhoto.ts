import { useEffect, useState } from 'react'
import { ctx2d, makeCanvas } from '@/lib/image/canvas'
import { keepMainParts } from '@/lib/image/components'

export type PreparedBody = { url: string; aspect: number }

/**
 * Foto del corpo pronta per il camerino: tolti i puntini rimasti dalla scontornatura.
 * Le dimensioni restano quelle della foto, così i livelli "su di me" combaciano.
 */
export function usePreparedBody(src: string | null | undefined) {
  const [state, setState] = useState<{ src: string; body: PreparedBody } | null>(null)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    let url: string | null = null
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      const w = img.naturalWidth
      const h = img.naturalHeight
      const c = makeCanvas(w, h)
      ctx2d(c).drawImage(img, 0, 0)
      try {
        keepMainParts(c, 0.2)
      } catch {
        /* pixel non leggibili: uso la foto così com'è */
      }
      c.toBlob((b) => {
        if (cancelled) return
        url = b ? URL.createObjectURL(b) : src
        setState({ src, body: { url, aspect: w / h } })
      }, 'image/png')
    }
    img.src = src
    return () => {
      cancelled = true
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }, [src])

  return state && state.src === src ? state.body : null
}
