import { useState } from 'react'
import { Check, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/Chip'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/toast'
import type { CamerinoState } from '@/features/outfit/state'
import { OUTFIT_STYLES, STYLE_LABEL, useSaveRenderedOutfit, type OutfitStyle } from './api'

/** Nome, stile e "Salva nei preferiti" per un'immagine dell'outfit. */
export function SaveOutfitForm({ image, state }: { image: Blob; state: CamerinoState }) {
  const [name, setName] = useState('')
  const [style, setStyle] = useState<OutfitStyle>('casual')
  const [saved, setSaved] = useState(false)
  const saveMut = useSaveRenderedOutfit()
  const toast = useToast()

  if (saved) {
    return (
      <p className="flex items-center gap-2 text-card" role="status">
        <Check className="size-5 text-accent" aria-hidden />
        Salvato nei preferiti: lo trovi nel Profilo.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-4">
      <label className="flex flex-col gap-2">
        <span className="text-label font-medium text-fg-muted">Nome dell'outfit</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Weekend" />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-fg-muted">Stile</span>
        <div className="flex flex-wrap gap-2">
          {OUTFIT_STYLES.map((st) => (
            <Chip key={st} selected={style === st} onClick={() => setStyle(st)}>
              {STYLE_LABEL[st]}
            </Chip>
          ))}
        </div>
      </div>
      <Button
        disabled={!name.trim() || saveMut.isPending}
        onClick={() =>
          saveMut.mutate(
            { name, style, image, state },
            {
              onSuccess: () => {
                setSaved(true)
                toast('Aggiunto ai preferiti')
              },
            },
          )
        }
      >
        {saveMut.isPending ? <Spinner /> : <Heart className="size-5" aria-hidden />}
        {saveMut.isPending ? 'Salvataggio…' : 'Salva nei preferiti'}
      </Button>
      {saveMut.error && <p className="text-caption text-danger">{saveMut.error.message}</p>}
    </div>
  )
}
