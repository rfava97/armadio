import { useEffect, useState } from 'react'
import { coverMask } from '@/lib/onMe'
import { releaseCanvas } from '@/lib/image/canvas'

/**
 * Maschere degli strati del busto "su di me" (dal più interno al più esterno): per ogni strato, dove
 * resta visibile sotto quelli sopra. Immagini (data URL) per la mask-image CSS; l'ultimo non ne ha.
 */
export function useCoverMasks(urls: string[]): (string | undefined)[] {
  const key = urls.join('\n')
  const [masks, setMasks] = useState<{ key: string; list: (string | undefined)[] }>({ key: '', list: [] })
  useEffect(() => {
    const list = key ? key.split('\n') : []
    if (list.length < 2) return
    let cancelled = false
    Promise.all(
      list.map(async (_, i) => {
        const c = await coverMask(list.slice(i + 1))
        if (!c) return undefined
        const url = c.toDataURL('image/png')
        releaseCanvas(c)
        return url
      }),
    )
      .then((out) => !cancelled && setMasks({ key, list: out }))
      .catch((e) => console.error(e))
    return () => {
      cancelled = true
    }
  }, [key])
  return masks.key === key ? masks.list : []
}
