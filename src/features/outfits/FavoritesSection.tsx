import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Shirt, Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/toast'
import { saveState } from '@/features/outfit/state'
import { STYLE_LABEL, stateOf, useDeleteOutfit, useOutfits, type SavedOutfit } from './api'

/** "I tuoi outfit preferiti" (SPEC 3): carosello orizzontale; tocco → dettaglio. */
export function FavoritesSection() {
  const { data: outfits, isLoading, error } = useOutfits()
  const [open, setOpen] = useState<SavedOutfit | null>(null)

  if (isLoading) {
    return (
      <div className="-mx-gutter flex gap-3 overflow-hidden px-gutter">
        {[0, 1].map((i) => (
          <div key={i} className="aspect-[3/4] w-40 shrink-0 animate-pulse rounded-card bg-garment-bg" />
        ))}
      </div>
    )
  }
  if (error) return <p className="text-caption text-fg-muted">Non riesco a caricare gli outfit.</p>
  if (!outfits?.length) {
    return (
      <p className="text-caption text-fg-muted">
        Ancora nessun outfit. Nel camerino usa “Provalo su di me” e poi “Salva nei preferiti”.
      </p>
    )
  }

  return (
    <>
      <div className="-mx-gutter flex snap-x gap-3 overflow-x-auto px-gutter pb-1 [scrollbar-width:none]">
        {outfits.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setOpen(o)}
            className="flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-card border border-border bg-surface text-left"
          >
            <div className="relative aspect-[3/4] w-full bg-garment-bg">
              {o.renderUrl ? (
                <img src={o.renderUrl} alt={o.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              ) : (
                <Shirt className="absolute inset-0 m-auto size-8 text-fg-muted" aria-hidden />
              )}
              <Heart className="absolute top-2 right-2 size-5 text-like" fill="currentColor" aria-hidden />
            </div>
            <div className="flex flex-col px-3 py-2">
              <span className="truncate font-display text-[19px] leading-6 font-semibold">{o.name}</span>
              <span className="text-overline font-medium uppercase text-fg-muted">{STYLE_LABEL[o.style]}</span>
            </div>
          </button>
        ))}
      </div>
      <OutfitSheet outfit={open} onClose={() => setOpen(null)} />
    </>
  )
}

function OutfitSheet({ outfit, onClose }: { outfit: SavedOutfit | null; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const del = useDeleteOutfit()
  const [confirm, setConfirm] = useState(false)

  const close = () => {
    setConfirm(false)
    onClose()
  }

  return (
    <BottomSheet
      open={!!outfit}
      onClose={close}
      title={outfit?.name ?? ''}
      footer={
        outfit &&
        (confirm ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="danger"
              disabled={del.isPending}
              onClick={() =>
                del.mutate(outfit, {
                  onSuccess: () => {
                    close()
                    window.setTimeout(() => toast('Outfit eliminato'), 260)
                  },
                })
              }
            >
              {del.isPending ? <Spinner /> : <Trash2 className="size-5" aria-hidden />}
              Elimina definitivamente
            </Button>
            <Button variant="ghost" size="md" onClick={() => setConfirm(false)}>
              Annulla
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                // il camerino riparte da questo outfit
                saveState(stateOf(outfit))
                close()
                navigate('/outfit')
              }}
            >
              Apri nel camerino
            </Button>
            <Button variant="ghost" size="md" className="text-danger" onClick={() => setConfirm(true)}>
              <Trash2 className="size-4" aria-hidden />
              Elimina
            </Button>
          </div>
        ))
      }
    >
      {outfit && (
        <div className="flex flex-col gap-3">
          <span className="text-overline font-semibold uppercase text-accent">{STYLE_LABEL[outfit.style]}</span>
          {outfit.renderUrl && <img src={outfit.renderUrl} alt={outfit.name} className="w-full rounded-card bg-garment-bg" />}
          {confirm && <p className="text-caption text-fg-muted">L'outfit e la sua foto verranno eliminati. I capi restano nell'armadio.</p>}
          {del.error && <p className="text-caption text-danger">{del.error.message}</p>}
        </div>
      )}
    </BottomSheet>
  )
}
