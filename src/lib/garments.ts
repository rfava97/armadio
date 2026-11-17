export const CATEGORIES = [
  'maglie',
  'camicie',
  'canotte',
  'felpe_maglioni',
  'giacche_cappotti',
  'pantaloni',
  'jeans',
  'scarpe',
  'accessori',
] as const

export type Category = (typeof CATEGORIES)[number]
export type Zone = 'busto' | 'gambe' | 'piedi' | 'accessorio'
export type GarmentSource = 'camera' | 'gallery' | 'web'

export const CATEGORY_LABEL: Record<Category, string> = {
  maglie: 'Maglie',
  camicie: 'Camicie',
  canotte: 'Canotte',
  felpe_maglioni: 'Felpe e Maglioni',
  giacche_cappotti: 'Giacche e Cappotti',
  pantaloni: 'Pantaloni',
  jeans: 'Jeans',
  scarpe: 'Scarpe',
  accessori: 'Accessori',
}

/** Etichetta al singolare per la riga sotto il nome nella card. */
export const CATEGORY_SINGULAR: Record<Category, string> = {
  maglie: 'Maglia',
  camicie: 'Camicia',
  canotte: 'Canotta',
  felpe_maglioni: 'Felpa / Maglione',
  giacche_cappotti: 'Giacca / Cappotto',
  pantaloni: 'Pantaloni',
  jeans: 'Jeans',
  scarpe: 'Scarpe',
  accessori: 'Accessorio',
}

export const CATEGORY_ZONE: Record<Category, Zone> = {
  maglie: 'busto',
  camicie: 'busto',
  canotte: 'busto',
  felpe_maglioni: 'busto',
  giacche_cappotti: 'busto',
  pantaloni: 'gambe',
  jeans: 'gambe',
  scarpe: 'piedi',
  accessori: 'accessorio',
}

/** Ordine z di default nel busto: canotta/maglia < camicia < felpa < giacca (SPEC 2.2). */
export const CATEGORY_LAYER_RANK: Record<Category, number> = {
  canotte: 1,
  maglie: 1,
  camicie: 2,
  felpe_maglioni: 3,
  giacche_cappotti: 4,
  pantaloni: 1,
  jeans: 1,
  scarpe: 1,
  accessori: 1,
}

export const PRESET_TAGS = ['casual', 'elegante', 'sport', 'caldo', 'freddo'] as const

export type Garment = {
  id: string
  user_id: string
  name: string
  category: Category
  zone: Zone
  color: string | null
  tags: string[]
  image_path: string
  original_path: string | null
  source: GarmentSource | null
  layer_rank: number
  fit_scale: number
  fit_offset_x: number
  fit_offset_y: number
  /** "Su di me" (migrazione 003): livello nel bucket renders e foto del corpo usata */
  on_me_path?: string | null
  on_me_body?: string | null
  created_at: string
}

/** Percorsi nel bucket privato `garments`: <user_id>/<id>.webp e la miniatura <user_id>/<id>_thumb.webp */
export const garmentImagePath = (userId: string, id: string) => `${userId}/${id}.webp`
export const thumbPathFor = (imagePath: string) => imagePath.replace(/\.webp$/, '_thumb.webp')
