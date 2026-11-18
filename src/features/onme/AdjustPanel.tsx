import { useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { cn } from '@/lib/utils'
import { NO_ADJUST, type LayerAdjust, type OnMeCategory } from '@/lib/onMe'

type Slider = { key: keyof LayerAdjust; label: string; min: number; max: number; step: number; show: (v: number) => string }

const pct = (v: number) => `${Math.round(v * 100)}%`
const shift = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 10}`

/** Tutto il capo: grandezza e lunghezza ±15%, spostamento su/giù ±8%, di lato ±5%. */
const WHOLE: Slider[] = [
  { key: 'scale', label: 'Grandezza', min: 0.85, max: 1.15, step: 0.005, show: pct },
  { key: 'stretch', label: 'Lunghezza', min: 0.85, max: 1.15, step: 0.005, show: pct },
  { key: 'dy', label: 'Su / giù', min: -0.08, max: 0.08, step: 0.002, show: shift },
  { key: 'dx', label: 'Sinistra / destra', min: -0.05, max: 0.05, step: 0.002, show: shift },
]

const deg = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}°`

type Tab = { key: string; label: string; sliders: Slider[] }

/** Le parti, come le vedi sullo schermo (sinistra = lato sinistro della foto). */
const TOP_PARTS: Tab[] = [
  {
    key: 'arms',
    label: 'Busto e braccia',
    sliders: [
      { key: 'torso', label: 'Busto', min: 0.85, max: 1.2, step: 0.005, show: pct },
      { key: 'armL', label: 'Braccio sinistro', min: 0.8, max: 1.25, step: 0.005, show: pct },
      { key: 'armR', label: 'Braccio destro', min: 0.8, max: 1.25, step: 0.005, show: pct },
    ],
  },
  {
    key: 'sleeves',
    label: 'Maniche',
    sliders: [
      { key: 'tiltL', label: 'Inclina sinistra', min: -10, max: 15, step: 0.5, show: deg },
      { key: 'tiltR', label: 'Inclina destra', min: -10, max: 15, step: 0.5, show: deg },
      { key: 'sleeveL', label: 'Manica sinistra', min: 0.8, max: 1.2, step: 0.005, show: pct },
      { key: 'sleeveR', label: 'Manica destra', min: 0.8, max: 1.2, step: 0.005, show: pct },
    ],
  },
]
const BOTTOM_PARTS: Tab[] = [
  {
    key: 'legs',
    label: 'Gambe',
    sliders: [
      { key: 'legL', label: 'Gamba sinistra', min: 0.8, max: 1.25, step: 0.005, show: pct },
      { key: 'legR', label: 'Gamba destra', min: 0.8, max: 1.25, step: 0.005, show: pct },
      { key: 'openL', label: 'Apri sinistra', min: -0.03, max: 0.06, step: 0.001, show: shift },
      { key: 'openR', label: 'Apri destra', min: -0.03, max: 0.06, step: 0.001, show: shift },
    ],
  },
]

/** Sotto il palco "Su di me": correzione a mano del capo attivo, con anteprima sulla foto. */
export function AdjustPanel({
  name,
  category,
  value,
  onChange,
  onCancel,
  onSave,
  saving,
  error,
}: {
  name: string
  category: OnMeCategory
  value: LayerAdjust
  onChange: (v: LayerAdjust) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  error: string | null
}) {
  const tabs: Tab[] = [{ key: 'whole', label: 'Insieme', sliders: WHOLE }, ...(category === 'tops' ? TOP_PARTS : BOTTOM_PARTS)]
  const [tab, setTab] = useState('whole')
  const sliders = (tabs.find((t) => t.key === tab) ?? tabs[0]).sliders
  const changed = (Object.keys(NO_ADJUST) as (keyof LayerAdjust)[]).some((k) => value[k] !== NO_ADJUST[k])
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-caption font-semibold">Regola {name}</p>
        <button
          type="button"
          onClick={() => onChange(NO_ADJUST)}
          disabled={!changed || saving}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-caption text-fg-muted disabled:opacity-40"
        >
          <RotateCcw className="size-4" aria-hidden />
          Azzera
        </button>
      </div>
      <div className="flex rounded-full bg-surface-muted p-0.5" role="tablist">
        {tabs.map(({ key: k, label }) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn('h-8 flex-1 rounded-full text-caption font-semibold', tab === k ? 'bg-navy text-on-accent' : 'text-fg')}
          >
            {label}
          </button>
        ))}
      </div>
      {sliders.map((s) => (
        <label key={s.key} className="grid grid-cols-[6.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 text-caption">
          <span className="text-fg-muted">{s.label}</span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={value[s.key]}
            disabled={saving}
            onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) })}
            className="h-8 w-full min-w-0 accent-[var(--color-accent)]"
          />
          <span className="text-right tabular-nums">{s.show(value[s.key])}</span>
        </label>
      ))}
      {error && <p className="text-caption text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" size="md" className="h-10 flex-1" onClick={onCancel} disabled={saving && !error}>
          Annulla
        </Button>
        <Button size="md" className="h-10 flex-1" onClick={onSave} disabled={!changed || saving}>
          {saving ? <Spinner /> : <Check className="size-4" aria-hidden />}
          {saving ? 'Attendi…' : 'Salva'}
        </Button>
      </div>
    </div>
  )
}
