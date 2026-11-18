import { useRef, useState } from 'react'
import { Check, ExternalLink, ImagePlus, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/Chip'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/Spinner'
import { useSignedImage } from '@/features/garments/api'
import { useProfile } from '@/features/profile/api'
import { geminiFitPrompt, KIND } from '@/lib/gemini'
import { WEAR_SUGGESTIONS } from '@/lib/wearStyle'
import { geminiShapePrompt, makeSilhouette, shareForGeminiShape } from '@/lib/onMeGemini'
import { garmentImageUrl } from '@/lib/tryon'
import { useBodyPhotoUrl } from '@/features/profile/api'
import type { Garment } from '@/lib/garments'
import {
  isWearReady,
  onMeCategory,
  targetKey,
  useCreateWear,
  useDeleteWear,
  useImportGeminiShape,
  useOnMeQueue,
  useOnMeStarter,
  useSetFitPhoto,
  useWears,
  type Wear,
} from './api'


/**
 * Dettaglio capo → "Come lo indossi": uno o più modi (es. felpa chiusa e aperta), ognuno con la sua
 * foto indossata (anche creata con Gemini) e il suo "Su di me".
 */
export function OnMeGarmentPanel({ garment }: { garment: Garment }) {
  const { data: wearsMap, error } = useWears()
  const queue = useOnMeQueue()
  const create = useCreateWear()
  const [adding, setAdding] = useState<string | null>(null)
  if (!onMeCategory(garment.category)) return null

  const wears = wearsMap?.get(garment.id) ?? []
  const names = new Set(wears.map((w) => w.name.toLowerCase()))
  const suggestions = (WEAR_SUGGESTIONS[garment.category] ?? []).filter((n) => !names.has(n.toLowerCase()))
  const add = (name: string) => {
    if (!name.trim()) return
    create.mutate({ garmentId: garment.id, name }, { onSuccess: () => setAdding(null) })
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Come lo indossi">
      <div className="flex flex-col gap-1">
        <span className="text-label font-medium text-fg-muted">Come lo indossi</span>
        <span className="text-caption text-fg-muted">
          Per ogni modo, una foto in cui qualcuno lo porta così (puoi crearla con Gemini): su di te avrà la stessa vestibilità.
          Il nome guida Gemini: Aperta, Chiusa, Cropped, Oversize, Baggy, Slim, Arrotolate (anche insieme).
        </span>
      </div>

      {error && <p className="text-caption text-danger">{error.message}</p>}
      {wearsMap && (wears.length ? wears.map((w) => <WearCard key={w.id} garment={garment} wear={w} />) : <WearCard garment={garment} />)}

      {wearsMap && (
        <div className="flex flex-wrap items-center gap-2">
          {adding === null ? (
            <>
              {suggestions.map((n) => (
                <Chip key={n} onClick={() => add(n)} disabled={create.isPending}>
                  <Plus className="size-4" aria-hidden />
                  {n}
                </Chip>
              ))}
              <Chip onClick={() => setAdding('')} disabled={create.isPending}>
                <Plus className="size-4" aria-hidden />
                {suggestions.length ? 'Altro modo' : 'Aggiungi un modo'}
              </Chip>
            </>
          ) : (
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                add(adding)
              }}
            >
              <Input autoFocus value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Es. Aperta oversize, maniche arrotolate" className="flex-1" />
              <Button size="md" className="h-11 px-4" type="submit" disabled={!adding.trim() || create.isPending}>
                Aggiungi
              </Button>
            </form>
          )}
        </div>
      )}
      {create.error && <p className="text-caption text-danger">{create.error.message}</p>}
      {queue.error && !queue.running && <p className="text-caption text-danger">{queue.error}</p>}
    </section>
  )
}

/** Un modo di indossare il capo; senza `wear` è il modo "Base" non ancora creato. */
function WearCard({ garment, wear }: { garment: Garment; wear?: Wear }) {
  const queue = useOnMeQueue()
  const { bodyPath, start } = useOnMeStarter()
  const { data: profile } = useProfile()
  const setFit = useSetFitPhoto()
  const del = useDeleteWear()
  const { data: fitUrl } = useSignedImage(wear?.fit_photo_path)
  const input = useRef<HTMLInputElement>(null)
  const [changed, setChanged] = useState(false)
  const [copied, setCopied] = useState(false)
  const importShape = useImportGeminiShape()
  const photo = useBodyPhotoUrl(bodyPath)
  const shapeInput = useRef<HTMLInputElement>(null)
  const [shapeMsg, setShapeMsg] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  const shareShape = async () => {
    if (!photo.data) return
    setSharing(true)
    setShapeMsg(null)
    try {
      const sil = await makeSilhouette(photo.data)
      await shareForGeminiShape(
        sil.canvas,
        await garmentImageUrl(garment.image_path),
        geminiShapePrompt(KIND[garment.category] ?? 'garment', name === 'Base' ? '' : name, garment.category),
      )
      setShapeMsg('Prompt copiato. In Gemini allega sagoma e capo, incolla il prompt, salva il risultato e importalo qui.')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setShapeMsg((e as { userFacing?: boolean }).userFacing ? (e as Error).message : 'Non riesco a preparare la sagoma.')
      }
    } finally {
      setSharing(false)
    }
  }

  const name = wear?.name ?? 'Base'
  const key = targetKey({ garment, wear })
  const ready = isWearReady(wear, bodyPath)
  const stale = !ready && !!wear?.on_me_path
  const working = queue.current === key
  const queued = queue.pending.includes(key)

  let status: string
  if (!bodyPath) status = 'Serve una tua foto nel Profilo.'
  else if (working) status = 'Lo preparo su di te: circa un minuto…'
  else if (queued) status = 'In coda.'
  else if (ready) status = changed ? 'Rifallo con la nuova foto.' : 'Pronto su di te.'
  else if (stale) status = 'Da rifare: hai cambiato la tua foto.'
  else status = 'Non ancora su di te.'

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-card font-semibold">{name}</span>
        {wear && (
          <button
            type="button"
            aria-label={`Elimina il modo ${name}`}
            onClick={() => del.mutate(wear)}
            disabled={del.isPending || working}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-danger disabled:opacity-40"
          >
            {del.isPending ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-input bg-garment-bg">
          {wear?.fit_photo_path ? (
            fitUrl ? <img src={fitUrl} alt={`Foto indossata: ${name}`} className="h-full w-full object-cover" /> : <Spinner className="size-4 text-accent" />
          ) : (
            <ImagePlus className="size-5 text-fg-muted" aria-hidden />
          )}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <Button variant="secondary" size="md" className="h-9 px-2" disabled={setFit.isPending} onClick={() => input.current?.click()}>
            {setFit.isPending ? <Spinner /> : <ImagePlus className="size-4" aria-hidden />}
            {wear?.fit_photo_path ? 'Cambia' : 'Foto'}
          </Button>
          <a
            href="https://gemini.google.com/app"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              navigator.clipboard
                ?.writeText(geminiFitPrompt(garment, name === 'Base' ? '' : name, profile?.height_cm))
                .then(() => setCopied(true))
                .catch(() => undefined)
            }}
            className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-2 text-caption font-semibold"
          >
            <ExternalLink className="size-4 text-accent" aria-hidden />
            Gemini
          </a>
        </div>
      </div>
      {copied && (
        <p className="text-caption text-fg-muted">
          Prompt copiato: in Gemini allega la foto del capo e incollalo, poi salva il risultato e aggiungilo con "Foto".
        </p>
      )}
      {wear?.fit_photo_path && (
        <button
          type="button"
          className="self-start text-caption font-semibold text-danger"
          disabled={setFit.isPending}
          onClick={() => setFit.mutate({ garment, wear, file: null }, { onSuccess: () => setChanged(true) })}
        >
          Togli la foto indossata
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) setFit.mutate({ garment, wear, file: f }, { onSuccess: () => setChanged(true) })
        }}
      />
      {(setFit.error || del.error) && <p className="text-caption text-danger">{(setFit.error ?? del.error)?.message}</p>}

      {/* alternativa a FASHN (anche a quota finita): Gemini disegna il capo sulla tua sagoma */}
      {bodyPath && (
        <details className="rounded-input bg-surface-muted px-3 py-2">
          <summary className="cursor-pointer text-caption font-semibold">Esperimento: su di te con Gemini</summary>
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-caption text-fg-muted">
              Senza FASHN. A Gemini mandi la tua sagoma (una figura verde, non la tua foto) e il capo; lui disegna solo il capo
              indossato, l'app lo allinea e lo usa come "su di te".
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="md" className="h-9 px-2" onClick={shareShape} disabled={sharing || !photo.data}>
                {sharing ? <Spinner /> : <ExternalLink className="size-4" aria-hidden />}
                Sagoma
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="h-9 px-2"
                onClick={() => shapeInput.current?.click()}
                disabled={importShape.isPending || working}
              >
                {importShape.isPending ? <Spinner /> : <ImagePlus className="size-4" aria-hidden />}
                {importShape.isPending ? 'Allineo…' : 'Importa'}
              </Button>
            </div>
            {shapeMsg && <p className="text-caption text-fg-muted">{shapeMsg}</p>}
            {importShape.error && <p className="text-caption text-danger">{importShape.error.message}</p>}
            {importShape.isSuccess && !importShape.isPending && <p className="text-caption text-fg">Fatto: guardalo nel camerino, vista Su di me.</p>}
          </div>
          <input
            ref={shapeInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) importShape.mutate({ garment, wear, file: f }, { onSuccess: () => setChanged(false) })
            }}
          />
        </details>
      )}

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
              start([{ garment, wear }])
            }}
          >
            {ready || stale ? <RotateCcw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {ready || stale ? 'Rifai' : 'Prepara'}
          </Button>
        )}
      </div>
    </div>
  )
}
