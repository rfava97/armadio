import { useRef, useState } from 'react'
import { Camera, Images, RotateCcw } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { Mannequin } from '@/components/Mannequin'
import { useToast } from '@/components/toast'
import { drawScaled, loadBitmap } from '@/lib/image/canvas'
import { cropToSubject } from '@/lib/image/crop'
import { bgModelReady, removeBackground } from '@/lib/image/removeBackground'
import { encodeBodyPhoto } from '@/lib/image/encode'
import { guessBodyAnchors } from '@/lib/image/bodyAnchors'
import { useCanvasUrl } from '@/lib/image/useCanvasUrl'
import { anchorsForCroppedFigure, buildMannequin, type Anchors, type Measures } from '@/lib/mannequin'
import { AnchorEditor } from './AnchorEditor'
import { useSaveProfile, useUploadBodyPhoto, type Profile } from './api'

const PAD = 0.02

/** Ancoraggi del manichino riportati a un'immagine ritagliata con margine PAD (vedi cropToSubject). */
function baseAnchors(m: Measures, w: number, h: number): Anchors {
  const fig = anchorsForCroppedFigure(m)
  const pad = Math.round((Math.max(w, h) * PAD) / (1 + 2 * PAD))
  const bw = w - 2 * pad
  const bh = h - 2 * pad
  const out = {} as Anchors
  for (const [k, p] of Object.entries(fig) as [keyof Anchors, { x: number; y: number }][]) {
    out[k] = { x: (pad + p.x * bw) / w, y: (pad + p.y * bh) / h }
  }
  return out
}

type State =
  | { phase: 'pick' }
  | { phase: 'removing'; progress: number | null; firstDownload: boolean }
  | { phase: 'calibrate'; canvas: HTMLCanvasElement; anchors: Anchors; cutFailed: boolean }

/** Nuova foto del corpo: scelta → scontornatura nel browser → calibrazione dei 7 marcatori. */
export function BodyPhotoSheet({ open, profile, onClose }: { open: boolean; profile: Profile; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="La tua foto">
      {open && <NewPhoto profile={profile} onDone={onClose} />}
    </BottomSheet>
  )
}

function NewPhoto({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [state, setState] = useState<State>({ phase: 'pick' })
  const [error, setError] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const upload = useUploadBodyPhoto()
  const toast = useToast()
  const canvas = state.phase === 'calibrate' ? state.canvas : null
  const url = useCanvasUrl(canvas)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setState({ phase: 'removing', progress: null, firstDownload: !bgModelReady() })
    let photo: HTMLCanvasElement
    try {
      const bmp = await loadBitmap(file)
      photo = drawScaled(bmp, 1500)
      bmp.close()
    } catch {
      setState({ phase: 'pick' })
      setError('Immagine non leggibile.')
      return
    }
    try {
      const cut = await removeBackground(photo, (p) =>
        setState((s) => (s.phase === 'removing' ? { ...s, progress: p } : s)),
      )
      const fig = cropToSubject(cut, PAD)
      const base = baseAnchors(profile, fig.width, fig.height)
      setState({ phase: 'calibrate', canvas: fig, anchors: guessBodyAnchors(fig, base), cutFailed: false })
    } catch (e) {
      console.error(e)
      // senza scontornatura la foto si usa lo stesso: marcatori dalle proporzioni del manichino
      const { anchors } = buildMannequin(profile)
      setState({ phase: 'calibrate', canvas: photo, anchors, cutFailed: true })
    }
  }

  const save = async () => {
    if (state.phase !== 'calibrate') return
    setError(null)
    try {
      const image = await encodeBodyPhoto(state.canvas)
      await upload.mutateAsync({ image, anchors: state.anchors, previous: profile.body_photo_path })
      onDone()
      window.setTimeout(() => toast('Foto salvata'), 260)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Salvataggio non riuscito')
    }
  }

  if (state.phase === 'removing') {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center" role="status">
        <Spinner className="size-8 text-accent" />
        <p className="text-body">
          {state.firstDownload && state.progress !== null && state.progress < 0.99
            ? `Scarico il modello, solo la prima volta (${Math.round(state.progress * 100)}%)…`
            : 'Sto ritagliando la figura…'}
        </p>
        <p className="max-w-64 text-caption text-fg-muted">Tutto avviene sul telefono: la foto non viene inviata a nessun servizio.</p>
      </div>
    )
  }

  if (state.phase === 'calibrate') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-caption text-fg-muted">
          Trascina i 7 punti su collo, spalle, vita, fianchi e caviglie. Servono a posizionare i capi sulla foto.
        </p>
        {state.cutFailed && (
          <p className="text-caption text-danger">Non sono riuscito a scontornare la foto: la uso così com’è.</p>
        )}
        <div className="rounded-card bg-garment-bg px-10 py-4">
          {url && (
            <AnchorEditor
              src={url}
              aspect={state.canvas.width / state.canvas.height}
              anchors={state.anchors}
              onChange={(anchors) => setState({ ...state, anchors })}
              maxHeight="52dvh"
            />
          )}
        </div>
        <Button onClick={save} disabled={upload.isPending}>
          {upload.isPending && <Spinner />}
          {upload.isPending ? 'Salvataggio…' : 'Salva foto e punti'}
        </Button>
        <Button variant="ghost" size="md" onClick={() => setState({ phase: 'pick' })} disabled={upload.isPending}>
          <RotateCcw className="size-5" aria-hidden />
          Scegli un’altra foto
        </Button>
        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-card bg-garment-bg p-4">
        <Mannequin measures={profile} className="h-36 w-auto shrink-0" />
        <ul className="flex flex-col gap-2 text-caption">
          <li>Figura intera, dalla testa ai piedi</li>
          <li>Di fronte, braccia leggermente aperte</li>
          <li>Sfondo semplice e buona luce</li>
          <li>Abiti aderenti e scuri o chiari, non a fantasia</li>
        </ul>
      </div>
      <Button variant="secondary" onClick={() => camera.current?.click()}>
        <Camera className="size-5" aria-hidden />
        Scatta foto
      </Button>
      <Button variant="secondary" onClick={() => gallery.current?.click()}>
        <Images className="size-5" aria-hidden />
        Scegli dalla galleria
      </Button>
      <p className="text-caption text-fg-muted">
        La foto viene scontornata sul telefono e salvata in uno spazio privato, visibile solo a te.
      </p>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Ricalibrazione dei marcatori sulla foto già salvata. */
export function CalibrateSheet({
  open,
  photoUrl,
  profile,
  onClose,
}: {
  open: boolean
  photoUrl: string | null
  profile: Profile
  onClose: () => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Calibra i punti">
      {open && photoUrl && <Recalibrate photoUrl={photoUrl} profile={profile} onDone={onClose} />}
    </BottomSheet>
  )
}

function Recalibrate({ photoUrl, profile, onDone }: { photoUrl: string; profile: Profile; onDone: () => void }) {
  const [aspect, setAspect] = useState<number | null>(null)
  const [anchors, setAnchors] = useState<Anchors>(profile.body_anchors ?? buildMannequin(profile).anchors)
  const save = useSaveProfile()
  const toast = useToast()

  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-fg-muted">Trascina i punti su collo, spalle, vita, fianchi e caviglie.</p>
      {/* serve solo a leggere le proporzioni della foto */}
      {aspect === null && (
        <img src={photoUrl} alt="" hidden onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />
      )}
      <div className="flex min-h-64 items-center justify-center rounded-card bg-garment-bg px-10 py-4">
        {aspect === null ? (
          <Spinner className="size-6 text-accent" />
        ) : (
          <AnchorEditor src={photoUrl} aspect={aspect} anchors={anchors} onChange={setAnchors} maxHeight="52dvh" />
        )}
      </div>
      <Button
        disabled={save.isPending || aspect === null}
        onClick={async () => {
          try {
            await save.mutateAsync({ body_anchors: anchors })
            onDone()
            window.setTimeout(() => toast('Punti salvati'), 260)
          } catch (e) {
            console.error(e)
          }
        }}
      >
        {save.isPending && <Spinner />}
        {save.isPending ? 'Salvataggio…' : 'Salva punti'}
      </Button>
      {save.error && (
        <p role="alert" className="text-caption text-danger">
          {save.error.message}
        </p>
      )}
    </div>
  )
}
