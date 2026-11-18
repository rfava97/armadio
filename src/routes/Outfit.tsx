import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Heart, Plus, RotateCcw, Search, Shuffle, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/utils'
import { useGarments, type GarmentWithThumb } from '@/features/garments/api'
import { useBodyPhotoUrl, useProfile } from '@/features/profile/api'
import { Stage, type OnMeSource } from '@/features/outfit/Stage'
import { usePreparedBody } from '@/features/outfit/useBodyPhoto'
import { PickerSheet } from '@/features/outfit/PickerSheet'
import { TryOnSheet } from '@/features/outfit/TryOnSheet'
import { setCamerinoSettings, useCamerinoSettings, type CamerinoView } from '@/features/outfit/settings'
import {
  chosenWear,
  isWearReady,
  onMeCategory,
  friendlyError,
  targetKey,
  useAdjustLayer,
  useOnMeLayers,
  useOnMeQueue,
  useOnMeStarter,
  useWears,
  type OnMeTarget,
  type Wear,
} from '@/features/onme/api'
import { SaveOnMeSheet } from '@/features/onme/SaveOnMeSheet'
import { AdjustPanel } from '@/features/onme/AdjustPanel'
import { useAdjustPreview } from '@/features/onme/useAdjustPreview'
import { layerGuide, NO_ADJUST, type AdjustGuide, type LayerAdjust } from '@/lib/onMe'
import {
  addLayer,
  candidates,
  getActiveId,
  initialState,
  loadState,
  MAX_LAYERS,
  neighbor,
  removeLayer,
  sanitize,
  saveState,
  setActiveId,
  setWear,
  shuffle,
  STAGE_ZONES,
  wear,
  ZONE_LABEL,
  type CamerinoState,
} from '@/features/outfit/state'

type NavState = { garmentId?: string } | null

const VIEWS: { key: CamerinoView; label: string }[] = [
  { key: 'tavolo', label: 'Tavolo' },
  { key: 'sudime', label: 'Su di me' },
]

/** riferimenti di ripiego se il livello non si legge */
const FALLBACK_GUIDE: AdjustGuide = { origin: { x: 0.5, y: 0.3 }, cx: 0.5, torsoL: 0.39, torsoR: 0.61, hipY: 0.5, ankleY: 0.88 }

export default function Outfit() {
  const { data: garments, isLoading, error, refetch } = useGarments()
  const { data: profile } = useProfile()
  const settings = useCamerinoSettings()
  const queue = useOnMeQueue()
  // la foto serve per "Su di me" e per "Provalo su di me"
  const bodyPath = profile?.body_photo_path ?? null
  const photo = useBodyPhotoUrl(bodyPath)
  const body = usePreparedBody(photo.data)
  const { data: wearsMap } = useWears()
  const layers = useOnMeLayers(wearsMap, bodyPath)
  const [state, setState] = useState<CamerinoState | null>(null)
  const [picking, setPicking] = useState(false)
  const [trying, setTrying] = useState(false)
  const [saving, setSaving] = useState(false)
  // correzione a mano del capo attivo "su di me": per modo, con il punto fisso letto dal livello
  const [adjusting, setAdjusting] = useState<{ wearId: string; guide: AdjustGuide | null; value: LayerAdjust } | null>(null)
  const adjustMut = useAdjustLayer()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()

  // stato iniziale, calcolato al primo render con i capi: ultimo outfit su questo dispositivo
  // + eventuale capo arrivato da "Prova nel camerino"
  const nav = location.state as NavState
  if (garments && !state) {
    let s = loadState()
    s = s ? sanitize(s, garments) : initialState(garments)
    const g = nav?.garmentId ? garments.find((x) => x.id === nav.garmentId) : undefined
    if (g) s = wear(s, g)
    setState(s)
  }

  // il capo passato dalla navigazione è già nel camerino: non riapplicarlo tornando indietro
  useEffect(() => {
    if (state && nav) navigate('.', { replace: true, state: null })
  }, [state, nav, navigate])

  useEffect(() => {
    if (state) saveState(state)
  }, [state])

  const view: CamerinoView = settings.view === 'sudime' && bodyPath ? 'sudime' : 'tavolo'

  const byId = useMemo(() => new Map((garments ?? []).map((g) => [g.id, g])), [garments])
  const activeGarment: GarmentWithThumb | undefined = state ? byId.get(getActiveId(state) ?? '') : undefined

  const update = (fn: (s: CamerinoState) => CamerinoState) => setState((s) => (s ? fn(s) : s))

  /** il modo con cui ogni capo è indossato nel camerino (scelto, o il primo pronto) */
  const wearOf = (g: GarmentWithThumb): Wear | undefined => chosenWear(wearsMap?.get(g.id), state?.outfit.wears?.[g.id], bodyPath)

  // capi del busto e delle gambe: quelli che si possono vedere su di te
  const worn = state
    ? [...state.outfit.busto, state.outfit.gambe]
        .map((id) => (id ? byId.get(id) : undefined))
        .filter((g): g is GarmentWithThumb => !!g && !!onMeCategory(g.category))
    : []
  const missing: OnMeTarget[] = worn.filter((g) => !isWearReady(wearOf(g), bodyPath)).map((g) => ({ garment: g, wear: wearOf(g) }))
  // livello di ogni capo (id capo → URL) e foto indossata del modo scelto
  const wornWears = worn.map((g) => {
    const w = wearOf(g)
    return { id: g.id, url: w && isWearReady(w, bodyPath) ? layers.data?.get(w.id) : undefined, fit: w?.fit_photo_path ?? undefined }
  })
  const garmentLayers = new Map(wornWears.filter((x) => x.url).map((x) => [x.id, x.url!] as const))
  const fitPhotos = new Map(wornWears.filter((x) => x.fit).map((x) => [x.id, x.fit!] as const))
  const anchors = profile?.body_anchors
  const onMe: OnMeSource | null =
    view === 'sudime' && body
      ? {
          url: body.url,
          aspect: body.aspect,
          split: anchors ? [(anchors.waist.y + anchors.hips.y) / 2, (anchors.ankle_l.y + anchors.ankle_r.y) / 2 - 0.025] : [0.47, 0.92],
          layers: garmentLayers,
        }
      : null

  const starter = useOnMeStarter()
  const prepare = (items: OnMeTarget[]) => starter.start?.(items)
  const activeWears = activeGarment ? (wearsMap?.get(activeGarment.id) ?? []) : []
  const activeWear = activeGarment ? wearOf(activeGarment) : undefined

  const activeLayerUrl = activeWear && isWearReady(activeWear, bodyPath) ? layers.data?.get(activeWear.id) : undefined
  // la correzione vale solo finché resta attivo lo stesso modo (cambiando capo o vista si chiude)
  const adjust = view === 'sudime' && adjusting && adjusting.wearId === activeWear?.id && activeLayerUrl ? adjusting : null
  const startAdjust = () => {
    if (!activeWear || !activeLayerUrl) return
    const id = activeWear.id
    adjustMut.reset()
    setAdjusting({ wearId: id, guide: null, value: NO_ADJUST })
    layerGuide(activeLayerUrl, anchors)
      .catch(() => FALLBACK_GUIDE)
      .then((guide) => setAdjusting((a) => (a && a.wearId === id ? { ...a, guide } : a)))
  }
  const adjustCategory = activeGarment ? onMeCategory(activeGarment.category) : null
  const adjustCanvas = useAdjustPreview(adjust?.guide ? activeLayerUrl : undefined, adjust?.guide ?? null, adjustCategory, adjust?.value ?? NO_ADJUST)
  const saveAdjust = () => {
    if (!adjust?.guide || !activeGarment || !activeWear || !activeLayerUrl) return
    adjustMut.mutate(
      { garment: activeGarment, wear: activeWear, url: activeLayerUrl, adjust: adjust.value, guide: adjust.guide },
      {
        onSuccess: () => {
          setAdjusting(null)
          toast('Capo corretto')
        },
      },
    )
  }

  const chooseView = (v: CamerinoView) => {
    if (v === 'sudime' && !bodyPath) {
      toast('Aggiungi prima la tua foto nel Profilo')
      return
    }
    setCamerinoSettings({ view: v })
  }

  const empty = !isLoading && !error && (garments?.length ?? 0) === 0
  const zoneCount = state && garments ? candidates(garments, state.active.zone).length : 0

  return (
    // alta quanto lo schermo meno la barra in basso: il palco prende tutto lo spazio rimasto
    <main className="flex h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-120px)] min-h-[520px] flex-col">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-overline font-semibold uppercase text-accent">Camerino</p>
          <h1 className="font-display text-screen-title">Crea il tuo outfit</h1>
        </div>
        <div className="flex items-center rounded-full border border-border bg-surface p-0.5">
          <button
            type="button"
            aria-label="Cerca capo"
            onClick={() => setPicking(true)}
            disabled={!state}
            className="flex size-11 items-center justify-center rounded-full text-fg disabled:opacity-40"
          >
            <Search className="size-5" />
          </button>
          {settings.tryOn && (
            <button
              type="button"
              aria-label="Provalo su di me"
              onClick={() => setTrying(true)}
              disabled={!state}
              className="flex size-11 items-center justify-center rounded-full text-accent disabled:opacity-40"
            >
              <Sparkles className="size-5" />
            </button>
          )}
          {view === 'sudime' && (
            <button
              type="button"
              aria-label="Salva nei preferiti"
              onClick={() => setSaving(true)}
              disabled={!state || !onMe || garmentLayers.size === 0}
              className="flex size-11 items-center justify-center rounded-full text-like disabled:opacity-40"
            >
              <Heart className="size-5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Mescola"
            onClick={() => garments && update((s) => shuffle(garments, s.active))}
            disabled={!state}
            className="flex size-11 items-center justify-center rounded-full text-fg disabled:opacity-40"
          >
            <Shuffle className="size-5" />
          </button>
        </div>
      </header>

      {(isLoading || (!state && !error && !empty)) && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-8 text-accent" />
        </div>
      )}
      {error && (
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <p className="text-fg-muted">Non riesco a caricare l'armadio.</p>
          <Button variant="secondary" size="md" onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      )}
      {empty && (
        <div className="mt-16 flex flex-col items-center gap-5 text-center">
          <p className="max-w-64 text-fg-muted">Aggiungi qualche capo all'armadio per comporre un outfit.</p>
          <Link to="/armadio" className="text-card font-semibold text-accent underline underline-offset-4">
            Vai all'armadio
          </Link>
        </div>
      )}

      {state && garments && (
        <>
          {/* indicatori strati del busto (SPEC 2.1) */}
          <div className="mt-3 flex items-end gap-4 overflow-x-auto [scrollbar-width:none]">
            {state.outfit.busto.map((id, i) => {
              const active = state.active.zone === 'busto' && state.active.layer === i
              const g = id ? byId.get(id) : undefined
              return (
                <div key={i} className="flex min-w-0 shrink-0 items-end gap-1">
                  <button
                    type="button"
                    onClick={() => update((s) => ({ ...s, active: { zone: 'busto', layer: i } }))}
                    className={cn('flex min-h-11 max-w-36 flex-col items-start border-b-2 pb-1 text-left', active ? 'border-accent' : 'border-transparent')}
                    aria-pressed={active}
                  >
                    <span className="text-caption text-fg-muted">Strato {i + 1}</span>
                    <span className="max-w-full truncate text-[17px] leading-6 font-medium">{g?.name ?? '–'}</span>
                  </button>
                  {state.outfit.busto.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Rimuovi strato ${i + 1}`}
                      onClick={() => update((s) => removeLayer(s, i))}
                      className="-ml-1 flex size-11 items-center justify-center text-accent"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              )
            })}
            {state.outfit.busto.length < MAX_LAYERS && (
              <button
                type="button"
                onClick={() => update((s) => addLayer(s, garments))}
                className="mb-1 flex h-9 shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 text-caption font-semibold"
              >
                <Plus className="size-4 text-accent" aria-hidden />
                Strato
              </button>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            {/* zone: alternativa al tocco sul palco */}
            <div className="flex gap-1.5" role="tablist" aria-label="Zona attiva">
              {STAGE_ZONES.map((z) => {
                const on = state.active.zone === z
                return (
                  <button
                    key={z}
                    role="tab"
                    aria-selected={on}
                    onClick={() => update((s) => ({ ...s, active: { zone: z, layer: 0 } }))}
                    className={cn(
                      'h-8 rounded-full px-3 text-caption font-medium transition-colors',
                      on ? 'bg-navy text-on-accent' : 'bg-surface-muted text-fg',
                    )}
                  >
                    {ZONE_LABEL[z]}
                  </button>
                )
              })}
            </div>
            {/* tavolo (capi stesi) o su di me (i capi sulla tua foto) */}
            <div className="flex shrink-0 rounded-full bg-surface-muted p-0.5" role="radiogroup" aria-label="Vista">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  role="radio"
                  aria-checked={view === v.key}
                  onClick={() => chooseView(v.key)}
                  className={cn(
                    'h-7 rounded-full px-2.5 text-caption font-semibold transition-colors',
                    view === v.key ? 'bg-accent text-on-accent' : 'text-fg',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* il palco */}
          <div className={cn('relative mt-2 min-h-0 flex-1', view === 'tavolo' && 'rounded-card bg-garment-bg')}>
            {view === 'sudime' && !onMe ? (
              <div className="flex h-full items-center justify-center">
                <Spinner className="size-8 text-accent" />
              </div>
            ) : (
              <Stage
                garments={garments}
                state={state}
                onMe={onMe}
                onSelectZone={(zone) => update((s) => (s.active.zone === zone ? s : { ...s, active: { zone, layer: 0 } }))}
                onStep={(d) => update((s) => setActiveId(s, neighbor(s, garments, d)))}
                adjustCanvas={adjust ? adjustCanvas : null}
              />
            )}
            {zoneCount === 0 && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-caption text-fg-muted">
                Nessun capo per {ZONE_LABEL[state.active.zone].toLowerCase()} nell'armadio.
              </p>
            )}
          </div>

          {/* modi di indossare il capo attivo (es. felpa chiusa / aperta) */}
          {activeGarment && activeWears.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]" role="radiogroup" aria-label={`Come indossi ${activeGarment.name}`}>
              {activeWears.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  role="radio"
                  aria-checked={activeWear?.id === w.id}
                  onClick={() => update((s) => setWear(s, activeGarment.id, w.id))}
                  className={cn(
                    'h-8 shrink-0 rounded-full px-3 text-caption font-semibold transition-colors',
                    activeWear?.id === w.id ? 'bg-navy text-on-accent' : 'bg-surface-muted text-fg',
                  )}
                >
                  {w.name}
                </button>
              ))}
            </div>
          )}

          {adjust && activeGarment ? (
            <AdjustPanel
              name={activeWear && activeWear.name !== 'Base' ? `${activeGarment.name} (${activeWear.name.toLowerCase()})` : activeGarment.name}
              category={adjustCategory ?? 'tops'}
              value={adjust.value}
              onChange={(value) => setAdjusting((a) => (a ? { ...a, value } : a))}
              onCancel={() => setAdjusting(null)}
              onSave={saveAdjust}
              saving={adjustMut.isPending || !adjustCanvas}
              error={adjustMut.error ? friendlyError(adjustMut.error) : null}
            />
          ) : (
            <OnMeStatus
              view={view}
              active={activeGarment}
              activeWear={activeWear}
              zone={state.active.zone}
              missing={missing}
              bodyPath={bodyPath}
              queue={queue}
              onPrepare={prepare}
              onAdjust={activeLayerUrl && !queue.running ? startAdjust : undefined}
            />
          )}

          {saving && onMe && (
            <SaveOnMeSheet
              open
              onClose={() => setSaving(false)}
              bodyUrl={onMe.url}
              layers={[
                ...(state.outfit.gambe && garmentLayers.get(state.outfit.gambe) ? [garmentLayers.get(state.outfit.gambe)!] : []),
                ...state.outfit.busto
                  .map((id, i) => ({ g: id ? byId.get(id) : undefined, i }))
                  .filter((x): x is { g: GarmentWithThumb; i: number } => !!x.g && garmentLayers.has(x.g.id))
                  .sort((a, b) => a.g.layer_rank - b.g.layer_rank || a.i - b.i)
                  .map((x) => garmentLayers.get(x.g.id)!),
              ]}
              state={state}
            />
          )}

          <TryOnSheet
            open={trying}
            onClose={() => setTrying(false)}
            bodyUrl={bodyPath ? (photo.data ?? null) : null}
            top={
              // lo strato più esterno del busto
              state.outfit.busto
                .map((id) => (id ? byId.get(id) : undefined))
                .filter((g): g is GarmentWithThumb => !!g)
                .sort((a, b) => b.layer_rank - a.layer_rank)[0]
            }
            bottom={state.outfit.gambe ? byId.get(state.outfit.gambe) : undefined}
            layers={state.outfit.busto
              .map((id) => (id ? byId.get(id) : undefined))
              .filter((g): g is GarmentWithThumb => !!g)
              .sort((a, b) => a.layer_rank - b.layer_rank)}
            shoes={state.outfit.piedi ? byId.get(state.outfit.piedi) : undefined}
            fitPhotos={fitPhotos}
            state={state}
          />
          <PickerSheet
            open={picking}
            garments={garments}
            state={state}
            onClose={() => setPicking(false)}
            onPick={(id) => {
              update((s) => setActiveId(s, id))
              setPicking(false)
            }}
          />
        </>
      )}
    </main>
  )
}

/** Riga sotto il palco: suggerimento sul tavolo, stato dei capi "su di me". */
function OnMeStatus({
  view,
  active,
  activeWear,
  zone,
  missing,
  bodyPath,
  queue,
  onPrepare,
  onAdjust,
}: {
  view: CamerinoView
  active: GarmentWithThumb | undefined
  activeWear: Wear | undefined
  zone: string
  missing: OnMeTarget[]
  bodyPath: string | null
  queue: ReturnType<typeof useOnMeQueue>
  onPrepare: (items: OnMeTarget[]) => void
  /** correzione a mano del capo attivo, se è pronto */
  onAdjust?: () => void
}) {
  const line = 'mt-2 flex min-h-11 items-center justify-between gap-3'
  if (view === 'tavolo') {
    return (
      <div className={line}>
        <p className="text-caption text-fg-muted">Scorri per cambiare capo, tocca una zona per sceglierla.</p>
      </div>
    )
  }
  const busy = (t: OnMeTarget) => queue.current === targetKey(t) || queue.pending.includes(targetKey(t))
  const label = (g: GarmentWithThumb, w?: Wear) => (w && w.name !== 'Base' ? `${g.name} (${w.name.toLowerCase()})` : g.name)
  let text: string
  let action: { label: string; items: OnMeTarget[] } | null = null
  if (zone === 'piedi') {
    text = 'Le scarpe si vedono solo sul tavolo: su di te restano quelle della foto.'
  } else if (active && !onMeCategory(active.category)) {
    text = 'Questo capo si vede solo sul tavolo.'
  } else if (active && !isWearReady(activeWear, bodyPath)) {
    const t = { garment: active, wear: activeWear }
    text = busy(t)
      ? queue.current === targetKey(t)
        ? `Preparo ${label(active, activeWear)} su di te: circa un minuto…`
        : `${label(active, activeWear)} è in coda.`
      : `${label(active, activeWear)} non è ancora pronto su di te.`
    if (!busy(t)) action = { label: 'Prepara', items: [t] }
  } else if (missing.length) {
    text = `${missing.length === 1 ? 'Un capo' : `${missing.length} capi`} dell'outfit da preparare.`
    if (!missing.every(busy)) action = { label: 'Prepara', items: missing }
  } else {
    text = queue.running ? 'Preparo altri capi in sottofondo…' : 'Scorri per cambiare capo.'
    // il capo attivo è pronto ma non convince: si può rigenerare
    if (active && !queue.running) action = { label: 'Rifai', items: [{ garment: active, wear: activeWear }] }
  }
  // dopo un errore (quota finita, rete…) lo mostro al posto del testo, con "Riprova"
  if (queue.error && !queue.running) {
    text = queue.error
    if (action) action = { ...action, label: 'Riprova' }
  }
  return (
    <div className={line} role="status">
      <p className={cn('flex min-w-0 items-center gap-2 text-caption', queue.error ? 'text-danger' : 'text-fg-muted')}>
        {queue.running && !queue.error && <Spinner className="size-4 shrink-0 text-accent" />}
        {text}
      </p>
      <div className="flex shrink-0 gap-2">
        {onAdjust && (
          <Button size="md" variant="secondary" className="h-9 shrink-0 px-3" onClick={onAdjust}>
            <SlidersHorizontal className="size-4" aria-hidden />
            Regola
          </Button>
        )}
        {action && (
          <Button
            size="md"
            variant={action.label === 'Rifai' ? 'secondary' : 'primary'}
            className="h-9 shrink-0 px-4"
            onClick={() => onPrepare(action.items)}
          >
            {action.label === 'Rifai' ? <RotateCcw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}
