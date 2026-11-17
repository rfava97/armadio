import { Sparkles, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { useGarments } from '@/features/garments/api'
import { isOnMeReady, onMeCategory, stopOnMe, useOnMeQueue, useOnMeStarter } from './api'

/** Profilo → Camerino: quanti capi sono pronti "su di me" e la preparazione di quelli mancanti. */
export function OnMeCard() {
  const { data: garments } = useGarments()
  const queue = useOnMeQueue()
  const { bodyPath, start: starter } = useOnMeStarter()

  const eligible = (garments ?? []).filter((g) => onMeCategory(g.category))
  const ready = eligible.filter((g) => isOnMeReady(g, bodyPath))
  const missing = eligible.filter((g) => !isOnMeReady(g, bodyPath))
  const stale = missing.filter((g) => g.on_me_path).length
  const current = queue.current ? garments?.find((g) => g.id === queue.current) : undefined

  const start = () => starter?.(missing)

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-card font-medium">Capi su di te</span>
        {bodyPath && (
          <span className="font-display text-[22px] leading-none font-semibold">
            {ready.length}
            <span className="text-caption font-sans font-normal text-fg-muted"> / {eligible.length}</span>
          </span>
        )}
      </div>

      {!bodyPath ? (
        <p className="text-caption text-fg-muted">
          Per vedere i capi su di te serve una tua foto a figura intera: aggiungila in "Avatar in uso".
        </p>
      ) : (
        <>
          <p className="text-caption text-fg-muted">
            Ogni maglia e pantalone viene fotografato su di te una volta sola con l'AI di Hugging Face (circa un minuto a capo, una
            decina al giorno con la quota gratuita). La tua foto e quelle dei capi vengono inviate a Hugging Face.
            {stale > 0 && ` ${stale === 1 ? 'Un capo va rifatto' : `${stale} capi vanno rifatti`}: hai cambiato foto.`}
          </p>
          {queue.running && (
            <p className="flex items-center gap-2 text-caption" role="status">
              <Spinner className="size-4 text-accent" />
              {current ? `Preparo ${current.name}…` : 'Preparo…'}
              {queue.pending.length > 0 && ` Poi altri ${queue.pending.length}.`}
            </p>
          )}
          {queue.error && (
            <p role="alert" className="text-caption text-danger">
              {queue.error}
            </p>
          )}
          {queue.running ? (
            <Button variant="secondary" size="md" onClick={stopOnMe}>
              <Square className="size-4" aria-hidden />
              Fermati dopo questo capo
            </Button>
          ) : (
            missing.length > 0 && (
              <Button size="md" onClick={start} disabled={!starter}>
                <Sparkles className="size-4" aria-hidden />
                Prepara {missing.length === 1 ? 'il capo mancante' : `i ${missing.length} capi mancanti`}
              </Button>
            )
          )}
          {queue.running && <p className="text-caption text-fg-muted">Tieni l'app aperta finché finisce.</p>}
        </>
      )}
    </div>
  )
}
