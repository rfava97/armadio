import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Crop, Images, RotateCcw, Undo2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'
import type { GarmentSource } from '@/lib/garments'
import { nearestPaletteColor, paletteByHex } from '@/lib/colors'
import { canvasToBlob, drawScaled, loadBitmap } from '@/lib/image/canvas'
import { hasTransparentBorder } from '@/lib/image/transparency'
import { applyCrop, cropToSubject, DEFAULT_CROP, type CropRect } from '@/lib/image/crop'
import { dominantColor } from '@/lib/image/dominantColor'
import { bgModelReady, removeBackground } from '@/lib/image/removeBackground'
import { classifyGarment, clipModelReady, composeName } from '@/lib/image/classify'
import { encodeGarment } from '@/lib/image/encode'
import { cn } from '@/lib/utils'
import { useCreateGarment } from './api'
import { GarmentForm, type RecognizeStatus } from './GarmentForm'
import { CropBox } from './CropBox'
import { isFormComplete, type FormValues } from './form'

type QueueItem = { file: File; source: GarmentSource }

type Item = {
  phase: 'loading' | 'crop' | 'removing' | 'review'
  /** foto intera (ridotta a 1500px), prima del ritaglio manuale */
  photo: HTMLCanvasElement | null
  crop: CropRect
  /** foto ritagliata a mano: input della scontornatura e "Usa originale" */
  original: HTMLCanvasElement | null
  cutout: HTMLCanvasElement | null
  alreadyTransparent: boolean
  useOriginal: boolean
  progress: number | null
  firstDownload: boolean
  error: string | null
}

const EMPTY_FORM: FormValues = { name: '', category: null, color: null, tags: [] }
const initialItem = (): Item => ({
  phase: 'loading',
  photo: null,
  crop: DEFAULT_CROP,
  original: null,
  cutout: null,
  alreadyTransparent: false,
  useOriginal: false,
  progress: null,
  firstDownload: false,
  error: null,
})

/** URL oggetto per mostrare un canvas in un <img>. */
function useCanvasUrl(canvas: HTMLCanvasElement | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!canvas) return
    let revoked = false
    let u: string | null = null
    canvasToBlob(canvas, 'image/png').then((b) => {
      if (revoked) return
      u = URL.createObjectURL(b)
      setUrl(u)
    })
    return () => {
      revoked = true
      if (u) URL.revokeObjectURL(u)
      setUrl(null)
    }
  }, [canvas])
  return url
}

export function AddGarmentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [index, setIndex] = useState(0)
  const [item, setItem] = useState<Item>(initialItem)
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [suggestedColor, setSuggestedColor] = useState<string | null>(null)
  const [recognizing, setRecognizing] = useState<RecognizeStatus>(null)
  const [recognizeNote, setRecognizeNote] = useState<string | null>(null)
  const [view, setView] = useState<'prima' | 'dopo'>('dopo')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const touched = useRef(false) // l'utente ha modificato il form: non sovrascrivere
  const runId = useRef(0)
  const create = useCreateGarment()
  const toast = useToast()

  const reset = useCallback(() => {
    runId.current++
    setQueue([])
    setIndex(0)
    setItem(initialItem())
    setForm(EMPTY_FORM)
    setSuggestedColor(null)
    setRecognizing(null)
    setRecognizeNote(null)
    setSaveError(null)
    setSaving(false)
    touched.current = false
  }, [])

  const close = () => {
    reset()
    onClose()
  }

  const recognize = useCallback(async (cut: HTMLCanvasElement, run: number) => {
    const downloading = !clipModelReady()
    setRecognizing({ downloading, progress: null })
    setRecognizeNote(null)
    const rgb = dominantColor(cut)
    const color = rgb ? nearestPaletteColor(rgb) : null
    if (color) {
      setSuggestedColor(color.hex)
      if (!touched.current) setForm((f) => ({ ...f, color: color.hex }))
    }
    try {
      const res = await classifyGarment(cut, (p) => {
        if (downloading && run === runId.current) setRecognizing({ downloading, progress: p })
      })
      if (run !== runId.current) return
      if (!touched.current) {
        setForm((f) => ({
          ...f,
          category: res.category,
          name: composeName(res.noun, paletteByHex(f.color)?.forms ?? color?.forms ?? null),
          tags: res.tags,
        }))
      }
      if (!res.category) setRecognizeNote('Non sono sicuro della categoria: sceglila tu.')
    } catch (e) {
      console.error(e)
      if (run === runId.current) setRecognizeNote('Riconoscimento non riuscito: compila tu i campi.')
    } finally {
      if (run === runId.current) setRecognizing(null)
    }
  }, [])

  const runRemoval = useCallback(
    async (original: HTMLCanvasElement, run: number) => {
      setItem((it) => ({ ...it, phase: 'removing', progress: null, firstDownload: !bgModelReady(), error: null }))
      try {
        const cut = cropToSubject(
          await removeBackground(original, (p) => run === runId.current && setItem((it) => ({ ...it, progress: p }))),
        )
        if (run !== runId.current) return
        setItem((it) => ({ ...it, phase: 'review', cutout: cut, useOriginal: false }))
        setView('dopo')
        recognize(cut, run)
      } catch (e) {
        console.error(e)
        if (run !== runId.current) return
        setItem((it) => ({
          ...it,
          phase: 'review',
          cutout: null,
          useOriginal: true,
          error: 'Scontornatura non riuscita. Puoi riprovare o usare la foto originale.',
        }))
        setView('prima')
        recognize(original, run)
      }
    },
    [recognize],
  )

  const processItem = useCallback(
    async (q: QueueItem) => {
      const run = ++runId.current
      touched.current = false
      setItem(initialItem())
      setForm(EMPTY_FORM)
      setSuggestedColor(null)
      setSaveError(null)
      try {
        const bmp = await loadBitmap(q.file)
        const original = drawScaled(bmp, 1500)
        bmp.close()
        if (run !== runId.current) return
        const mayHaveAlpha = /png|webp|gif/.test(q.file.type)
        if (mayHaveAlpha && hasTransparentBorder(original)) {
          const cut = cropToSubject(original)
          setItem({ ...initialItem(), phase: 'review', original, cutout: cut, alreadyTransparent: true })
          setView('dopo')
          recognize(cut, run)
          return
        }
        // la foto scattata si può ritagliare a mano prima della scontornatura
        setItem({ ...initialItem(), phase: 'crop', photo: original })
      } catch (e) {
        console.error(e)
        if (run === runId.current) setItem({ ...initialItem(), phase: 'review', error: 'Immagine non leggibile.' })
      }
    },
    [recognize],
  )

  const start = (files: FileList | null, source: GarmentSource) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/') || f.type === '')
    if (list.length === 0) return
    const q = list.map((file) => ({ file, source }))
    setQueue(q)
    setIndex(0)
    processItem(q[0])
  }

  const selected = item.useOriginal ? item.original : item.cutout

  const confirmCrop = (rect: CropRect | null) => {
    if (!item.photo) return
    const run = ++runId.current
    const cropped = rect ? applyCrop(item.photo, rect) : item.photo
    setItem((it) => ({ ...it, original: cropped, cutout: null, crop: rect ?? it.crop }))
    runRemoval(cropped, run)
  }

  const recrop = () => {
    runId.current++ // annulla riconoscimento in corso
    setRecognizing(null)
    setItem((it) => ({ ...it, phase: 'crop' }))
  }

  const save = async () => {
    if (!selected || !isFormComplete(form)) return
    setSaving(true)
    setSaveError(null)
    try {
      const { image, thumb } = await encodeGarment(selected)
      await create.mutateAsync({
        name: form.name,
        category: form.category!,
        color: form.color,
        tags: form.tags,
        image,
        thumb,
        source: queue[index].source,
      })
      const next = index + 1
      if (next < queue.length) {
        toast("Aggiunto all'armadio")
        setIndex(next)
        processItem(queue[next])
      } else {
        close()
        // il toast compare a pannello chiuso, così non si sovrappone al pulsante che scende
        window.setTimeout(() => toast("Aggiunto all'armadio"), 260)
      }
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : ''
      setSaveError(
        msg.includes('enum garment_category')
          ? 'Il database non conosce ancora questa categoria: va eseguita la migrazione in Supabase.'
          : msg || 'Salvataggio non riuscito',
      )
    } finally {
      setSaving(false)
    }
  }

  const choosing = queue.length === 0
  const title = choosing ? 'Aggiungi un capo' : queue.length > 1 ? `Capo ${index + 1} di ${queue.length}` : 'Nuovo capo'

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={title}
      footer={
        !choosing && item.phase === 'crop' ? (
          <div className="flex flex-col gap-2">
            <Button onClick={() => confirmCrop(item.crop)}>
              <Crop className="size-5" aria-hidden />
              Ritaglia e continua
            </Button>
            <Button variant="ghost" size="md" onClick={() => confirmCrop(null)}>
              Usa tutta la foto
            </Button>
          </div>
        ) : !choosing && item.phase === 'review' && selected ? (
          <div className="flex flex-col gap-2">
            <Button disabled={!isFormComplete(form) || saving} onClick={save}>
              {saving && <Spinner />}
              {saving ? 'Salvataggio…' : "Aggiungi all'armadio"}
            </Button>
            {saveError && (
              <p role="alert" className="text-caption text-danger">
                {saveError}
              </p>
            )}
          </div>
        ) : null
      }
    >
      {choosing ? (
        <SourcePicker onPick={start} />
      ) : (
        <div className="flex flex-col gap-6">
          <Preview
            item={item}
            view={view}
            onView={setView}
            onUseOriginal={() => {
              setItem((it) => ({ ...it, useOriginal: !it.useOriginal }))
              setView(item.useOriginal ? 'dopo' : 'prima')
            }}
            onRetry={() => item.original && runRemoval(item.original, ++runId.current)}
            onCrop={(c) => setItem((it) => ({ ...it, crop: c }))}
            onRecrop={item.photo ? recrop : undefined}
          />
          {item.phase === 'review' && selected && (
            <>
              <GarmentForm
                value={form}
                onChange={(v) => {
                  touched.current = true
                  setForm(v)
                }}
                suggestedColor={suggestedColor}
                recognizing={recognizing}
              />
              {recognizeNote && <p className="-mt-2 text-caption text-fg-muted">{recognizeNote}</p>}
            </>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

function SourcePicker({ onPick }: { onPick: (files: FileList | null, source: GarmentSource) => void }) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" onClick={() => camera.current?.click()}>
        <Camera className="size-5" aria-hidden />
        Scatta foto
      </Button>
      <Button variant="secondary" onClick={() => gallery.current?.click()}>
        <Images className="size-5" aria-hidden />
        Galleria / PNG pronto
      </Button>
      <p className="mt-2 text-caption text-fg-muted">
        Fotografa il capo steso o appeso, su uno sfondo il più possibile uniforme. Il ritaglio e il riconoscimento
        avvengono sul telefono: le foto non vengono inviate a nessun servizio.
      </p>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          onPick(e.target.files, 'camera')
          e.target.value = ''
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onPick(e.target.files, 'gallery')
          e.target.value = ''
        }}
      />
    </div>
  )
}

function Preview({
  item,
  view,
  onView,
  onUseOriginal,
  onRetry,
  onCrop,
  onRecrop,
}: {
  item: Item
  view: 'prima' | 'dopo'
  onView: (v: 'prima' | 'dopo') => void
  onUseOriginal: () => void
  onRetry: () => void
  onCrop: (c: CropRect) => void
  onRecrop?: () => void
}) {
  const photoUrl = useCanvasUrl(item.photo)
  const originalUrl = useCanvasUrl(item.original)
  const cutoutUrl = useCanvasUrl(item.cutout)

  if (item.phase === 'crop') {
    return (
      <div className="flex flex-col gap-3">
        {photoUrl && item.photo ? (
          <CropBox src={photoUrl} aspect={item.photo.width / item.photo.height} rect={item.crop} onChange={onCrop} />
        ) : (
          <div className="aspect-[4/5] w-full animate-pulse rounded-card bg-surface-muted" />
        )}
        <p className="text-caption text-fg-muted">
          Inquadra solo il capo: trascina il riquadro o i suoi angoli. Meno sfondo resta, migliore è il ritaglio.
        </p>
      </div>
    )
  }

  const showCut = view === 'dopo' && cutoutUrl
  const url = showCut ? cutoutUrl : originalUrl

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-card bg-surface-muted p-4">
        {url && (
          <img
            src={url}
            alt={showCut ? 'Capo ritagliato' : 'Foto originale'}
            className={cn('h-full w-full object-contain', item.phase === 'removing' && 'opacity-40')}
          />
        )}
        {item.phase !== 'review' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center" role="status">
            <Spinner className="size-8 text-accent" />
            <p className="text-body font-medium">
              {item.phase === 'loading' ? 'Apro la foto…' : 'Sto ritagliando il capo…'}
            </p>
            {item.phase === 'removing' && item.firstDownload && (
              <p className="text-caption text-fg-muted">
                La prima volta scarico il modello di ritaglio (circa 40 MB), poi resta sul telefono.
                {item.progress !== null && item.progress < 1 && ` ${Math.round(item.progress * 100)}%`}
              </p>
            )}
          </div>
        )}
      </div>

      {item.error && (
        <p role="alert" className="text-caption text-danger">
          {item.error}
        </p>
      )}

      {item.phase === 'review' && item.alreadyTransparent && (
        <p className="text-caption text-fg-muted">Immagine già scontornata: ho saltato il ritaglio automatico.</p>
      )}

      {item.phase === 'review' && !item.alreadyTransparent && item.original && (
        <div className="flex flex-wrap items-center gap-2">
          {item.cutout && (
            <div className="flex rounded-full bg-surface-muted p-1" role="radiogroup" aria-label="Anteprima">
              {(['prima', 'dopo'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => onView(v)}
                  className={cn(
                    'min-h-9 rounded-full px-4 text-card font-medium capitalize',
                    view === v ? 'bg-surface text-fg shadow-card' : 'text-fg-muted',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex flex-wrap justify-end gap-1">
            {onRecrop && (
              <Button variant="ghost" size="md" className="px-3" onClick={onRecrop}>
                <Crop className="size-4" aria-hidden />
                Ritaglia
              </Button>
            )}
            {item.cutout && (
              <Button variant="ghost" size="md" className="px-3" onClick={onUseOriginal} aria-pressed={item.useOriginal}>
                <Undo2 className="size-4" aria-hidden />
                {item.useOriginal ? 'Usa ritaglio' : 'Usa originale'}
              </Button>
            )}
            <Button variant="ghost" size="md" className="px-3" onClick={onRetry}>
              <RotateCcw className="size-4" aria-hidden />
              Riprova
            </Button>
          </div>
        </div>
      )}
      {item.useOriginal && item.cutout && (
        <p className="text-caption text-fg-muted">Verrà salvata la foto originale, senza ritaglio.</p>
      )}
    </div>
  )
}
