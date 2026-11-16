import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/Chip'
import { CATEGORIES, CATEGORY_LABEL, PRESET_TAGS } from '@/lib/garments'
import { PALETTE } from '@/lib/colors'
import type { FormValues } from './form'

type Props = {
  value: FormValues
  onChange: (v: FormValues) => void
  /** colore suggerito dal riconoscimento: va per primo tra le chip */
  suggestedColor?: string | null
  recognizing?: boolean
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label font-medium text-fg-muted">{label}</legend>
      {children}
    </fieldset>
  )
}

export function GarmentForm({ value, onChange, suggestedColor, recognizing }: Props) {
  const set = (patch: Partial<FormValues>) => onChange({ ...value, ...patch })

  const colors = suggestedColor
    ? [...PALETTE.filter((c) => c.hex === suggestedColor), ...PALETTE.filter((c) => c.hex !== suggestedColor)]
    : PALETTE
  const tagOptions = Array.from(new Set([...PRESET_TAGS, ...value.tags]))

  return (
    <div className="flex flex-col gap-6">
      {recognizing && (
        <p className="flex items-center gap-2 text-caption text-fg-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Riconosco il capo…
        </p>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-label font-medium text-fg-muted">Nome del capo</span>
        <Input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Es. Maglia nera" />
      </label>

      <Section label="Categoria">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} selected={value.category === c} onClick={() => set({ category: c })}>
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
      </Section>

      <Section label="Colore">
        <div className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none]">
          {colors.map((c) => (
            <Chip
              key={c.hex}
              selected={value.color === c.hex}
              onClick={() => set({ color: value.color === c.hex ? null : c.hex })}
            >
              <span
                className="size-4 rounded-full border border-border"
                style={{ backgroundColor: c.hex }}
                aria-hidden
              />
              {c.name}
            </Chip>
          ))}
        </div>
      </Section>

      <Section label="Tag">
        <div className="flex flex-wrap gap-2">
          {tagOptions.map((t) => {
            const on = value.tags.includes(t)
            return (
              <Chip
                key={t}
                selected={on}
                onClick={() => set({ tags: on ? value.tags.filter((x) => x !== t) : [...value.tags, t] })}
              >
                {t}
              </Chip>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
