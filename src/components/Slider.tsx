import { useId, type CSSProperties } from 'react'

type Props = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  /** valore stimato, non ancora inserito dall'utente */
  estimated?: boolean
  /** etichette agli estremi al posto del valore (es. Femminile ↔ Maschile) */
  ends?: [string, string]
  onChange: (v: number) => void
}

export function Slider({ label, value, min, max, step = 1, unit, estimated, ends, onChange }: Props) {
  const id = useId()
  const p = ((value - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-label font-medium text-fg-muted">
          {label}
        </label>
        {!ends && (
          <span className="text-card font-semibold tabular-nums">
            {value}
            {unit && <span className="ml-0.5 font-normal text-fg-muted">{unit}</span>}
            {estimated && <span className="ml-2 text-caption font-normal text-fg-muted">stimata</span>}
          </span>
        )}
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={ends ? `${Math.round(p)}% verso ${ends[1]}` : `${value} ${unit ?? ''}`}
        style={{ '--p': `${p}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {ends && (
        <div className="flex justify-between text-caption text-fg-muted">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  )
}
