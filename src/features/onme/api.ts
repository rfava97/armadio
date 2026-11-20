import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useAuth } from '@/auth/context'
import { useBodyPhotoUrl, useProfile } from '@/features/profile/api'
import { supabase } from '@/lib/supabase'
import type { Category, Garment } from '@/lib/garments'
import type { Anchors } from '@/lib/mannequin'
import { loadBitmap, drawScaled, releaseCanvas } from '@/lib/image/canvas'
import { encodeLayer } from '@/lib/image/encode'
import { adjustLayer, makeOnMeLayer, type AdjustGuide, type LayerAdjust, type OnMeCategory } from '@/lib/onMe'
import { importGeminiShape } from '@/lib/onMeGemini'
import { removeBackground } from '@/lib/image/removeBackground'
import { garmentImageUrl } from '@/lib/tryon'

const BUCKET = 'renders'
const SIGNED_TTL = 60 * 60

const TOPS: Category[] = ['maglie', 'camicie', 'canotte', 'felpe_maglioni', 'gilet', 'giacche_cappotti']
const BOTTOMS: Category[] = ['pantaloni', 'jeans']

/** Busto, gambe e scarpe si possono vedere "su di me" (gli accessori no). */
export function onMeCategory(c: Category): OnMeCategory | null {
  if (TOPS.includes(c)) return 'tops'
  if (BOTTOMS.includes(c)) return 'bottoms'
  if (c === 'scarpe') return 'shoes'
  return null
}

/** Capi che FASHN sa preparare (le scarpe solo con Gemini). */
export const fashnCan = (c: Category) => {
  const k = onMeCategory(c)
  return k === 'tops' || k === 'bottoms'
}

/* ---------- modi di indossare un capo (tabella garment_wears, migrazione 006) ---------- */

/** Un modo di indossare un capo ("Chiusa", "Aperta"…): foto indossata e livello "Su di me". */
export type Wear = {
  id: string
  garment_id: string
  name: string
  fit_photo_path: string | null
  on_me_path: string | null
  on_me_body: string | null
  created_at: string
}

/** Pronto se generato con la foto del corpo in uso. */
export const isWearReady = (w: Wear | undefined, bodyPath: string | null | undefined) =>
  !!w && !!bodyPath && !!w.on_me_path && w.on_me_body === bodyPath

export type WearsByGarment = Map<string, Wear[]>

/** Tutti i modi, per capo (nell'ordine in cui sono stati creati). */
export function useWears() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['wears', session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<WearsByGarment> => {
      const { data, error } = await supabase.from('garment_wears').select('*').order('created_at')
      if (error) throw friendly(error)
      const map: WearsByGarment = new Map()
      for (const w of (data ?? []) as Wear[]) map.set(w.garment_id, [...(map.get(w.garment_id) ?? []), w])
      return map
    },
  })
}

/**
 * Il modo con cui il capo appare nel camerino: quello scelto se esiste, altrimenti il primo pronto,
 * altrimenti il primo.
 */
/** un modo "chiuso" (Chiusa, Chiusa 3/4): un capo chiuso tiene chiusi anche quelli sotto */
export const isClosedWear = (w: Wear | undefined) => !!w && /chius/i.test(w.name)

/** il modo del tutto chiuso di un capo ("Chiusa"), se è pronto su di te */
export function fullyClosedWear(wears: Wear[] | undefined, bodyPath: string | null | undefined) {
  return wears?.find((w) => /^\s*chius[ao]\s*$/i.test(w.name) && isWearReady(w, bodyPath))
}

export function chosenWear(wears: Wear[] | undefined, chosenId: string | undefined, bodyPath: string | null | undefined) {
  if (!wears?.length) return undefined
  return wears.find((w) => w.id === chosenId) ?? wears.find((w) => isWearReady(w, bodyPath)) ?? wears[0]
}

/** URL firmati dei livelli pronti, per id del modo. */
export function useOnMeLayers(wears: WearsByGarment | undefined, bodyPath: string | null | undefined) {
  const ready = [...(wears?.values() ?? [])].flat().filter((w) => isWearReady(w, bodyPath))
  const paths = ready.map((w) => w.on_me_path!).sort()
  return useQuery({
    queryKey: ['onme', paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL)
      if (error) throw error
      const byPath = new Map(data.map((s) => [s.path, s.signedUrl]))
      return new Map(ready.map((w) => [w.id, byPath.get(w.on_me_path!) ?? '']))
    },
  })
}

/* ---------- ritocchi a mano di un livello (colletto e orlo) ---------- */

/**
 * I ritocchi stanno accanto al livello, con lo stesso nome: <livello>.colletto.png (dove il colletto
 * esce sopra i capi sopra) e <livello>.orlo.png (cosa nascondere quando ci sono capi sopra). Un livello
 * nuovo (Rifai, Regola, Importa) ha un altro nome: i ritocchi vecchi non valgono più e si cancellano.
 */
export type RetouchKind = 'collar' | 'hem'
export const retouchPath = (layerPath: string, kind: RetouchKind) =>
  `${layerPath.replace(/\.[a-z0-9]+$/i, '')}.${kind === 'collar' ? 'colletto' : 'orlo'}.png`
const retouchFiles = (layerPath: string) => [retouchPath(layerPath, 'collar'), retouchPath(layerPath, 'hem')]

export type Retouch = { collar?: string; hem?: string }

/** URL firmati dei ritocchi dei livelli pronti, per id del modo (solo quelli che esistono). */
export function useRetouches(wears: WearsByGarment | undefined, bodyPath: string | null | undefined) {
  const ready = [...(wears?.values() ?? [])].flat().filter((w) => isWearReady(w, bodyPath))
  const paths = ready.flatMap((w) => retouchFiles(w.on_me_path!)).sort()
  return useQuery({
    queryKey: ['retouch', paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL)
      if (error) throw error
      // i file che non esistono tornano con un errore: niente ritocco
      const byPath = new Map<string, string>()
      for (const s of data) if (!s.error && s.path && s.signedUrl) byPath.set(s.path, s.signedUrl)
      const out = new Map<string, Retouch>()
      for (const w of ready) {
        const collar = byPath.get(retouchPath(w.on_me_path!, 'collar'))
        const hem = byPath.get(retouchPath(w.on_me_path!, 'hem'))
        if (collar || hem) out.set(w.id, { collar, hem })
      }
      return out
    },
  })
}

/** Salva (o toglie, con blob null) un ritocco del livello di un modo. */
export function useSaveRetouch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ wear, kind, blob }: { wear: Wear; kind: RetouchKind; blob: Blob | null }) => {
      if (!wear.on_me_path) throw new Error('Il capo non è ancora pronto su di te.')
      const path = retouchPath(wear.on_me_path, kind)
      const store = supabase.storage.from(BUCKET)
      // niente sovrascrittura (le regole del bucket permettono di creare e cancellare): si toglie e si rimette
      await store.remove([path])
      if (blob) {
        const up = await store.upload(path, blob, { contentType: 'image/png', upsert: false })
        if (up.error) throw up.error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['retouch'] }),
  })
}

function friendly(e: unknown): Error {
  // gli errori di Supabase sono oggetti con message, non sempre istanze di Error
  const msg = (e as { message?: string } | null)?.message ?? String(e)
  if (/garment_wears|wear_id/.test(msg)) {
    return new Error('Manca la migrazione 006_modi_di_indossare.sql: eseguila nel SQL Editor di Supabase.')
  }
  if ((e as { userFacing?: boolean }).userFacing) return e as Error
  return new Error('Operazione non riuscita: riprova tra poco.')
}

/** Messaggio leggibile per gli errori (migrazioni mancanti, rete…). */
export const friendlyError = (e: unknown) => friendly(e).message

async function createWear(garmentId: string, name: string): Promise<Wear> {
  const { data, error } = await supabase.from('garment_wears').insert({ garment_id: garmentId, name: name.trim() }).select().single()
  if (error) throw friendly(error)
  return data as Wear
}

type Body = { path: string; url: string; anchors?: Anchors | null }

/** Linea tra busto e gambe sulla foto: poco sopra i fianchi, dove di solito c'è l'elastico. */
const splitOf = (a?: Anchors | null) => (a ? a.waist.y + (a.hips.y - a.waist.y) * 0.6 : 0.5)
/** Caviglie sulla foto: da qui in giù ci sono le scarpe. */
const anklesOf = (a?: Anchors | null) => (a ? (a.ankle_l.y + a.ankle_r.y) / 2 : 0.9)

/** Salva un livello "su di me" sul modo e toglie quello vecchio. */
async function storeLayer(g: Garment, w: Wear, layer: HTMLCanvasElement, bodyPath: string, userId: string) {
  const blob = await encodeLayer(layer)
  releaseCanvas(layer)
  const path = `${userId}/onme/${g.id}-${w.id}-${Date.now()}.webp`
  const store = supabase.storage.from(BUCKET)
  const up = await store.upload(path, blob, { contentType: 'image/webp', upsert: false })
  if (up.error) throw up.error
  const { error } = await supabase.from('garment_wears').update({ on_me_path: path, on_me_body: bodyPath }).eq('id', w.id)
  if (error) {
    await store.remove([path])
    throw friendly(error)
  }
  if (w.on_me_path) await store.remove([w.on_me_path, ...retouchFiles(w.on_me_path)])
}

/** Genera e salva il livello "su di me" di un modo con FASHN (sostituisce quello vecchio). */
async function prepareOne(g: Garment, w: Wear, body: Body, userId: string) {
  const category = onMeCategory(g.category)
  if (!category) throw new Error('Questo capo non si può vedere su di te.')
  if (category === 'shoes') throw Object.assign(new Error('Le scarpe si preparano con Gemini (Sagoma e Importa).'), { userFacing: true })
  // con la foto indossata il modello copia vestibilità e chiusura; altrimenti usa la foto stesa
  const { layer } = await makeOnMeLayer(
    body.url,
    await garmentImageUrl(w.fit_photo_path ?? g.image_path),
    category,
    !!w.fit_photo_path,
    splitOf(body.anchors),
  )
  await storeLayer(g, w, layer, body.path, userId)
}

/* ---------- coda: i modi si preparano uno alla volta, anche cambiando schermata ---------- */

/** Cosa preparare: un modo esistente, oppure un capo senza modi (si crea "Base"). */
export type OnMeTarget = { garment: Garment; wear?: Wear }
/** chiave nella coda: id del modo, o "g:<id capo>" per un capo ancora senza modi */
export const targetKey = (t: OnMeTarget) => t.wear?.id ?? `g:${t.garment.id}`

export type OnMeQueue = {
  running: boolean
  /** chiave del modo in preparazione */
  current: string | null
  /** chiavi in attesa */
  pending: string[]
  done: number
  error: string | null
}

let queue: OnMeQueue = { running: false, current: null, pending: [], done: 0, error: null }
let stopRequested = false
const targets = new Map<string, OnMeTarget>()
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

/** Aggiunge modi alla coda e la avvia se è ferma. */
export function prepareOnMe(items: OnMeTarget[], ctx: { body: Body; userId: string; qc: QueryClient }) {
  const add: string[] = []
  // le scarpe FASHN non le sa fare: si preparano solo con Gemini
  for (const t of items.filter((x) => fashnCan(x.garment.category))) {
    const k = targetKey(t)
    targets.set(k, t)
    if (k !== queue.current && !queue.pending.includes(k) && !add.includes(k)) add.push(k)
  }
  if (queue.running) {
    set({ pending: [...queue.pending, ...add] })
    return
  }
  stopRequested = false
  set({ running: true, pending: add, done: 0, error: null })
  void (async () => {
    while (queue.pending.length && !stopRequested) {
      const [k, ...rest] = queue.pending
      set({ current: k, pending: rest })
      const t = targets.get(k)
      if (!t) continue
      try {
        const wear = t.wear ?? (await createWear(t.garment.id, 'Base'))
        await prepareOne(t.garment, wear, ctx.body, ctx.userId)
        set({ done: queue.done + 1 })
        await ctx.qc.invalidateQueries({ queryKey: ['wears'] })
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

/** Ferma la coda dopo il modo in corso (una generazione già partita non si può interrompere). */
export function stopOnMe() {
  stopRequested = true
  set({ pending: [] })
}

/** Avvio della preparazione con la foto del corpo in uso (null finché la foto non è pronta). */
export function useOnMeStarter() {
  const { data: profile } = useProfile()
  const { session } = useAuth()
  const qc = useQueryClient()
  const bodyPath = profile?.body_photo_path ?? null
  const photo = useBodyPhotoUrl(bodyPath)
  const start =
    bodyPath && photo.data && session
      ? (items: OnMeTarget[]) =>
          prepareOnMe(items, { body: { path: bodyPath, url: photo.data!, anchors: profile?.body_anchors }, userId: session.user.id, qc })
      : null
  return { bodyPath, start }
}

/* ---------- modifiche ai modi ---------- */

export function useCreateWear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ garmentId, name }: { garmentId: string; name: string }) => createWear(garmentId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wears'] }),
  })
}

/** Elimina un modo con la sua foto indossata e il suo livello. */
export function useDeleteWear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (w: Wear) => {
      const { error } = await supabase.from('garment_wears').delete().eq('id', w.id)
      if (error) throw friendly(error)
      if (w.fit_photo_path) await supabase.storage.from('garments').remove([w.fit_photo_path])
      if (w.on_me_path) await supabase.storage.from(BUCKET).remove([w.on_me_path, ...retouchFiles(w.on_me_path)])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wears'] }),
  })
}

/**
 * Foto indossata di un modo (o null per toglierla): ridotta a 1200 px, senza scontornare (al modello
 * serve la persona che lo porta), nel bucket garments accanto alla foto del capo.
 * Per un capo senza modi crea prima "Base".
 */
export function useSetFitPhoto() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async ({ garment, wear, file }: { garment: Garment; wear?: Wear; file: Blob | null }) => {
      const w = wear ?? (await createWear(garment.id, 'Base'))
      const store = supabase.storage.from('garments')
      let path: string | null = null
      if (file) {
        const bmp = await loadBitmap(file)
        const blob = await encodeLayer(drawScaled(bmp, 1200))
        bmp.close()
        path = `${session!.user.id}/${garment.id}_indossata-${Date.now()}.webp`
        const up = await store.upload(path, blob, { contentType: 'image/webp', upsert: false })
        if (up.error) throw up.error
      }
      const { error } = await supabase.from('garment_wears').update({ fit_photo_path: path }).eq('id', w.id)
      if (error) {
        if (path) await store.remove([path])
        throw friendly(error)
      }
      if (w.fit_photo_path) await store.remove([w.fit_photo_path])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wears'] }),
  })
}

/** File dei modi di un capo, da togliere quando il capo viene eliminato. */
export async function removeWearFiles(garmentId: string) {
  const { data } = await supabase.from('garment_wears').select('fit_photo_path, on_me_path').eq('garment_id', garmentId)
  const rows = (data ?? []) as Pick<Wear, 'fit_photo_path' | 'on_me_path'>[]
  const fits = rows.map((r) => r.fit_photo_path).filter((p): p is string => !!p)
  const layers = rows.map((r) => r.on_me_path).filter((p): p is string => !!p)
  if (fits.length) await supabase.storage.from('garments').remove(fits)
  if (layers.length) await supabase.storage.from(BUCKET).remove([...layers, ...layers.flatMap(retouchFiles)])
}

/**
 * Esperimento: livello "Su di me" da un'immagine di Gemini (il capo disegnato sulla tua sagoma).
 * Per un capo senza modi crea prima "Base".
 */
export function useImportGeminiShape() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { data: profile } = useProfile()
  const bodyPath = profile?.body_photo_path ?? null
  const photo = useBodyPhotoUrl(bodyPath)
  return useMutation({
    mutationFn: async ({ garment, wear, file }: { garment: Garment; wear?: Wear; file: Blob }) => {
      const category = onMeCategory(garment.category)
      if (!category || !bodyPath || !photo.data || !session) throw new Error('Serve una tua foto nel Profilo.')
      const anchors = profile?.body_anchors
      const split = category === 'shoes' ? anklesOf(anchors) : splitOf(anchors)
      const layer = await importGeminiShape(file, photo.data, category, split, (c) => removeBackground(c))
      const w = wear ?? (await createWear(garment.id, 'Base'))
      await storeLayer(garment, w, layer, bodyPath, session.user.id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wears'] }),
  })
}

/** Salva la correzione a mano (parti, grandezza, lunghezza, posizione) del livello di un modo. */
export function useAdjustLayer() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async ({
      garment,
      wear,
      url,
      adjust,
      guide,
    }: {
      garment: Garment
      wear: Wear
      url: string
      adjust: LayerAdjust
      guide: AdjustGuide
    }) => {
      const category = onMeCategory(garment.category)
      if (!session || !wear.on_me_body || !category) throw new Error('Serve una tua foto nel Profilo.')
      const layer = await adjustLayer(url, adjust, guide, category)
      await storeLayer(garment, wear, layer, wear.on_me_body, session.user.id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wears'] }),
  })
}
