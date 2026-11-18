import { Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { NO_ADJUST, type LayerAdjust } from '@/lib/onMe'

/** Cursori, in frazioni: grandezza e lunghezza ±15%, spostamento su/giù ±8%, di lato ±5%. */
const SLIDERS: { key: keyof LayerAdjust; label: string; min: number; max: number; step: number; show: (v: number) => string }[] = [
  { key: 'scale', label: 'Grandezza', min: 0.85, max: 1.15, step: 0.005, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'stretch', label: 'Lunghezza', min: 0.85, max: 1.15, step: 0.005, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'dy', label: 'Su / giù', min: -0.08, max: 0.08, step: 0.002, show: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 10}` },
  { key: 'dx', label: 'Sinistra / destra', min: -0.05, max: 0.05, step: 0.002, show: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 10}` },
]

/** Sotto il palco "Su di me": correzione a mano del capo attivo, con anteprima sulla foto. */
export function AdjustPanel({
  name,
  value,
  onChange,
  onCancel,
  onSave,
  saving,
  error,
}: {
  name: string
  value: LayerAdjust
  onChange: (v: LayerAdjust) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  error: string | null
}) {
  const changed = SLIDERS.some((s) => value[s.key] !== NO_ADJUST[s.key])
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-caption font-semibold">Regola {name}</p>
        <button
          type="button"
          onClick={() => onChange(NO_ADJUST)}
          disabled={!changed || saving}
          className="flex h-8 items-center gap-1 rounded-full px-2 text-caption text-fg-muted disabled:opacity-40"
        >
          <RotateCcw className="size-4" aria-hidden />
          Azzera
        </button>
      </div>
      {SLIDERS.map((s) => (
        <label key={s.key} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-caption">
          <span className="text-fg-muted">{s.label}</span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={value[s.key]}
            disabled={saving}
            onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) })}
            className="h-8 w-full accent-[var(--color-accent)]"
          />
          <span className="text-right tabular-nums">{s.show(value[s.key])}</span>
        </label>
      ))}
      {error && <p className="text-caption text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" size="md" className="h-10 flex-1" onClick={onCancel} disabled={saving}>
          Annulla
        </Button>
        <Button size="md" className="h-10 flex-1" onClick={onSave} disabled={!changed || saving}>
          {saving ? <Spinner /> : <Check className="size-4" aria-hidden />}
          {saving ? 'Salvo…' : 'Salva'}
        </Button>
      </div>
    </div>
  )
}
