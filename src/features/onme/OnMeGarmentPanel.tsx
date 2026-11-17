import { useState } from 'react'
import { Check, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { cn } from '@/lib/utils'
import type { Garment, PhotoType } from '@/lib/garments'
import { isOnMeReady, onMeCategory, useOnMeQueue, useOnMeStarter, useSetPhotoType } from './api'

const TYPES: { key: PhotoType; label: string }[] = [
  { key: 'stesa', label: 'Stesa' },
  { key: 'indossata', label: 'Indossata' },
]

/** Dettaglio capo → "Su di me": tipo di foto e preparazione (o "Rifai") del capo su di te. */
export function OnMeGarmentPanel({ garment }: { garment: Garment }) {
  const queue = useOnMeQueue()
  const { bodyPath, start } = useOnMeStarter()
  const setType = useSetPhotoType()
  const [changed, setChanged] = useState(false)
  if (!onMeCategory(garment.category)) return null

  const type: PhotoType = garment.photo_type ?? 'stesa'
  const ready = isOnMeReady(garment, bodyPath)
  const stale = !ready && !!garment.on_me_path
  const working = queue.current === garment.id
  const queued = queue.pending.includes(garment.id)

  let status: string
  if (!bodyPath) status = 'Per vederlo su di te serve una tua foto nel Profilo.'
  else if (working) status = 'Lo preparo su di te: circa un minuto…'
  else if (queued) status = 'In coda per la preparazione.'
  else if (ready) status = changed ? 'Rifallo per usare il nuovo tipo di foto.' : 'Pronto su di te.'
  else if (stale) status = 'Da rifare: hai cambiato la tua foto.'
  else status = 'Non ancora pronto su di te.'

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border p-4" aria-label="Su di me">
      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-fg-muted">Foto del capo</span>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1" role="radiogroup" aria-label="Foto del capo">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={type === t.key}
              disabled={setType.isPending}
              onClick={() => {
                if (t.key === type) return
                setType.mutate({ id: garment.id, photo_type: t.key }, { onSuccess: () => setChanged(true) })
              }}
              className={cn('h-9 rounded-full text-caption font-semibold transition-colors', type === t.key ? 'bg-navy text-on-accent' : 'text-fg')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-caption text-fg-muted">
          {type === 'indossata'
            ? 'Nella foto qualcuno lo porta: su di te avrà la stessa vestibilità e resterà aperto o chiuso come nella foto.'
            : 'Capo appoggiato o appeso: su di te viene vestito aderente e chiuso.'}
        </p>
        {setType.error && <p className="text-caption text-danger">{setType.error.message}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="flex min-w-0 items-center gap-2 text-caption" role="status">
          {working ? (
            <Spinner className="size-4 shrink-0 text-accent" />
          ) : ready && !changed ? (
            <Check className="size-4 shrink-0 text-accent" aria-hidden />
          ) : null}
          {status}
        </p>
        {start && !working && !queued && (
          <Button
            size="md"
            variant={ready && !changed ? 'secondary' : 'primary'}
            className="h-9 shrink-0 px-4"
            onClick={() => {
              setChanged(false)
              start([garment])
            }}
          >
            {ready || stale ? <RotateCcw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {ready || stale ? 'Rifai su di me' : 'Prepara su di me'}
          </Button>
        )}
      </div>
      {queue.error && !queue.running && <p className="text-caption text-danger">{queue.error}</p>}
    </section>
  )
}
