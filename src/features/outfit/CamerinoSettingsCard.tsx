import { cn } from '@/lib/utils'
import { setCamerinoSettings, useCamerinoSettings, type CamerinoMode } from './settings'

const MODES: { key: CamerinoMode; label: string; hint: string }[] = [
  { key: 'corpo', label: 'Segue il corpo', hint: 'Maniche e pantaloni si piegano su braccia e gambe.' },
  { key: 'semplice', label: 'Semplice', hint: 'Capi interi su spalle e fianchi, più veloce.' },
]

/** Preferenze del camerino (salvate su questo dispositivo). */
export function CamerinoSettingsCard() {
  const s = useCamerinoSettings()
  const current = MODES.find((m) => m.key === s.mode) ?? MODES[0]
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-fg-muted">Come vestire l'avatar</span>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1" role="radiogroup" aria-label="Modalità del camerino">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={s.mode === m.key}
              onClick={() => setCamerinoSettings({ mode: m.key })}
              className={cn(
                'h-10 rounded-full text-caption font-semibold transition-colors',
                s.mode === m.key ? 'bg-navy text-on-accent' : 'text-fg',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-caption text-fg-muted">{current.hint}</p>
      </div>

      <label className="flex items-center justify-between gap-4">
        <span className="flex flex-col">
          <span className="text-card font-medium">Provalo su di me</span>
          <span className="text-caption text-fg-muted">Foto realistica con l'AI di Hugging Face (gratis, poche al giorno).</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={s.tryOn}
          onChange={(e) => setCamerinoSettings({ tryOn: e.target.checked })}
          className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-champagne transition-colors before:absolute before:top-0.5 before:left-0.5 before:size-6 before:rounded-full before:bg-surface before:shadow-card before:transition-transform checked:bg-accent checked:before:translate-x-5"
        />
      </label>
    </div>
  )
}
