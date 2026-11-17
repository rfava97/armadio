import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/button'
import { GarmentCard } from '@/features/garments/GarmentCard'
import type { GarmentWithThumb } from '@/features/garments/api'
import { candidates, getActiveId, ZONE_LABEL, type CamerinoState } from './state'

/** "Cerca capo": tutti i capi compatibili con la zona (o lo strato) attivo, da scegliere con un tocco. */
export function PickerSheet({
  open,
  garments,
  state,
  onClose,
  onPick,
}: {
  open: boolean
  garments: GarmentWithThumb[]
  state: CamerinoState
  onClose: () => void
  onPick: (id: string | null) => void
}) {
  const { zone, layer } = state.active
  const list = candidates(garments, zone) as GarmentWithThumb[]
  const current = getActiveId(state)
  const used = new Set(zone === 'busto' ? state.outfit.busto.filter((id, i) => id && i !== layer) : [])
  const title = zone === 'busto' ? `Strato ${layer + 1}` : ZONE_LABEL[zone]

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {list.length === 0 ? (
        <p className="text-fg-muted">Nessun capo adatto nell'armadio.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
          {list.map((g) => (
            <div key={g.id} className={g.id === current ? 'rounded-card ring-2 ring-accent ring-offset-4 ring-offset-surface' : undefined}>
              <GarmentCard garment={g} onOpen={() => onPick(g.id)} />
              {used.has(g.id) && <p className="mt-1 text-caption text-fg-muted">Già su un altro strato</p>}
            </div>
          ))}
        </div>
      )}
      {current && (
        <Button variant="ghost" size="md" className="mt-6 w-full" onClick={() => onPick(null)}>
          Togli il capo
        </Button>
      )}
    </BottomSheet>
  )
}
