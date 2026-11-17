import { setCamerinoSettings, useCamerinoSettings } from './settings'

/** Preferenze del camerino (salvate su questo dispositivo). */
export function CamerinoSettingsCard() {
  const s = useCamerinoSettings()
  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
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
