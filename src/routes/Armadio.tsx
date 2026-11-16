import { useMemo, useState } from 'react'
import { Plus, Search, Shirt, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CATEGORY_LABEL } from '@/lib/garments'
import { colorName } from '@/lib/colors'
import { useGarments, type GarmentWithThumb } from '@/features/garments/api'
import { CategoryTabs, type CategoryFilter } from '@/features/garments/CategoryTabs'
import { GarmentCard } from '@/features/garments/GarmentCard'
import { GarmentDetailSheet } from '@/features/garments/GarmentDetailSheet'
import { AddGarmentSheet } from '@/features/garments/AddGarmentSheet'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export default function Armadio() {
  const { data: garments, isLoading, error, refetch } = useGarments()
  const [category, setCategory] = useState<CategoryFilter>('tutto')
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const filtered = useMemo(() => {
    const q = norm(query.trim())
    return (garments ?? []).filter((g) => {
      if (category !== 'tutto' && g.category !== category) return false
      if (!q) return true
      // ricerca client-side su nome, colore e tag (SPEC 1.1)
      const hay = norm([g.name, colorName(g.color) ?? '', ...g.tags].join(' '))
      return q.split(/\s+/).every((w) => hay.includes(w))
    })
  }, [garments, category, query])

  const open: GarmentWithThumb | null = garments?.find((g) => g.id === openId) ?? null
  const empty = !isLoading && !error && (garments?.length ?? 0) === 0

  return (
    <main>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-screen-title">Il tuo armadio</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={searching ? 'Chiudi ricerca' : 'Cerca'}
            onClick={() => {
              setSearching((s) => !s)
              setQuery('')
            }}
            className="flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-card"
          >
            {searching ? <X className="size-5" /> : <Search className="size-5" />}
          </button>
          <button
            type="button"
            aria-label="Aggiungi capo"
            onClick={() => setAdding(true)}
            className="flex size-11 items-center justify-center rounded-full bg-accent text-on-accent shadow-float"
          >
            <Plus className="size-6" />
          </button>
        </div>
      </header>

      {searching && (
        <Input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome, colore o tag"
          aria-label="Cerca nell'armadio"
          className="mt-4"
        />
      )}

      {!empty && (
        <div className="mt-4">
          <CategoryTabs value={category} onChange={setCategory} />
        </div>
      )}

      {isLoading && (
        <div className="mt-4 grid grid-cols-2 gap-3" aria-label="Caricamento">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-card bg-surface-muted" />
          ))}
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
          <div className="flex size-24 items-center justify-center rounded-full bg-surface-muted">
            <Shirt className="size-10 text-fg-muted" aria-hidden />
          </div>
          <p className="max-w-64 text-body text-fg-muted">Il tuo armadio è vuoto. Inizia fotografando un capo.</p>
          <Button className="max-w-xs" onClick={() => setAdding(true)}>
            <Plus className="size-5" aria-hidden />
            Aggiungi il tuo primo capo
          </Button>
        </div>
      )}

      {!isLoading && !empty && filtered.length === 0 && (
        <p className="mt-10 text-center text-fg-muted">
          {query
            ? 'Nessun capo trovato.'
            : `Nessun capo in ${category === 'tutto' ? 'armadio' : CATEGORY_LABEL[category]}.`}
        </p>
      )}

      {filtered.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {filtered.map((g) => (
            <GarmentCard key={g.id} garment={g} onOpen={() => setOpenId(g.id)} />
          ))}
        </div>
      )}

      <GarmentDetailSheet garment={open} onClose={() => setOpenId(null)} />
      <AddGarmentSheet open={adding} onClose={() => setAdding(false)} />
    </main>
  )
}
