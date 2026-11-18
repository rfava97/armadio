import { useEffect, useState } from 'react'
import { coverMask, hasHood } from '@/lib/onMe'
import { releaseCanvas } from '@/lib/image/canvas'

type Covers = { masks: (string | undefined)[]; hoods: boolean[] }
const NONE: Covers = { masks: [], hoods: [] }

/**
 * Strati del busto "su di me" (dal più interno al più esterno):
 * - masks: per ogni strato, dove resta visibile sotto quelli sopra (data URL per la mask-image CSS;
 *   l'ultimo non ne ha);
 * - hoods: quali strati sotto hanno un cappuccio da disegnare sopra i capi esterni.
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
      Promise.all(list.map((u, i) => (top !== undefined && i < list.length - 1 ? hasHood(u, top) : false))),
    ])
      .then(([masks, hoods]) => !cancelled && setCovers({ key, masks, hoods }))
      .catch((e) => console.error(e))
    return () => {
      cancelled = true
    }
  }, [key])
  return covers.key === key ? covers : NONE
}
