import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import type { Category, Garment } from '@/lib/garments'
import { encodeLayer } from '@/lib/image/encode'
import { makeOnMeLayer, type OnMeCategory } from '@/lib/onMe'
import { garmentImageUrl } from '@/lib/tryon'

const BUCKET = 'renders'
const SIGNED_TTL = 60 * 60

const TOPS: Category[] = ['maglie', 'camicie', 'canotte', 'felpe_maglioni', 'giacche_cappotti']
const BOTTOMS: Category[] = ['pantaloni', 'jeans']

/** Solo busto e gambe si possono vedere "su di me" (il modello non veste scarpe e accessori). */
export function onMeCategory(c: Category): OnMeCategory | null {
  if (TOPS.includes(c)) return 'tops'
  if (BOTTOMS.includes(c)) return 'bottoms'
  return null
}

/** Pronto se generato con la foto del corpo in uso. */
export const isOnMeReady = (g: Garment, bodyPath: string | null | undefined) =>
  !!bodyPath && !!g.on_me_path && g.on_me_body === bodyPath

/** URL firmati dei livelli pronti, per id del capo. */
export function useOnMeLayers(garments: Garment[] | undefined, bodyPath: string | null | undefined) {
  const ready = (garments ?? []).filter((g) => isOnMeReady(g, bodyPath))
  const paths = ready.map((g) => g.on_me_path!).sort()
  return useQuery({
    queryKey: ['onme', paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL)
      if (error) throw error
      const byPath = new Map(data.map((s) => [s.path, s.signedUrl]))
      return new Map(ready.map((g) => [g.id, byPath.get(g.on_me_path!) ?? '']))
    },
  })
}

function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/on_me_(path|body)/.test(msg)) {
    return new Error('Manca la migrazione 003_su_di_me.sql: eseguila nel SQL Editor di Supabase.')
  }
  if ((e as { userFacing?: boolean }).userFacing) return e as Error
  return new Error('Preparazione non riuscita: riprova tra poco.')
}

/** Genera e salva il livello "su di me" di un capo (sostituisce quello vecchio). */
async function prepareOne(g: Garment, body: { path: string; url: string }, userId: string) {
  const category = onMeCategory(g.category)
  if (!category) throw new Error('Questo capo non si può vedere su di te.')
  const { layer } = await makeOnMeLayer(body.url, await garmentImageUrl(g.image_path), category)
  const blob = await encodeLayer(layer)
  const path = `${userId}/onme/${g.id}-${Date.now()}.webp`
  const store = supabase.storage.from(BUCKET)
  const up = await store.upload(path, blob, { contentType: 'image/webp', upsert: false })
  if (up.error) throw up.error
  const { error } = await supabase.from('garments').update({ on_me_path: path, on_me_body: body.path }).eq('id', g.id)
  if (error) {
    await store.remove([path])
    throw friendly(error)
  }
  if (g.on_me_path) await store.remove([g.on_me_path])
}

/* ---------- coda: i capi si preparano uno alla volta, anche cambiando schermata ---------- */

export type OnMeQueue = {
  running: boolean
  /** capo in preparazione */
  current: string | null
  /** capi in attesa (id) */
  pending: string[]
  done: number
  error: string | null
}

let queue: OnMeQueue = { running: false, current: null, pending: [], done: 0, error: null }
let stopRequested = false
const listeners = new Set<() => void>()
const set = (patch: Partial<OnMeQueue>) => {
  queue = { ...queue, ...patch }
  listeners.forEach((l) => l())
}

export const useOnMeQueue = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => queue,
  )

/** Aggiunge capi alla coda e la avvia se è ferma. */
export function prepareOnMe(
  items: Garment[],
  ctx: { body: { path: string; url: string }; userId: string; qc: QueryClient },
) {
  const add = items.map((g) => g.id).filter((id) => id !== queue.current && !queue.pending.includes(id))
  const byId = new Map(items.map((g) => [g.id, g]))
  if (queue.running) {
    set({ pending: [...queue.pending, ...add] })
    // i capi aggiunti dopo li ritrovo dalla cache dei capi
    return
  }
  stopRequested = false
  set({ running: true, pending: add, done: 0, error: null })
  void (async () => {
    while (queue.pending.length && !stopRequested) {
      const [id, ...rest] = queue.pending
      set({ current: id, pending: rest })
      const all = ctx.qc.getQueriesData<Garment[]>({ queryKey: ['garments'] }).flatMap(([, d]) => d ?? [])
      const g = byId.get(id) ?? all.find((x) => x.id === id)
      if (!g) continue
      try {
        await prepareOne(g, ctx.body, ctx.userId)
        set({ done: queue.done + 1 })
        await ctx.qc.invalidateQueries({ queryKey: ['garments'] })
      } catch (e) {
        console.error(e)
        // quota finita, migrazione mancante, rete: mi fermo e lo dico
        set({ error: friendly(e).message, pending: [] })
        break
      }
    }
    set({ running: false, current: null, pending: stopRequested ? [] : queue.pending })
  })()
}

/** Ferma la coda dopo il capo in corso (una generazione già partita non si può interrompere). */
export function stopOnMe() {
  stopRequested = true
  set({ pending: [] })
}

/** Toglie il livello quando il capo viene eliminato. */
export async function removeOnMe(g: Garment) {
  if (g.on_me_path) await supabase.storage.from(BUCKET).remove([g.on_me_path])
}
