import { useEffect, useState } from 'react'
import { coverMask, hoodMask } from '@/lib/onMe'
import { releaseCanvas } from '@/lib/image/canvas'

type Covers = { masks: (string | undefined)[]; hoods: (string | undefined)[] }
const NONE: Covers = { masks: [], hoods: [] }

/**
 * Strati del busto "su di me" (dal più interno al più esterno):
 * - masks: per ogni strato, dove resta visibile sotto quelli sopra (data URL per la mask-image CSS;
 *   l'ultimo non ne ha);
 * - hoods: per gli strati sotto con un cappuccio, la sua forma (data URL), da disegnare sopra i capi esterni.
 * `shoulder`: riga delle spalle nel fotogramma dei livelli (senza, niente cappucci).
 */
export function useCoverMasks(urls: string[], shoulder: number | undefined): Covers {
  const key = `${shoulder ?? ''}\n${urls.join('\n')}`
  const [covers, setCovers] = useState<{ key: string } & Covers>({ key: '', ...NONE })
  useEffect(() => {
    const [line, ...list] = key.split('\n')
    if (list.length < 2) return
    let cancelled = false
    const top = line ? Number(line) : undefined
    Promise.all([
      Promise.all(
        list.map(async (_, i) => {
          const c = await coverMask(list.slice(i + 1))
          if (!c) return undefined
          const url = c.toDataURL('image/png')
          releaseCanvas(c)
          return url
        }),
      ),
      Promise.all(
        list.map(async (u, i) => {
          if (top === undefined || i === list.length - 1) return undefined
          const c = await hoodMask(u, top)
          if (!c) return undefined
          const url = c.toDataURL('image/png')
          releaseCanvas(c)
          return url
        }),
      ),
    ])
      .then(([masks, hoods]) => !cancelled && setCovers({ key, masks, hoods }))
      .catch((e) => console.error(e))
    return () => {
      cancelled = true
    }
  }, [key])
  return covers.key === key ? covers : NONE
}
