import { useState } from 'react'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/button'
import { Mannequin } from '@/components/Mannequin'
import { Slider } from '@/components/Slider'
import { Spinner } from '@/components/Spinner'
import { estimate, type Measures } from '@/lib/mannequin'

type Field = Exclude<keyof Measures, 'body_shape' | 'height_cm'>

const FIELDS: { key: Field | 'height_cm'; label: string; min: number; max: number; unit: string }[] = [
  { key: 'height_cm', label: 'Altezza', min: 140, max: 210, unit: 'cm' },
  { key: 'weight_kg', label: 'Peso', min: 40, max: 150, unit: 'kg' },
  { key: 'shoulders_cm', label: 'Spalle', min: 32, max: 62, unit: 'cm' },
  { key: 'chest_cm', label: 'Petto', min: 70, max: 140, unit: 'cm' },
  { key: 'waist_cm', label: 'Vita', min: 55, max: 140, unit: 'cm' },
  { key: 'hips_cm', label: 'Fianchi', min: 70, max: 140, unit: 'cm' },
  { key: 'legs_cm', label: 'Gambe (interno)', min: 60, max: 100, unit: 'cm' },
]

/** "Personalizza le misure" (SPEC 3): manichino che si aggiorna mentre muovi gli slider. */
export function MeasuresSheet({
  open,
  initial,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean
  initial: Measures
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (m: Measures) => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Personalizza le misure" footer={null}>
      {/* il contenuto viene montato a ogni apertura: la bozza riparte dalle misure salvate */}
      {open && <MeasuresForm initial={initial} saving={saving} error={error} onSave={onSave} />}
    </BottomSheet>
  )
}

function MeasuresForm({
  initial,
  saving,
  error,
  onSave,
}: {
  initial: Measures
  saving: boolean
  error: string | null
  onSave: (m: Measures) => void
}) {
  // solo le misure: la bozza non deve trascinarsi dietro foto, punti o modalità avatar
  const [draft, setDraft] = useState<Measures>(() => ({
    body_shape: initial.body_shape,
    height_cm: initial.height_cm,
    weight_kg: initial.weight_kg,
    shoulders_cm: initial.shoulders_cm,
    chest_cm: initial.chest_cm,
    waist_cm: initial.waist_cm,
    hips_cm: initial.hips_cm,
    legs_cm: initial.legs_cm,
  }))
  const resolved = estimate(draft)

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-0 z-10 -mx-gutter flex justify-center border-b border-border bg-surface pb-3">
        <div className="rounded-card bg-garment-bg px-6 pt-3">
          <Mannequin measures={draft} className="h-[30dvh] max-h-64 w-auto" />
        </div>
      </div>

      <Slider
        label="Forma del corpo"
        value={draft.body_shape}
        min={0}
        max={100}
        ends={['Femminile', 'Maschile']}
        onChange={(v) => setDraft((d) => ({ ...d, body_shape: v }))}
      />
      {FIELDS.map((f) => (
        <Slider
          key={f.key}
          label={f.label}
          value={resolved[f.key]}
          min={f.min}
          max={f.max}
          unit={f.unit}
          estimated={f.key !== 'height_cm' && draft[f.key] === null}
          onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
        />
      ))}
      <p className="text-caption text-fg-muted">
        Le misure “stimate” sono calcolate da altezza e forma del corpo: spostale per inserire le tue. Petto, vita e
        fianchi sono circonferenze.
      </p>

      <div className="sticky -bottom-6 -mx-gutter -mb-6 flex flex-col gap-2 border-t border-border bg-surface px-gutter pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <Button onClick={() => onSave(draft)} disabled={saving}>
          {saving && <Spinner />}
          {saving ? 'Salvataggio…' : 'Salva misure'}
        </Button>
        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
