import { useState, type ReactNode } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/Chip'
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/garments'
import { PALETTE } from '@/lib/colors'
import { normalizeTag, rememberTag, useKnownTags } from './tags'
import type { FormValues } from './form'

export type RecognizeStatus = { downloading: boolean; progress: number | null } | null

type Props = {
  value: FormValues
  onChange: (v: FormValues) => void
  /** colore suggerito dal riconoscimento: va per primo tra le chip */
  suggestedColor?: string | null
  recognizing?: RecognizeStatus
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label font-medium text-fg-muted">{label}</legend>
      {children}
    </fieldset>
  )
}

export function GarmentForm({ value, onChange, suggestedColor, recognizing }: Props) {
  const set = (patch: Partial<FormValues>) => onChange({ ...value, ...patch })
  const knownTags = useKnownTags()
  const [newTag, setNewTag] = useState('')

  const colors = suggestedColor
    ? [...PALETTE.filter((c) => c.hex === suggestedColor), ...PALETTE.filter((c) => c.hex !== suggestedColor)]
    : PALETTE
  const tagOptions = Array.from(new Set([...knownTags, ...value.tags]))

  const addTag = () => {
    const t = normalizeTag(newTag)
    if (!t) return
    rememberTag(t)
    if (!value.tags.includes(t)) set({ tags: [...value.tags, t] })
    setNewTag('')
  }

  return (
    <div className="flex flex-col gap-6">
      {recognizing && (
        <div className="flex items-start gap-2 rounded-input bg-surface-muted p-3 text-caption" role="status">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-accent" aria-hidden />
          <span>
            {recognizing.downloading && recognizing.progress !== null && recognizing.progress >= 0.99
              ? 'Preparo il riconoscimento, solo la prima volta…'
              : recognizing.downloading
              ? `Scarico il modello di riconoscimento, solo la prima volta${
                  recognizing.progress !== null ? ` (${Math.round(recognizing.progress * 100)}%)` : ''
                }…`
              : 'Riconosco il capo…'}
            <span className="block text-fg-muted">Intanto puoi compilare tu i campi.</span>
          </span>
        </div>
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
        <div className="flex flex-wrap gap-2">
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
        <div className="mt-2 flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="Nuovo tag, es. ufficio"
            aria-label="Nuovo tag"
            enterKeyHint="done"
          />
          <button
            type="button"
            onClick={addTag}
            disabled={!normalizeTag(newTag)}
            aria-label="Aggiungi tag"
            className="flex size-12 shrink-0 items-center justify-center rounded-input bg-accent text-on-accent disabled:opacity-40"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </Section>
    </div>
  )
}
