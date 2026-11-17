import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Move, Plus, RotateCcw, Search, Shuffle, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/Slider'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/toast'
import { buildMannequin, VIEW } from '@/lib/mannequin'
import { skeletonFromAnchors } from '@/lib/skeleton'
import { cn } from '@/lib/utils'
import { useGarments, useUpdateFit, type Fit, type GarmentWithThumb } from '@/features/garments/api'
import { useBodyPhotoUrl, useProfile } from '@/features/profile/api'
import { Stage, type AvatarSource } from '@/features/outfit/Stage'
import { usePreparedBody } from '@/features/outfit/useBodyPhoto'
import { PickerSheet } from '@/features/outfit/PickerSheet'
import { TryOnSheet } from '@/features/outfit/TryOnSheet'
import { useCamerinoSettings } from '@/features/outfit/settings'
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
  toggleTuck,
  TUCKABLE,
  wear,
  ZONE_LABEL,
  type CamerinoState,
} from '@/features/outfit/state'

type NavState = { garmentId?: string; adjust?: boolean } | null

export default function Outfit() {
  const { data: garments, isLoading, error, refetch } = useGarments()
  const { data: profile } = useProfile()
  const settings = useCamerinoSettings()
  // la foto serve sia come avatar sia per "Provalo su di me"
  const photo = useBodyPhotoUrl(profile?.body_photo_path)
  const body = usePreparedBody(
    profile?.avatar_mode === 'foto' ? photo.data : null,
    profile?.avatar_mode === 'foto' ? profile.body_anchors : null,
  )
  const [state, setState] = useState<CamerinoState | null>(null)
  const [picking, setPicking] = useState(false)
  const [trying, setTrying] = useState(false)
  const [adjust, setAdjust] = useState<Fit | null>(null)
  const updateFit = useUpdateFit()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()

  // stato iniziale, calcolato al primo render con i capi: ultimo outfit su questo dispositivo
  // + eventuale capo arrivato da "Prova nel camerino" / "Regola sul manichino"
  const nav = location.state as NavState
  if (garments && !state) {
    let s = loadState()
    s = s ? sanitize(s, garments) : initialState(garments)
    const g = nav?.garmentId ? garments.find((x) => x.id === nav.garmentId) : undefined
    if (g) {
      s = wear(s, g)
      if (nav?.adjust) {
        setAdjust({ fit_scale: Number(g.fit_scale), fit_offset_x: Number(g.fit_offset_x), fit_offset_y: Number(g.fit_offset_y) })
      }
    }
    setState(s)
  }

  // il capo passato dalla navigazione è già nel camerino: non riapplicarlo tornando indietro
  useEffect(() => {
    if (state && nav) navigate('.', { replace: true, state: null })
  }, [state, nav, navigate])

  useEffect(() => {
    if (state) saveState(state)
  }, [state])

  const avatar: AvatarSource | null = useMemo(() => {
    if (!profile) return null
    if (profile.avatar_mode === 'foto' && body && profile.body_anchors) {
      const a = profile.body_anchors
      // gomiti, polsi e ginocchia stimati dai 7 punti calibrati a mano
      const skeleton = skeletonFromAnchors(a, body.hipWidth, body.aspect)
      return { kind: 'photo', url: body.url, anchors: a, skeleton, aspect: body.aspect, hipWidth: body.hipWidth }
    }
    const shape = buildMannequin(profile)
    return {
      kind: 'mannequin',
      measures: profile,
      anchors: shape.anchors,
      skeleton: shape.skeleton,
      aspect: VIEW.w / VIEW.h,
      hipWidth: shape.hipWidth,
    }
  }, [profile, body])

  const byId = useMemo(() => new Map((garments ?? []).map((g) => [g.id, g])), [garments])
  const activeGarment: GarmentWithThumb | undefined = state ? byId.get(getActiveId(state) ?? '') : undefined

  const update = (fn: (s: CamerinoState) => CamerinoState) => setState((s) => (s ? fn(s) : s))

  const startAdjust = () => {
    if (!activeGarment) return
    setAdjust({
      fit_scale: Number(activeGarment.fit_scale),
      fit_offset_x: Number(activeGarment.fit_offset_x),
      fit_offset_y: Number(activeGarment.fit_offset_y),
    })
  }
  const saveAdjust = () => {
    if (!activeGarment || !adjust) return
    updateFit.mutate(
      { id: activeGarment.id, ...adjust },
      {
        onSuccess: () => {
          setAdjust(null)
          toast('Vestibilità salvata')
        },
      },
    )
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
            disabled={!state || !!adjust}
            className="flex size-11 items-center justify-center rounded-full text-fg disabled:opacity-40"
          >
            <Search className="size-5" />
          </button>
          {settings.tryOn && (
            <button
              type="button"
              aria-label="Provalo su di me"
              onClick={() => setTrying(true)}
              disabled={!state || !!adjust}
              className="flex size-11 items-center justify-center rounded-full text-accent disabled:opacity-40"
            >
              <Sparkles className="size-5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Mescola"
            onClick={() => garments && update((s) => shuffle(garments, s.active))}
            disabled={!state || !!adjust}
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

      {state && garments && avatar && (
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
            {state.outfit.busto.length < MAX_LAYERS && !adjust && (
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

          {/* zone: alternativa al tocco sull'avatar */}
          <div className="mt-2 flex gap-2" role="tablist" aria-label="Zona attiva">
            {STAGE_ZONES.map((z) => {
              const on = state.active.zone === z
              return (
                <button
                  key={z}
                  role="tab"
                  aria-selected={on}
                  disabled={!!adjust}
                  onClick={() => update((s) => ({ ...s, active: { zone: z, layer: z === 'busto' ? 0 : 0 } }))}
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

          {/* il palco */}
          <div className="relative mt-2 min-h-0 flex-1">
            <Stage
              garments={garments}
              state={state}
              avatar={avatar}
              adjust={adjust}
              onAdjust={setAdjust}
              onSelectZone={(zone) => update((s) => (s.active.zone === zone ? s : { ...s, active: { zone, layer: 0 } }))}
              onStep={(d) => update((s) => setActiveId(s, neighbor(s, garments, d)))}
              onAddLayer={() => update((s) => addLayer(s, garments))}
            />
            {zoneCount === 0 && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-caption text-fg-muted">
                Nessun capo per {ZONE_LABEL[state.active.zone].toLowerCase()} nell'armadio.
              </p>
            )}
          </div>

          {adjust ? (
            <div className="mt-2 flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
              <p className="text-caption text-fg-muted">
                Trascina per spostare {activeGarment?.name ?? 'il capo'}, allarga con due dita o usa il cursore.
              </p>
              <Slider
                label="Dimensione"
                value={Math.round(adjust.fit_scale * 100)}
                min={50}
                max={200}
                unit="%"
                onChange={(v) => setAdjust({ ...adjust, fit_scale: v / 100 })}
              />
              <div className="flex gap-2">
                <Button variant="ghost" size="md" onClick={() => setAdjust(null)}>
                  Annulla
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  aria-label="Ripristina vestibilità"
                  onClick={() => setAdjust({ fit_scale: 1, fit_offset_x: 0, fit_offset_y: 0 })}
                >
                  <RotateCcw className="size-4" aria-hidden />
                </Button>
                <Button size="md" className="flex-1" onClick={saveAdjust} disabled={updateFit.isPending}>
                  {updateFit.isPending && <Spinner />}
                  Salva
                </Button>
              </div>
              {updateFit.error && <p className="text-caption text-danger">{updateFit.error.message}</p>}
            </div>
          ) : (
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="min-w-0 text-caption text-fg-muted">
                {state.outfit.busto.length < MAX_LAYERS ? 'Tieni premuto per un nuovo strato' : 'Scorri per cambiare capo'}
              </p>
              <div className="flex shrink-0 items-center gap-1">
              {activeGarment && TUCKABLE.includes(activeGarment.category) && state.outfit.gambe && (
                <button
                  type="button"
                  aria-pressed={(state.outfit.tucked ?? []).includes(activeGarment.id)}
                  onClick={() => update((s) => toggleTuck(s, activeGarment.id))}
                  className={cn(
                    'flex h-9 shrink-0 items-center rounded-full px-3 text-caption font-semibold',
                    (state.outfit.tucked ?? []).includes(activeGarment.id) ? 'bg-accent text-on-accent' : 'bg-surface-muted text-fg',
                  )}
                >
                  Dentro i pantaloni
                </button>
              )}
              {activeGarment && (
                <button
                  type="button"
                  onClick={startAdjust}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-full px-2 text-caption font-semibold text-accent"
                >
                  <Move className="size-4" aria-hidden />
                  Regola
                </button>
              )}
              </div>
            </div>
          )}

          <TryOnSheet
            open={trying}
            onClose={() => setTrying(false)}
            bodyUrl={profile?.body_photo_path ? (photo.data ?? null) : null}
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
