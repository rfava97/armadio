import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/context'
import { encodeRender } from '@/lib/image/encode'
import type { CamerinoState, StageZone } from '@/features/outfit/state'

const BUCKET = 'renders'
const SIGNED_TTL = 60 * 60
const STALE = 50 * 60 * 1000

export const OUTFIT_STYLES = ['casual', 'elegante', 'sport', 'serata', 'lavoro', 'estate', 'altro'] as const
export type OutfitStyle = (typeof OUTFIT_STYLES)[number]
export const STYLE_LABEL: Record<OutfitStyle, string> = {
  casual: 'Casual',
  elegante: 'Elegante',
  sport: 'Sport',
  serata: 'Serata',
  lavoro: 'Lavoro',
  estate: 'Estate',
  altro: 'Altro',
}

export type OutfitItem = { garment_id: string; zone: StageZone; layer: number }
export type SavedOutfit = {
  id: string
  name: string
  style: OutfitStyle
  render_path: string | null
  created_at: string
  outfit_items: OutfitItem[]
  renderUrl: string | null
}

export function useOutfits() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['outfits', session?.user.id],
    enabled: !!session,
    staleTime: STALE,
    queryFn: async (): Promise<SavedOutfit[]> => {
      const { data, error } = await supabase
        .from('outfits')
        .select('id, name, style, render_path, created_at, outfit_items(garment_id, zone, layer)')
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as Omit<SavedOutfit, 'renderUrl'>[]
      const paths = rows.map((r) => r.render_path).filter((p): p is string => !!p)
      const byPath = new Map<string, string>()
      if (paths.length) {
        const { data: signed, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL)
        if (sErr) throw sErr
        for (const s of signed) if (s.path && s.signedUrl) byPath.set(s.path, s.signedUrl)
      }
      return rows.map((r) => ({ ...r, renderUrl: r.render_path ? (byPath.get(r.render_path) ?? null) : null }))
    },
  })
}

/** Capi del camerino → righe di outfit_items (gli strati del busto partono da 1). */
function itemsOf(s: CamerinoState): OutfitItem[] {
  const items: OutfitItem[] = []
  s.outfit.busto.forEach((id, i) => id && items.push({ garment_id: id, zone: 'busto', layer: i + 1 }))
  if (s.outfit.gambe) items.push({ garment_id: s.outfit.gambe, zone: 'gambe', layer: 1 })
  if (s.outfit.piedi) items.push({ garment_id: s.outfit.piedi, zone: 'piedi', layer: 1 })
  // un capo compare una volta sola (chiave primaria outfit + capo)
  return items.filter((it, i) => items.findIndex((x) => x.garment_id === it.garment_id) === i)
}

/** Ricompone il camerino da un outfit salvato. */
export function stateOf(o: SavedOutfit): CamerinoState {
  const busto = o.outfit_items
    .filter((i) => i.zone === 'busto')
    .sort((a, b) => a.layer - b.layer)
    .map((i) => i.garment_id)
  return {
    outfit: {
      busto: busto.length ? busto : [null],
      gambe: o.outfit_items.find((i) => i.zone === 'gambe')?.garment_id ?? null,
      piedi: o.outfit_items.find((i) => i.zone === 'piedi')?.garment_id ?? null,
      tucked: [],
    },
    active: { zone: 'busto', layer: 0 },
  }
}

/** Salva tra i preferiti l'outfit con la sua foto generata. */
export function useSaveRenderedOutfit() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; style: OutfitStyle; image: Blob; state: CamerinoState }) => {
      const userId = session!.user.id
      const id = crypto.randomUUID()
      const path = `${userId}/${id}.webp`
      const store = supabase.storage.from(BUCKET)
      const webp = await encodeRender(input.image)
      const up = await store.upload(path, webp, { contentType: 'image/webp', upsert: false })
      if (up.error) {
        throw new Error(
          /bucket not found|row-level security/i.test(up.error.message)
            ? 'Manca la migrazione 002_renders.sql in Supabase.'
            : up.error.message,
        )
      }
      const { error } = await supabase
        .from('outfits')
        .insert({ id, name: input.name.trim(), style: input.style, render_path: path, avatar_mode: 'foto' })
      if (error) {
        await store.remove([path])
        throw error
      }
      const items = itemsOf(input.state).map((i) => ({ ...i, outfit_id: id }))
      if (items.length) {
        const { error: iErr } = await supabase.from('outfit_items').insert(items)
        if (iErr) {
          await supabase.from('outfits').delete().eq('id', id)
          await store.remove([path])
          throw iErr
        }
      }
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outfits'] }),
  })
}

export function useDeleteOutfit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (o: SavedOutfit) => {
      const { error } = await supabase.from('outfits').delete().eq('id', o.id)
      if (error) throw error
      if (o.render_path) await supabase.storage.from(BUCKET).remove([o.render_path])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outfits'] }),
  })
}
