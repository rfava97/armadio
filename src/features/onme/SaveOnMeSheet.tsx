import { useEffect, useState } from 'react'
import { BottomSheet } from '@/components/BottomSheet'
import { Spinner } from '@/components/Spinner'
import { SaveOutfitForm } from '@/features/outfits/SaveOutfitForm'
import type { CamerinoState } from '@/features/outfit/state'
import { composeOnMe } from '@/lib/onMe'

/** Salva nei preferiti l'outfit così come si vede "Su di me", senza generarlo di nuovo. */
export function SaveOnMeSheet({
  open,
  onClose,
  bodyUrl,
  layers,
  state,
}: {
  open: boolean
  onClose: () => void
  bodyUrl: string
  /** URL dei livelli nell'ordine in cui si sovrappongono */
  layers: string[]
  state: CamerinoState
}) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(layers)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    composeOnMe(bodyUrl, JSON.parse(key) as string[])
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setImage({ blob, url })
      })
      .catch((e) => {
        console.error(e)
        if (!cancelled) setError('Non riesco a comporre l’immagine.')
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [bodyUrl, key])

  return (
    <BottomSheet open={open} onClose={onClose} title="Salva l'outfit">
      <div className="flex flex-col gap-5">
        {image ? (
          <img src={image.url} alt="L'outfit su di te" className="mx-auto max-h-[45dvh] rounded-card bg-garment-bg" />
        ) : error ? (
          <p className="text-caption text-danger">{error}</p>
        ) : (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="size-6 text-accent" />
          </div>
        )}
        {image && <SaveOutfitForm image={image.blob} state={state} />}
      </div>
    </BottomSheet>
  )
}
