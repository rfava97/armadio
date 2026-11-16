import { useEffect, useState } from 'react'
import { canvasToBlob } from './canvas'

/** URL oggetto per mostrare un canvas in un <img>. */
export function useCanvasUrl(canvas: HTMLCanvasElement | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!canvas) return
    let revoked = false
    let u: string | null = null
    canvasToBlob(canvas, 'image/png').then((b) => {
      if (revoked) return
      u = URL.createObjectURL(b)
      setUrl(u)
    })
    return () => {
      revoked = true
      if (u) URL.revokeObjectURL(u)
      setUrl(null)
    }
  }, [canvas])
  return url
}
