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

/**
 * Ordine degli strati del busto, dall'interno verso l'esterno: canotta, maglia, camicia,
 * felpa/maglione, giacca/cappotto. Ogni strato è più esterno di quello sotto: niente maglia sopra
 * una felpa, niente due felpe una sopra l'altra.
 */
export const LAYER_ORDER: Partial<Record<Category, number>> = {
  canotte: 0,
  maglie: 1,
  camicie: 2,
  felpe_maglioni: 3,
  giacche_cappotti: 4,
}
export const layerOrder = (g: Garment | undefined) => (g ? (LAYER_ORDER[g.category] ?? 0) : 0)

export type Outfit = {
  /** strati del busto nell'ordine in cui sono stati aggiunti; null = strato vuoto */
  busto: (string | null)[]
  gambe: string | null
  piedi: string | null
  /** capi del busto infilati nei pantaloni */
  tucked?: string[]
  /** modo di indossare scelto per ogni capo (id capo → id modo, es. felpa "Aperta") */
  wears?: Record<string, string>
  /** strati del busto tenuti dentro i capi sopra: non escono sotto il loro orlo */
  inside?: string[]
  /** strati del busto con il colletto (o il cappuccio) lasciato sotto i capi sopra */
  collarIn?: string[]
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

/**
 * Capi possibili nello strato attivo: per il busto, più esterni dello strato sotto e più interni di
 * quello sopra; per le altre zone, quelli della zona.
 */
export function candidatesFor(s: CamerinoState, garments: Garment[]): Garment[] {
  const { zone, layer } = s.active
  if (zone !== 'busto') return candidates(garments, zone)
  const byId = new Map(garments.map((g) => [g.id, g]))
  const at = (id: string | null) => (id ? byId.get(id) : undefined)
  const below = s.outfit.busto.slice(0, layer).map(at).filter(Boolean).at(-1)
  const above = s.outfit.busto.slice(layer + 1).map(at).find(Boolean)
  const lo = below ? layerOrder(below) : -1
  const hi = above ? layerOrder(above) : Infinity
  return candidates(garments, 'busto').filter((g) => layerOrder(g) > lo && layerOrder(g) < hi)
}

/** Strati del busto in ordine, uno per tipo (il primo che c'era), gli strati vuoti in fondo. */
function orderBusto(busto: (string | null)[], garments: Garment[]): (string | null)[] {
  const byId = new Map(garments.map((g) => [g.id, g]))
  const seen = new Set<number>()
  const full = busto
    .filter((id): id is string => !!id && byId.has(id))
    .filter((id) => {
      const o = layerOrder(byId.get(id))
      if (seen.has(o)) return false
      seen.add(o)
      return true
    })
    .sort((a, b) => layerOrder(byId.get(a)) - layerOrder(byId.get(b)))
  const empty = busto.filter((id) => !id).length
  return [...full, ...Array<null>(Math.min(empty, MAX_LAYERS - full.length)).fill(null)].slice(0, MAX_LAYERS)
}

/** Toglie dallo stato i capi che non esistono più, rimette in ordine gli strati e corregge l'indice attivo. */
export function sanitize(s: CamerinoState, garments: Garment[]): CamerinoState {
  const ids = new Set(garments.map((g) => g.id))
  const keep = (id: string | null) => (id && ids.has(id) ? id : null)
  const busto = orderBusto(s.outfit.busto.map(keep), garments)
  const outfit = {
    busto: busto.length ? busto : [null],
    gambe: keep(s.outfit.gambe),
    piedi: keep(s.outfit.piedi),
    tucked: (s.outfit.tucked ?? []).filter((id) => ids.has(id)),
    wears: Object.fromEntries(Object.entries(s.outfit.wears ?? {}).filter(([id]) => ids.has(id))),
    inside: (s.outfit.inside ?? []).filter((id) => ids.has(id)),
    collarIn: (s.outfit.collarIn ?? []).filter((id) => ids.has(id)),
  }
  const layer = s.active.zone === 'busto' ? Math.min(s.active.layer, outfit.busto.length - 1) : 0
  return { outfit, active: { zone: s.active.zone, layer: Math.max(0, layer) } }
}

/** Stato iniziale: un capo per zona, il busto parte dallo strato più interno. */
export function initialState(garments: Garment[]): CamerinoState {
  const inner = [...candidates(garments, 'busto')].sort((a, b) => layerOrder(a) - layerOrder(b))[0]
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
  const list = candidatesFor(s, garments)
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

/** Capi che possono andare in un nuovo strato sopra (più esterni dell'ultimo); vuoto se non si può. */
function outerOptions(s: CamerinoState, garments: Garment[]): Garment[] {
  const busto = s.outfit.busto
  if (busto.length >= MAX_LAYERS || !busto[busto.length - 1]) return []
  const byId = new Map(garments.map((g) => [g.id, g]))
  const top = Math.max(...busto.map((id) => (id ? layerOrder(byId.get(id)) : -1)))
  return candidates(garments, 'busto').filter((g) => layerOrder(g) > top)
}

/** Si può aggiungere uno strato: c'è posto, l'ultimo non è vuoto e c'è un capo più esterno. */
export const canAddLayer = (s: CamerinoState, garments: Garment[]) => outerOptions(s, garments).length > 0

/** Nuovo strato sopra quelli esistenti, con il capo più vicino tra quelli più esterni. */
export function addLayer(s: CamerinoState, garments: Garment[]): CamerinoState {
  const options = outerOptions(s, garments).sort((a, b) => layerOrder(a) - layerOrder(b))
  if (!options.length) return s
  const busto = [...s.outfit.busto, options[0].id]
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
  const base = pickRandom(busto.filter((g) => layerOrder(g) <= 2)) ?? pickRandom(busto)
  const outer = Math.random() < 0.5 ? pickRandom(busto.filter((g) => layerOrder(g) > layerOrder(base ?? undefined))) : null
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

/**
 * Mette un capo nel camerino nella sua zona (es. da "Prova nel camerino"). Nel busto va nello strato
 * del suo tipo: sostituisce un capo dello stesso tipo, altrimenti si aggiunge nel posto giusto; se gli
 * strati sono già 3, prende il posto di quello di tipo più vicino.
 */
export function wear(s: CamerinoState, g: Garment, garments: Garment[]): CamerinoState {
  const zone = (Object.keys(ZONE_CATEGORIES) as StageZone[]).find((z) => ZONE_CATEGORIES[z].includes(g.category))
  if (!zone) return s
  if (zone !== 'busto') return { outfit: { ...s.outfit, [zone]: g.id }, active: { zone, layer: 0 } }
  const byId = new Map(garments.map((x) => [x.id, x]))
  const o = layerOrder(g)
  let ids = s.outfit.busto.filter((id): id is string => !!id && id !== g.id && layerOrder(byId.get(id)) !== o)
  if (ids.length >= MAX_LAYERS) {
    const near = ids.reduce((a, b) => (Math.abs(layerOrder(byId.get(b)) - o) < Math.abs(layerOrder(byId.get(a)) - o) ? b : a))
    ids = ids.filter((id) => id !== near)
  }
  const rank = (id: string) => (id === g.id ? o : layerOrder(byId.get(id)))
  const busto = [...ids, g.id].sort((a, b) => rank(a) - rank(b))
  return { outfit: { ...s.outfit, busto }, active: { zone, layer: busto.indexOf(g.id) } }
}

/** Sceglie il modo di indossare un capo (es. "Aperta"). */
export function setWear(s: CamerinoState, garmentId: string, wearId: string): CamerinoState {
  return { ...s, outfit: { ...s.outfit, wears: { ...s.outfit.wears, [garmentId]: wearId } } }
}

/** Strato del busto dentro i capi sopra (non esce sotto il loro orlo) o fuori. */
export function setCollarIn(s: CamerinoState, garmentId: string, collarIn: boolean): CamerinoState {
  const rest = (s.outfit.collarIn ?? []).filter((id) => id !== garmentId)
  return { ...s, outfit: { ...s.outfit, collarIn: collarIn ? [...rest, garmentId] : rest } }
}

export function setInside(s: CamerinoState, garmentId: string, inside: boolean): CamerinoState {
  const rest = (s.outfit.inside ?? []).filter((id) => id !== garmentId)
  return { ...s, outfit: { ...s.outfit, inside: inside ? [...rest, garmentId] : rest } }
}
