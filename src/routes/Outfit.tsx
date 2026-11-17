import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Shuffle, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/toast'
import { useAuth } from '@/auth/context'
import { cn } from '@/lib/utils'
import { useGarments, type GarmentWithThumb } from '@/features/garments/api'
import { useBodyPhotoUrl, useProfile } from '@/features/profile/api'
import { Stage, type OnMeSource } from '@/features/outfit/Stage'
import { usePreparedBody } from '@/features/outfit/useBodyPhoto'
import { PickerSheet } from '@/features/outfit/PickerSheet'
import { TryOnSheet } from '@/features/outfit/TryOnSheet'
import { setCamerinoSettings, useCamerinoSettings, type CamerinoView } from '@/features/outfit/settings'
import { isOnMeReady, onMeCategory, prepareOnMe, useOnMeLayers, useOnMeQueue } from '@/features/onme/api'
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

export default function Outfit() {
  const { data: garments, isLoading, error, refetch } = useGarments()
  const { data: profile } = useProfile()
  const { session } = useAuth()
  const qc = useQueryClient()
  const settings = useCamerinoSettings()
  const queue = useOnMeQueue()
  // la foto serve per "Su di me" e per "Provalo su di me"
  const bodyPath = profile?.body_photo_path ?? null
  const photo = useBodyPhotoUrl(bodyPath)
  const body = usePreparedBody(photo.data)
  const layers = useOnMeLayers(garments, bodyPath)
  const [state, setState] = useState<CamerinoState | null>(null)
  const [picking, setPicking] = useState(false)
  const [trying, setTrying] = useState(false)
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

  const onMe: OnMeSource | null = useMemo(() => {
    if (view !== 'sudime' || !body) return null
    const a = profile?.body_anchors
    const split: [number, number] = a
      ? [(a.waist.y + a.hips.y) / 2, (a.ankle_l.y + a.ankle_r.y) / 2 - 0.025]
      : [0.47, 0.92]
    return { url: body.url, aspect: body.aspect, split, layers: layers.data ?? new Map() }
  }, [view, body, profile?.body_anchors, layers.data])

  const byId = useMemo(() => new Map((garments ?? []).map((g) => [g.id, g])), [garments])
  const activeGarment: GarmentWithThumb | undefined = state ? byId.get(getActiveId(state) ?? '') : undefined

  const update = (fn: (s: CamerinoState) => CamerinoState) => setState((s) => (s ? fn(s) : s))

  // capi dell'outfit che si possono vedere su di te ma non sono ancora pronti
  const worn = state
    ? [...state.outfit.busto, state.outfit.gambe].map((id) => (id ? byId.get(id) : undefined)).filter((g): g is GarmentWithThumb => !!g)
    : []
  const missing = worn.filter((g) => onMeCategory(g.category) && !isOnMeReady(g, bodyPath))

  const prepare = (items: GarmentWithThumb[]) => {
    if (!bodyPath || !photo.data || !session) return
    prepareOnMe(items, { body: { path: bodyPath, url: photo.data }, userId: session.user.id, qc })
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
              />
            )}
            {zoneCount === 0 && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-caption text-fg-muted">
                Nessun capo per {ZONE_LABEL[state.active.zone].toLowerCase()} nell'armadio.
              </p>
            )}
          </div>

          <OnMeStatus
            view={view}
            active={activeGarment}
            zone={state.active.zone}
            missing={missing}
            bodyPath={bodyPath}
            queue={queue}
            onPrepare={prepare}
          />

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
  zone,
  missing,
  bodyPath,
  queue,
  onPrepare,
}: {
  view: CamerinoView
  active: GarmentWithThumb | undefined
  zone: string
  missing: GarmentWithThumb[]
  bodyPath: string | null
  queue: ReturnType<typeof useOnMeQueue>
  onPrepare: (items: GarmentWithThumb[]) => void
}) {
  const line = 'mt-2 flex min-h-11 items-center justify-between gap-3'
  if (view === 'tavolo') {
    return (
      <div className={line}>
        <p className="text-caption text-fg-muted">Scorri per cambiare capo, tocca una zona per sceglierla.</p>
      </div>
    )
  }
  const busy = (g: GarmentWithThumb) => queue.current === g.id || queue.pending.includes(g.id)
  let text: string
  let action: { label: string; items: GarmentWithThumb[] } | null = null
  if (zone === 'piedi') {
    text = 'Le scarpe si vedono solo sul tavolo: su di te restano quelle della foto.'
  } else if (active && !onMeCategory(active.category)) {
    text = 'Questo capo si vede solo sul tavolo.'
  } else if (active && !isOnMeReady(active, bodyPath)) {
    text = busy(active)
      ? queue.current === active.id
        ? `Preparo ${active.name} su di te: circa un minuto…`
        : `${active.name} è in coda.`
      : `${active.name} non è ancora pronto su di te.`
    if (!busy(active)) action = { label: 'Prepara', items: [active] }
  } else if (missing.length) {
    text = `${missing.length === 1 ? 'Un capo' : `${missing.length} capi`} dell'outfit da preparare.`
    if (!missing.every(busy)) action = { label: 'Prepara', items: missing }
  } else {
    text = queue.running ? 'Preparo altri capi in sottofondo…' : 'Scorri per cambiare capo.'
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
      {action && (
        <Button size="md" className="h-9 shrink-0 px-4" onClick={() => onPrepare(action.items)}>
          <Sparkles className="size-4" aria-hidden />
          {action.label}
        </Button>
      )}
    </div>
  )
}
