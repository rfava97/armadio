import type { Category, Garment } from '@/lib/garments'

/** Zone del camerino (SPEC 2.2). Gli accessori non hanno una zona sull'avatar. */
export type StageZone = 'busto' | 'gambe' | 'piedi'
export const STAGE_ZONES: StageZone[] = ['busto', 'gambe', 'piedi']
export const ZONE_LABEL: Record<StageZone, string> = { busto: 'Busto', gambe: 'Gambe', piedi: 'Piedi' }

export const ZONE_CATEGORIES: Record<StageZone, Category[]> = {
  busto: ['maglie', 'camicie', 'canotte', 'felpe_maglioni', 'giacche_cappotti'],
  gambe: ['pantaloni', 'jeans'],
  piedi: ['scarpe'],
}

export const MAX_LAYERS = 3

export type Outfit = {
  /** strati del busto nell'ordine in cui sono stati aggiunti; null = strato vuoto */
  busto: (string | null)[]
  gambe: string | null
  piedi: string | null
  /** capi del busto infilati nei pantaloni */
  tucked?: string[]
}

export type Active = { zone: StageZone; layer: number }

export type CamerinoState = { outfit: Outfit; active: Active }

export const EMPTY: CamerinoState = { outfit: { busto: [null], gambe: null, piedi: null }, active: { zone: 'busto', layer: 0 } }

const KEY = 'armadio.camerino.v1'

export function loadState(): CamerinoState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CamerinoState) : null
  } catch {
    return null
  }
}

export function saveState(s: CamerinoState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage non disponibile */
  }
}

/** Capi compatibili con una zona, nell'ordine dell'armadio. */
export function candidates(garments: Garment[], zone: StageZone): Garment[] {
  const cats = ZONE_CATEGORIES[zone]
  return garments.filter((g) => cats.includes(g.category))
}

/** Toglie dallo stato i capi che non esistono più e corregge l'indice attivo. */
export function sanitize(s: CamerinoState, garments: Garment[]): CamerinoState {
  const ids = new Set(garments.map((g) => g.id))
  const keep = (id: string | null) => (id && ids.has(id) ? id : null)
  const busto = s.outfit.busto.slice(0, MAX_LAYERS).map(keep)
  const outfit = {
    busto: busto.length ? busto : [null],
    gambe: keep(s.outfit.gambe),
    piedi: keep(s.outfit.piedi),
    tucked: (s.outfit.tucked ?? []).filter((id) => ids.has(id)),
  }
  const layer = s.active.zone === 'busto' ? Math.min(s.active.layer, outfit.busto.length - 1) : 0
  return { outfit, active: { zone: s.active.zone, layer: Math.max(0, layer) } }
}

/** Stato iniziale: un capo per zona, il busto parte dallo strato più interno. */
export function initialState(garments: Garment[]): CamerinoState {
  const inner = [...candidates(garments, 'busto')].sort((a, b) => a.layer_rank - b.layer_rank)[0]
  return {
    outfit: {
      busto: [inner?.id ?? null],
      gambe: candidates(garments, 'gambe')[0]?.id ?? null,
      piedi: candidates(garments, 'piedi')[0]?.id ?? null,
    },
    active: { zone: 'busto', layer: 0 },
  }
}

export function getActiveId(s: CamerinoState): string | null {
  const { zone, layer } = s.active
  return zone === 'busto' ? (s.outfit.busto[layer] ?? null) : s.outfit[zone]
}

export function setActiveId(s: CamerinoState, id: string | null): CamerinoState {
  const { zone, layer } = s.active
  if (zone === 'busto') {
    const busto = [...s.outfit.busto]
    busto[layer] = id
    return { ...s, outfit: { ...s.outfit, busto } }
  }
  return { ...s, outfit: { ...s.outfit, [zone]: id } }
}

/** Capo successivo (dir = 1) o precedente (dir = -1) della zona attiva, saltando quelli già indossati su altri strati. */
export function neighbor(s: CamerinoState, garments: Garment[], dir: 1 | -1): string | null {
  const list = candidates(garments, s.active.zone)
  if (list.length === 0) return null
  const current = getActiveId(s)
  const used = new Set(s.active.zone === 'busto' ? s.outfit.busto.filter((id, i) => id && i !== s.active.layer) : [])
  const start = Math.max(-1, list.findIndex((g) => g.id === current))
  for (let step = 1; step <= list.length; step++) {
    const i = (((start + dir * step) % list.length) + list.length) % list.length
    if (!used.has(list[i].id)) return list[i].id
  }
  return current
}

/** Nuovo strato sopra quelli esistenti, con un capo più esterno se possibile. */
export function addLayer(s: CamerinoState, garments: Garment[]): CamerinoState {
  if (s.outfit.busto.length >= MAX_LAYERS) return s
  const byId = new Map(garments.map((g) => [g.id, g]))
  const used = new Set(s.outfit.busto.filter(Boolean))
  const topRank = Math.max(0, ...s.outfit.busto.map((id) => (id ? (byId.get(id)?.layer_rank ?? 0) : 0)))
  const free = candidates(garments, 'busto').filter((g) => !used.has(g.id))
  const pick = free.find((g) => g.layer_rank > topRank) ?? free[0] ?? null
  const busto = [...s.outfit.busto, pick?.id ?? null]
  return { outfit: { ...s.outfit, busto }, active: { zone: 'busto', layer: busto.length - 1 } }
}

export function removeLayer(s: CamerinoState, layer: number): CamerinoState {
  const busto = s.outfit.busto.filter((_, i) => i !== layer)
  const next = busto.length ? busto : [null]
  const active = s.active.zone === 'busto' ? { zone: 'busto' as const, layer: Math.min(s.active.layer, next.length - 1) } : s.active
  return { outfit: { ...s.outfit, busto: next }, active }
}

const pickRandom = <T,>(list: T[]): T | null => (list.length ? list[Math.floor(Math.random() * list.length)] : null)

/** "Mescola": una maglia/camicia di base, a volte uno strato esterno, pantaloni e scarpe a caso. */
export function shuffle(garments: Garment[], active: Active): CamerinoState {
  const busto = candidates(garments, 'busto')
  const base = pickRandom(busto.filter((g) => g.layer_rank <= 2)) ?? pickRandom(busto)
  const outer = Math.random() < 0.5 ? pickRandom(busto.filter((g) => g.layer_rank > (base?.layer_rank ?? 0))) : null
  const layers = [base?.id ?? null, ...(outer ? [outer.id] : [])]
  return {
    outfit: {
      busto: layers,
      gambe: pickRandom(candidates(garments, 'gambe'))?.id ?? null,
      piedi: pickRandom(candidates(garments, 'piedi'))?.id ?? null,
    },
    active: active.zone === 'busto' ? { zone: 'busto', layer: 0 } : active,
  }
}

/** Mette un capo nel camerino nella sua zona (es. da "Prova nel camerino"). */
export function wear(s: CamerinoState, g: Garment): CamerinoState {
  const zone = (Object.keys(ZONE_CATEGORIES) as StageZone[]).find((z) => ZONE_CATEGORIES[z].includes(g.category))
  if (!zone) return s
  if (zone !== 'busto') return { outfit: { ...s.outfit, [zone]: g.id }, active: { zone, layer: 0 } }
  const existing = s.outfit.busto.indexOf(g.id)
  if (existing >= 0) return { ...s, active: { zone, layer: existing } }
  const layer = s.active.zone === 'busto' ? s.active.layer : 0
  const busto = [...s.outfit.busto]
  busto[layer] = g.id
  return { outfit: { ...s.outfit, busto }, active: { zone, layer } }
}
