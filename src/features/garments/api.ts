import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/context'
import { removeWearFiles } from '@/features/onme/api'
import {
  CATEGORY_LAYER_RANK,
  CATEGORY_ZONE,
  garmentImagePath,
  thumbPathFor,
  type Category,
  type Garment,
  type GarmentSource,
} from '@/lib/garments'

const BUCKET = 'garments'
const SIGNED_TTL = 60 * 60 // 1 ora
const STALE = 50 * 60 * 1000 // rinnova gli URL prima che scadano

export type GarmentWithThumb = Garment & { thumbUrl: string | null }

export function useGarments() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['garments', session?.user.id],
    enabled: !!session,
    staleTime: STALE,
    queryFn: async (): Promise<GarmentWithThumb[]> => {
      const { data, error } = await supabase
        .from('garments')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as Garment[]
      if (rows.length === 0) return []
      const { data: signed, error: sErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(rows.map((g) => thumbPathFor(g.image_path)), SIGNED_TTL)
      if (sErr) throw sErr
      const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]))
      return rows.map((g) => ({ ...g, thumbUrl: byPath.get(thumbPathFor(g.image_path)) ?? null }))
    },
  })
}

export function useSignedImage(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed', path],
    enabled: !!path,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, SIGNED_TTL)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export type GarmentFields = { name: string; category: Category; color: string | null; tags: string[] }

export function useCreateGarment() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (input: GarmentFields & { image: Blob; thumb: Blob; source: GarmentSource }) => {
      const userId = session!.user.id
      const id = crypto.randomUUID()
      const imagePath = garmentImagePath(userId, id)
      const thumbPath = thumbPathFor(imagePath)
      const store = supabase.storage.from(BUCKET)

      const up1 = await store.upload(imagePath, input.image, { contentType: 'image/webp', upsert: false })
      if (up1.error) throw up1.error
      const up2 = await store.upload(thumbPath, input.thumb, { contentType: 'image/webp', upsert: false })
      if (up2.error) {
        await store.remove([imagePath])
        throw up2.error
      }

      const { error } = await supabase.from('garments').insert({
        id,
        name: input.name.trim(),
        category: input.category,
        zone: CATEGORY_ZONE[input.category],
        layer_rank: CATEGORY_LAYER_RANK[input.category],
        color: input.color,
        tags: input.tags,
        image_path: imagePath,
        source: input.source,
      })
      if (error) {
        await store.remove([imagePath, thumbPath])
        throw error
      }
      return id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['garments'] })
      void qc.invalidateQueries({ queryKey: ['wears'] })
    },
  })
}

export function useUpdateGarment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...f }: GarmentFields & { id: string }) => {
      const { error } = await supabase
        .from('garments')
        .update({
          name: f.name.trim(),
          category: f.category,
          zone: CATEGORY_ZONE[f.category],
          layer_rank: CATEGORY_LAYER_RANK[f.category],
          color: f.color,
          tags: f.tags,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['garments'] })
      void qc.invalidateQueries({ queryKey: ['wears'] })
    },
  })
}

export function useDeleteGarment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (g: Garment) => {
      // prima i file dei modi di indossarlo (le righe spariscono con il capo)
      await removeWearFiles(g.id).catch(() => undefined)
      const { error } = await supabase.from('garments').delete().eq('id', g.id)
      if (error) throw error
      const paths = [g.image_path, thumbPathFor(g.image_path)]
      if (g.original_path) paths.push(g.original_path)
      await supabase.storage.from(BUCKET).remove(paths)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['garments'] })
      void qc.invalidateQueries({ queryKey: ['wears'] })
    },
  })
}
