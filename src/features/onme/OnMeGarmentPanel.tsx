import { useRef, useState } from 'react'
import { Check, ImagePlus, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { useSignedImage } from '@/features/garments/api'
import type { Garment } from '@/lib/garments'
import { isOnMeReady, onMeCategory, useOnMeQueue, useOnMeStarter, useSetFitPhoto } from './api'

/**
 * Dettaglio capo → "Su di me": foto indossata facoltativa (non si vede nell'armadio, serve a copiare
 * vestibilità e chiusura) e preparazione (o "Rifai") del capo su di te.
 */
export function OnMeGarmentPanel({ garment }: { garment: Garment }) {
  const queue = useOnMeQueue()
  const { bodyPath, start } = useOnMeStarter()
  const setFit = useSetFitPhoto()
  const { data: fitUrl } = useSignedImage(garment.fit_photo_path)
  const input = useRef<HTMLInputElement>(null)
  const [changed, setChanged] = useState(false)
  if (!onMeCategory(garment.category)) return null

  const ready = isOnMeReady(garment, bodyPath)
  const stale = !ready && !!garment.on_me_path
  const working = queue.current === garment.id
  const queued = queue.pending.includes(garment.id)

  let status: string
  if (!bodyPath) status = 'Per vederlo su di te serve una tua foto nel Profilo.'
  else if (working) status = 'Lo preparo su di te: circa un minuto…'
  else if (queued) status = 'In coda per la preparazione.'
  else if (ready) status = changed ? 'Rifallo per usare la nuova foto indossata.' : 'Pronto su di te.'
  else if (stale) status = 'Da rifare: hai cambiato la tua foto.'
  else status = 'Non ancora pronto su di te.'

  const change = (file: Blob | null) =>
    setFit.mutate({ garment, file }, { onSuccess: () => setChanged(true) })

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border p-4" aria-label="Su di me">
      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-fg-muted">Foto indossata</span>
        <div className="flex items-center gap-3">
          {garment.fit_photo_path ? (
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-input bg-garment-bg">
              {fitUrl ? <img src={fitUrl} alt="Foto indossata" className="h-full w-full object-cover" /> : <Spinner className="size-4 text-accent" />}
            </div>
          ) : null}
          <p className="min-w-0 flex-1 text-caption text-fg-muted">
            {garment.fit_photo_path
              ? 'Su di te avrà la vestibilità di questa foto e resterà aperto o chiuso come qui.'
              : 'Facoltativa: una foto in cui qualcuno porta il capo come piace a te (largo, aperto…). Non compare nell’armadio.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="md"
            className="h-9 flex-1 px-3"
            disabled={setFit.isPending}
            onClick={() => input.current?.click()}
          >
            {setFit.isPending ? <Spinner /> : <ImagePlus className="size-4" aria-hidden />}
            {garment.fit_photo_path ? 'Cambia' : 'Aggiungi foto indossata'}
          </Button>
          {garment.fit_photo_path && (
            <Button variant="ghost" size="md" className="h-9 px-3 text-danger" disabled={setFit.isPending} onClick={() => change(null)}>
              Togli
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) change(f)
          }}
        />
        {setFit.error && <p className="text-caption text-danger">{setFit.error.message}</p>}
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
