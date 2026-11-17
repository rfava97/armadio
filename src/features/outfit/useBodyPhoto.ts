import { useEffect, useState } from 'react'
import { ctx2d, makeCanvas } from '@/lib/image/canvas'
import { keepMainParts } from '@/lib/image/components'
import type { Anchors } from '@/lib/mannequin'
import { detectPose } from '@/lib/pose'
import type { Skeleton } from '@/lib/skeleton'

/** pose: undefined finché la si sta cercando, null se non trovata */
export type PreparedBody = { url: string; aspect: number; hipWidth: number; pose: Skeleton | null | undefined }

/** Larghezza della sagoma sulla riga y, nel tratto opaco che contiene (o è più vicino a) x. */
function widthAt(d: Uint8ClampedArray, w: number, y: number, x: number): number {
  const runs: [number, number][] = []
  let start = -1
  for (let i = 0; i <= w; i++) {
    const on = i < w && d[(y * w + i) * 4 + 3] > 128
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      runs.push([start, i - 1])
      start = -1
    }
  }
  if (!runs.length) return 0
  const dist = ([a, b]: [number, number]) => (x < a ? a - x : x > b ? x - b : 0)
  const [a, b] = runs.reduce((best, r) => (dist(r) < dist(best) ? r : best))
  return b - a + 1
}

/**
 * Foto del corpo pronta per il camerino: tolti i puntini rimasti dalla scontornatura,
 * misurata la larghezza dei fianchi (serve a vestire i pantaloni).
 */
export function usePreparedBody(
  src: string | null | undefined,
  anchors: Anchors | null | undefined,
  /** chiave stabile della foto (percorso nello storage) per non ricalcolare la pose */
  key: string | null | undefined,
  /** riconosce le articolazioni (modalità "Segue il corpo") */
  withPose = true,
) {
  const [state, setState] = useState<{ src: string; body: PreparedBody } | null>(null)

  useEffect(() => {
    if (!src || !anchors) return
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
      let hipWidth = 0
      try {
        keepMainParts(c, 0.2)
        const d = ctx2d(c).getImageData(0, 0, w, h).data
        const y = Math.min(h - 1, Math.round(anchors.hips.y * h))
        hipWidth = widthAt(d, w, y, anchors.hips.x * w) / w
      } catch {
        /* pixel non leggibili: uso la foto così com'è */
      }
      c.toBlob((b) => {
        if (cancelled) return
        url = b ? URL.createObjectURL(b) : src
        const body: PreparedBody = { url, aspect: w / h, hipWidth, pose: undefined }
        setState({ src, body })
        if (!withPose) {
          setState({ src, body: { ...body, pose: null } })
          return
        }
        // gomiti, polsi, anche e ginocchia: riconosciuti nel browser, una volta per foto
        detectPose(key ?? src, c)
          .then((pose) => !cancelled && setState({ src, body: { ...body, pose } }))
          .catch((e) => {
            console.warn('Pose non riconosciuta', e)
            if (!cancelled) setState({ src, body: { ...body, pose: null } })
          })
      }, 'image/png')
    }
    img.src = src
    return () => {
      cancelled = true
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }, [src, anchors, key, withPose])

  return state && state.src === src ? state.body : null
}
