import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/context'
import { DEFAULT_MEASURES, type Anchors, type Measures } from '@/lib/mannequin'

const BODY_BUCKET = 'body'
const SIGNED_TTL = 60 * 60
const STALE = 50 * 60 * 1000

export type AvatarMode = 'manichino' | 'foto'

export type Profile = Measures & {
  avatar_mode: AvatarMode
  body_photo_path: string | null
  body_anchors: Anchors | null
}

const DEFAULT_PROFILE: Profile = {
  ...DEFAULT_MEASURES,
  avatar_mode: 'manichino',
  body_photo_path: null,
  body_anchors: null,
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

/** Profilo dell'utente; se la riga non esiste ancora restituisce i valori iniziali della SPEC. */
export function useProfile() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['profile', session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select('*').maybeSingle()
      if (error) throw error
      if (!data) return DEFAULT_PROFILE
      // numeric di Postgres arriva come stringa o numero: normalizzo
      return {
        avatar_mode: data.avatar_mode,
        body_shape: Number(data.body_shape),
        height_cm: Number(data.height_cm),
        weight_kg: num(data.weight_kg),
        shoulders_cm: num(data.shoulders_cm),
        chest_cm: num(data.chest_cm),
        waist_cm: num(data.waist_cm),
        hips_cm: num(data.hips_cm),
        legs_cm: num(data.legs_cm),
        body_photo_path: data.body_photo_path,
        body_anchors: data.body_anchors,
      }
    },
  })
}

/** Salva una parte del profilo (crea la riga al primo salvataggio). */
export function useSaveProfile() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const userId = session!.user.id
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
    },
    onMutate: async (patch) => {
      // aggiornamento immediato dell'interfaccia
      const key = ['profile', session?.user.id]
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Profile>(key)
      if (prev) qc.setQueryData<Profile>(key, { ...prev, ...patch })
      return { prev }
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(['profile', session?.user.id], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })
}

export function useBodyPhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-body', path],
    enabled: !!path,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BODY_BUCKET).createSignedUrl(path!, SIGNED_TTL)
      if (error) throw error
      return data.signedUrl
    },
  })
}

/**
 * Carica una nuova foto del corpo con i suoi ancoraggi e la mette in uso.
 * Lo storage non permette di sovrascrivere: nome nuovo a ogni foto, la precedente viene cancellata.
 */
export function useUploadBodyPhoto() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const save = useSaveProfile()
  return useMutation({
    mutationFn: async ({ image, anchors, previous }: { image: Blob; anchors: Anchors; previous: string | null }) => {
      const path = `${session!.user.id}/body-${Date.now()}.webp`
      const store = supabase.storage.from(BODY_BUCKET)
      const up = await store.upload(path, image, { contentType: 'image/webp', upsert: false })
      if (up.error) throw up.error
      try {
        await save.mutateAsync({ body_photo_path: path, body_anchors: anchors, avatar_mode: 'foto' })
      } catch (e) {
        await store.remove([path])
        throw e
      }
      if (previous) await store.remove([previous])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['signed-body'] }),
  })
}
