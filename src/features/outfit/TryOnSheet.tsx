import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, RotateCcw, Sparkles } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import type { GarmentWithThumb } from '@/features/garments/api'
import { garmentImageUrl, tryOnOutfit, type TryOnStep } from '@/lib/tryon'

const STEP_LABEL: Record<TryOnStep, string> = {
  prepare: 'Preparo le foto…',
  top: 'Ti vesto con la maglia…',
  bottom: 'Ti vesto con i pantaloni…',
}

/**
 * "Provalo su di me" (SPEC 2.3 C): foto realistica dell'outfit generata da un modello open source
 * su Hugging Face. Lento e con poche prove al giorno: si usa quando l'outfit convince.
 */
export function TryOnSheet({
  open,
  onClose,
  bodyUrl,
  top,
  bottom,
}: {
  open: boolean
  onClose: () => void
  /** foto del corpo (URL firmato); null se manca */
  bodyUrl: string | null
  top?: GarmentWithThumb
  bottom?: GarmentWithThumb
}) {
  const [step, setStep] = useState<TryOnStep | null>(null)
  const [result, setResult] = useState<{ url: string; model: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url)
  }, [result])

  const run = async () => {
    if (!bodyUrl) return
    setError(null)
    setResult(null)
    try {
      const [topUrl, bottomUrl] = await Promise.all([
        top ? garmentImageUrl(top.image_path) : Promise.resolve(undefined),
        bottom ? garmentImageUrl(bottom.image_path) : Promise.resolve(undefined),
      ])
      const out = await tryOnOutfit({ body: bodyUrl, top: topUrl, bottom: bottomUrl }, setStep)
      setResult({ url: URL.createObjectURL(out.blob), model: out.model })
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Generazione non riuscita.')
    } finally {
      setStep(null)
    }
  }

  const busy = step !== null
  const pieces = [top?.name, bottom?.name].filter(Boolean).join(' e ')

  return (
    <BottomSheet open={open} onClose={busy ? () => undefined : onClose} title="Provalo su di me">
      {!bodyUrl ? (
        <div className="flex flex-col gap-4">
          <p className="text-fg-muted">Serve una tua foto a figura intera.</p>
          <Link to="/profilo" className="text-card font-semibold text-accent underline underline-offset-4" onClick={onClose}>
            Aggiungila nel Profilo
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {result ? (
            <figure className="flex flex-col gap-2">
              <img src={result.url} alt={`Tu con ${pieces}`} className="w-full rounded-card bg-garment-bg" />
              <figcaption className="text-caption text-fg-muted">Generata con {result.model}</figcaption>
            </figure>
          ) : (
            <div className="flex flex-col gap-3 rounded-card bg-garment-bg p-4">
              <p className="text-body">
                Creo una foto realistica di te con <strong className="font-semibold">{pieces || 'questo outfit'}</strong>.
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
                <li>La tua foto e quelle dei capi vengono inviate a Hugging Face, che esegue un modello AI open source.</li>
                <li>È gratis, ma solo per qualche prova al giorno; può servire fino a un paio di minuti.</li>
                <li>Viene usato lo strato più esterno del busto; maglia e pantaloni sono due passaggi.</li>
              </ul>
            </div>
          )}

          {busy && (
            <p className="flex items-center gap-2 text-body" role="status">
              <Spinner className="size-5 text-accent" />
              {STEP_LABEL[step]}
            </p>
          )}
          {error && (
            <p role="alert" className="text-caption text-danger">
              {error}
            </p>
          )}

          {result ? (
            <div className="flex flex-col gap-2">
              <a
                href={result.url}
                download="armadio-outfit.png"
                className="flex h-14 items-center justify-center gap-2 rounded-full bg-accent font-semibold text-on-accent"
              >
                <Download className="size-5" aria-hidden />
                Salva l'immagine
              </a>
              <Button variant="ghost" size="md" onClick={run}>
                <RotateCcw className="size-4" aria-hidden />
                Genera di nuovo
              </Button>
            </div>
          ) : (
            <Button onClick={run} disabled={busy || (!top && !bottom)}>
              {busy ? <Spinner /> : <Sparkles className="size-5" aria-hidden />}
              {busy ? 'Generazione in corso…' : 'Genera'}
            </Button>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
