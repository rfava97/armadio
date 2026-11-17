import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ClipboardCopy, Download, Heart, ImageDown, RotateCcw, Share, Sparkles } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { Chip } from '@/components/Chip'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/toast'
import { OUTFIT_STYLES, STYLE_LABEL, useSaveRenderedOutfit, type OutfitStyle } from '@/features/outfits/api'
import type { CamerinoState } from './state'
import type { GarmentWithThumb } from '@/features/garments/api'
import { garmentImageUrl, tryOnOutfit, type TryOnStep } from '@/lib/tryon'
import { geminiPrompt, importGeminiResult, shareWithGemini } from '@/lib/gemini'
import type { Anchors } from '@/lib/mannequin'

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
  layers,
  shoes,
  anchors,
  state,
}: {
  open: boolean
  onClose: () => void
  /** foto del corpo (URL firmato); null se manca */
  bodyUrl: string | null
  top?: GarmentWithThumb
  bottom?: GarmentWithThumb
  /** per Gemini: tutti gli strati del busto (dal più interno) e le scarpe */
  layers: GarmentWithThumb[]
  shoes?: GarmentWithThumb
  anchors: Anchors | null
  /** il camerino al momento della generazione: viene salvato con l'outfit */
  state: CamerinoState
}) {
  const [step, setStep] = useState<TryOnStep | null>(null)
  const [result, setResult] = useState<{ url: string; model: string; blob: Blob; state: CamerinoState; note?: string | null } | null>(null)
  const [notes, setNotes] = useState('')
  const [gemini, setGemini] = useState<'idle' | 'sharing' | 'importing'>('idle')
  const [geminiMsg, setGeminiMsg] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const geminiItems = [...layers, ...(bottom ? [bottom] : []), ...(shoes ? [shoes] : [])]
  const prompt = geminiPrompt(geminiItems, notes)
  const [name, setName] = useState('')
  const [style, setStyle] = useState<OutfitStyle>('casual')
  const [saved, setSaved] = useState(false)
  const saveMut = useSaveRenderedOutfit()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url)
  }, [result])

  const run = async () => {
    if (!bodyUrl) return
    setError(null)
    setResult(null)
    setSaved(false)
    const snapshot = state
    try {
      const [topUrl, bottomUrl] = await Promise.all([
        // la foto indossata, se c'è, porta vestibilità e chiusura del capo
        top ? garmentImageUrl(top.fit_photo_path ?? top.image_path) : Promise.resolve(undefined),
        bottom ? garmentImageUrl(bottom.fit_photo_path ?? bottom.image_path) : Promise.resolve(undefined),
      ])
      const out = await tryOnOutfit(
        { body: bodyUrl, top: topUrl, bottom: bottomUrl, topWorn: !!top?.fit_photo_path, bottomWorn: !!bottom?.fit_photo_path },
        setStep,
      )
      setResult({ url: URL.createObjectURL(out.blob), model: out.model, blob: out.blob, state: snapshot })
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Generazione non riuscita.')
    } finally {
      setStep(null)
    }
  }

  const shareGemini = async () => {
    if (!bodyUrl) return
    setGemini('sharing')
    setGeminiMsg(null)
    try {
      const items = await Promise.all(
        geminiItems.map(async (g) => ({ garment: g, url: await garmentImageUrl(g.fit_photo_path ?? g.image_path) })),
      )
      const how = await shareWithGemini(bodyUrl, items, prompt)
      setGeminiMsg(
        how === 'shared'
          ? 'Prompt copiato. In Gemini incollalo insieme alle foto, poi salva il risultato e importalo qui.'
          : 'Prompt copiato e foto scaricate: caricale in Gemini insieme al prompt, poi importa il risultato.',
      )
    } catch (e) {
      // condivisione annullata dall'utente: nessun errore da mostrare
      if ((e as Error)?.name !== 'AbortError') setGeminiMsg('Non riesco a preparare le foto: riprova.')
    } finally {
      setGemini('idle')
    }
  }

  const importGemini = async (file: File) => {
    if (!bodyUrl) return
    setGemini('importing')
    setGeminiMsg(null)
    setSaved(false)
    try {
      const out = await importGeminiResult(file, bodyUrl, anchors)
      setResult({ url: URL.createObjectURL(out.blob), model: out.restored ? 'Gemini (viso originale)' : 'Gemini', blob: out.blob, state, note: out.note })
    } catch (e) {
      console.error(e)
      setGeminiMsg('Non riesco a leggere questa immagine.')
    } finally {
      setGemini('idle')
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
              {result.note && <p className="text-caption text-danger">{result.note}</p>}
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

          {result && !saved && (
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
                    { name, style, image: result.blob, state: result.state },
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
          )}
          {saved && (
            <p className="flex items-center gap-2 text-card" role="status">
              <Check className="size-5 text-accent" aria-hidden />
              Salvato nei preferiti: lo trovi nel Profilo.
            </p>
          )}

          {result ? (
            <div className="flex flex-col gap-2">
              <a
                href={result.url}
                download="armadio-outfit.png"
                className="flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface text-card font-semibold text-fg"
              >
                <Download className="size-5 text-accent" aria-hidden />
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

          {/* alternativa sperimentale: l'app Gemini, a mano */}
          <section className="flex flex-col gap-3 rounded-card border border-border p-4" aria-label="Prova con Gemini">
            <div className="flex flex-col gap-1">
              <span className="text-card font-semibold">Prova con Gemini</span>
              <span className="text-caption text-fg-muted">
                Sperimentale. Capisce la vestibilità a parole, ma ridisegna tutta la foto: all'import rimetto il tuo viso se
                l'inquadratura combacia. Sei tu a inviare le foto a Google dall'app Gemini (gratis, poche al giorno).
              </span>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-label font-medium text-fg-muted">Come vuoi indossarli</span>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Es. felpa oversize con la zip aperta" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button size="md" variant="secondary" className="h-10 px-3" onClick={shareGemini} disabled={gemini !== 'idle' || !geminiItems.length}>
                {gemini === 'sharing' ? <Spinner /> : <Share className="size-4" aria-hidden />}
                Condividi
              </Button>
              <Button size="md" variant="secondary" className="h-10 px-3" onClick={() => importInput.current?.click()} disabled={gemini !== 'idle'}>
                {gemini === 'importing' ? <Spinner /> : <ImageDown className="size-4" aria-hidden />}
                Importa
              </Button>
            </div>
            <Button
              size="md"
              variant="ghost"
              className="h-9 px-3"
              onClick={() => navigator.clipboard?.writeText(prompt).then(() => setGeminiMsg('Prompt copiato.'))}
            >
              <ClipboardCopy className="size-4" aria-hidden />
              Copia solo il prompt
            </Button>
            {geminiMsg && (
              <p className="text-caption text-fg-muted" role="status">
                {geminiMsg}
              </p>
            )}
            <input
              ref={importInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void importGemini(f)
              }}
            />
          </section>
        </div>
      )}
    </BottomSheet>
  )
}
