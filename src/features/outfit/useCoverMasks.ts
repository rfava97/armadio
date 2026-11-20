import { useEffect, useState } from 'react'
import { collarHole, coverMask, hoodKind, hoodMask } from '@/lib/onMe'
import { releaseCanvas } from '@/lib/image/canvas'

type Kind = 'hood' | 'collar' | null
type Covers = { masks: (string | undefined)[]; hoods: (string | undefined)[]; holes: (string | undefined)[]; kinds: Kind[] }
const NONE: Covers = { masks: [], hoods: [], holes: [], kinds: [] }

/**
 * Strati del busto "su di me" (dal più interno al più esterno):
 * - masks: per ogni strato, dove resta visibile sotto quelli sopra (data URL per la mask-image CSS;
 *   l'ultimo non ne ha);
 * - hoods: per lo strato subito sotto il più esterno, se ha un cappuccio o un collo alto, la sua forma
 *   (data URL), da disegnare sopra il capo esterno. Più in basso no: il colletto di una polo sotto un
 *   girocollo resta sotto la giacca (spunta, se c'è, quello del capo in mezzo).
 * `shoulder`: riga delle spalle nel fotogramma dei livelli (senza, niente cappucci).
 * - holes: per lo stesso strato, se è un colletto aperto (polo), la foto del corpo tra le punte
 *   (data URL, immagine nel fotogramma dei livelli), da disegnare sopra i capi esterni e sotto il colletto.
 * `body`: la foto del corpo (senza, niente holes).
 * - kinds: per gli strati sotto, se hanno un cappuccio o un collo alto che può spuntare (anche se tenuto dentro).
 * `inside`: per ogni strato, se è tenuto dentro i capi sopra (non esce sotto il loro orlo).
 * `collarIn`: per ogni strato, se il colletto o il cappuccio resta sotto i capi sopra.
 */
export function useCoverMasks(
  urls: string[],
  shoulder: number | undefined,
  inside: boolean[] = [],
  collarIn: boolean[] = [],
  body?: string,
  /** per ogni strato: ritocchi a mano di colletto e orlo */
  retouch: { collar?: string; hem?: string }[] = [],
  /** per ogni strato: è un gilet (non nasconde le maniche dello strato sotto) */
  vest: boolean[] = [],
): Covers {
  const bits = (a: boolean[]) => a.map((v) => (v ? 1 : 0)).join('')
  // ogni riga: livello, colletto ritoccato, orlo ritoccato (separati da un carattere che non c'è negli URL)
  const rows = urls.map((u, i) => [u, retouch[i]?.collar ?? '', retouch[i]?.hem ?? ''].join('\t'))
  const key = `${shoulder ?? ''}|${bits(inside)}|${bits(collarIn)}|${body ?? ''}|${bits(vest)}\n${rows.join('\n')}`
  const [covers, setCovers] = useState<{ key: string } & Covers>({ key: '', ...NONE })
  useEffect(() => {
    const [head, ...lines] = key.split('\n')
    const list = lines.map((l) => l.split('\t')[0])
    const collarOf = (i: number) => lines[i].split('\t')[1] || undefined
    const hemOf = (i: number) => lines[i].split('\t')[2] || undefined
    if (list.length < 2) return
    let cancelled = false
    const [line, flags, collars, bodyUrl, vests = ''] = head.split('|')
    const top = line ? Number(line) : undefined
    Promise.all([
      Promise.all(
        list.map(async (u, i) => {
          const c = await coverMask(
            list.slice(i + 1),
            flags[i] === '1',
            u,
            hemOf(i),
            list.slice(i + 1).map((_, j) => vests[i + 1 + j] === '1'),
          )
          if (!c) return undefined
          const url = c.toDataURL('image/png')
          releaseCanvas(c)
          return url
        }),
      ),
      Promise.all(
        list.map(async (u, i) => {
          if (top === undefined || i !== list.length - 2 || collars[i] === '1') return undefined
          const c = await hoodMask(u, top, list.slice(i + 1), 1200, collarOf(i))
          if (!c) return undefined
          const url = c.toDataURL('image/png')
          releaseCanvas(c)
          return url
        }),
      ),
      Promise.all(
        list.map(async (u, i) => {
          if (top === undefined || !bodyUrl || i !== list.length - 2 || collars[i] === '1') return undefined
          const c = await collarHole(bodyUrl, u, top, list.slice(i + 1), 1200, collarOf(i))
          if (!c) return undefined
          const url = c.toDataURL('image/png')
          releaseCanvas(c)
          return url
        }),
      ),
      Promise.all(list.map((u, i) => (top === undefined || i !== list.length - 2 ? null : hoodKind(u, top, collarOf(i))))),
    ])
      .then(([masks, hoods, holes, kinds]) => !cancelled && setCovers({ key, masks, hoods, holes, kinds }))
      .catch((e) => console.error(e))
    return () => {
      cancelled = true
    }
  }, [key])
  return covers.key === key ? covers : NONE
}
