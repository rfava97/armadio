import type { Category } from '@/lib/garments'
import { ctx2d, makeCanvas } from './canvas'

/**
 * Riconoscimento zero-shot con MobileCLIP S0 nel browser (transformers.js, caricato in lazy).
 * Primo avvio ~66 MB (visivo fp16 23 MB + testo q8 43 MB), poi tutto dalla cache del browser.
 * Gli embedding dei testi si calcolano una volta e restano in localStorage:
 * dalle volte successive serve solo il modello visivo.
 */
const MODEL = 'Xenova/mobileclip_s0'
const CACHE_KEY = 'armadio.clip-text-v2'
const READY_KEY = 'armadio.clip-ready'

/** true se il modello di riconoscimento è già stato scaricato su questo dispositivo. */
export function clipModelReady(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === MODEL
  } catch {
    return false
  }
}

type Noun = { label: string; gender: 'm' | 'f'; plural: boolean }
type Prompt = { text: string; category: Category; noun: Noun }

const n = (label: string, gender: 'm' | 'f', plural = false): Noun => ({ label, gender, plural })

const TYPE_PROMPTS: Prompt[] = [
  { text: 'a short-sleeved t-shirt', category: 'maglie', noun: n('T-shirt', 'f') },
  { text: 'a long-sleeved t-shirt', category: 'maglie', noun: n('Maglia a maniche lunghe', 'f') },
  { text: 'a polo shirt', category: 'maglie', noun: n('Polo', 'f') },
  { text: 'a henley shirt with buttons at the neck', category: 'maglie', noun: n('Henley', 'f') },
  { text: 'a button-up dress shirt with collar', category: 'camicie', noun: n('Camicia', 'f') },
  { text: 'a casual button-down shirt', category: 'camicie', noun: n('Camicia', 'f') },
  { text: 'a flannel checked shirt', category: 'camicie', noun: n('Camicia a quadri', 'f') },
  { text: 'a sleeveless tank top', category: 'canotte', noun: n('Canotta', 'f') },
  { text: 'a hoodie with a hood', category: 'felpe_maglioni', noun: n('Felpa con cappuccio', 'f') },
  { text: 'a crewneck sweatshirt', category: 'felpe_maglioni', noun: n('Felpa', 'f') },
  { text: 'a knitted wool sweater', category: 'felpe_maglioni', noun: n('Maglione', 'm') },
  { text: 'a cardigan', category: 'felpe_maglioni', noun: n('Cardigan', 'm') },
  { text: 'a sleeveless vest', category: 'gilet', noun: n('Gilet', 'm') },
  { text: 'a puffer vest without sleeves', category: 'gilet', noun: n('Gilet imbottito', 'm') },
  { text: 'a knitted sweater vest without sleeves', category: 'gilet', noun: n('Gilet di maglia', 'm') },
  { text: 'a jacket', category: 'giacche_cappotti', noun: n('Giacca', 'f') },
  { text: 'a long winter coat', category: 'giacche_cappotti', noun: n('Cappotto', 'm') },
  { text: 'a tailored blazer', category: 'giacche_cappotti', noun: n('Blazer', 'm') },
  { text: 'a puffer down jacket', category: 'giacche_cappotti', noun: n('Piumino', 'm') },
  { text: 'a denim jacket', category: 'giacche_cappotti', noun: n('Giacca di jeans', 'f') },
  { text: 'a pair of blue denim jeans', category: 'jeans', noun: n('Jeans', 'm', true) },
  { text: 'a pair of black denim jeans', category: 'jeans', noun: n('Jeans', 'm', true) },
  { text: 'a pair of dress trousers', category: 'pantaloni', noun: n('Pantaloni eleganti', 'm', true) },
  { text: 'a pair of chino pants', category: 'pantaloni', noun: n('Chino', 'm', true) },
  { text: 'a pair of sweatpants', category: 'pantaloni', noun: n('Pantaloni della tuta', 'm', true) },
  { text: 'a pair of shorts', category: 'pantaloni', noun: n('Pantaloncini', 'm', true) },
  { text: 'a pair of sneakers', category: 'scarpe', noun: n('Sneakers', 'f', true) },
  { text: 'a pair of leather dress shoes', category: 'scarpe', noun: n('Scarpe eleganti', 'f', true) },
  { text: 'a pair of boots', category: 'scarpe', noun: n('Stivaletti', 'm', true) },
  { text: 'a pair of sandals', category: 'scarpe', noun: n('Sandali', 'm', true) },
  { text: 'a baseball cap', category: 'accessori', noun: n('Cappello', 'm') },
  { text: 'a beanie hat', category: 'accessori', noun: n('Berretto', 'm') },
  { text: 'a leather belt', category: 'accessori', noun: n('Cintura', 'f') },
  { text: 'a bag', category: 'accessori', noun: n('Borsa', 'f') },
  { text: 'a scarf', category: 'accessori', noun: n('Sciarpa', 'f') },
  { text: 'a pair of sunglasses', category: 'accessori', noun: n('Occhiali da sole', 'm', true) },
  { text: 'a wristwatch', category: 'accessori', noun: n('Orologio', 'm') },
]

const FORMALITY = [
  { text: 'casual everyday clothing', tag: 'casual' },
  { text: 'formal elegant clothing', tag: 'elegante' },
  { text: 'athletic sportswear', tag: 'sport' },
]
const SEASON = [
  { text: 'light clothing for hot summer weather', tag: 'caldo' },
  { text: 'warm clothing for cold winter weather', tag: 'freddo' },
]

const ALL_TEXTS = [
  ...TYPE_PROMPTS.map((p) => `a photo of ${p.text}`),
  ...FORMALITY.map((p) => `a photo of ${p.text}`),
  ...SEASON.map((p) => `a photo of ${p.text}`),
]

export type Classification = {
  category: Category | null // null se confidenza < 0.5
  confidence: number
  noun: Noun
  tags: string[]
}

export type ModelProgress = (fraction: number) => void

type Clip = {
  processor: (img: unknown) => Promise<Record<string, unknown>>
  vision: (inputs: Record<string, unknown>) => Promise<{ image_embeds: { data: Float32Array } }>
  RawImage: { fromCanvas?: unknown; read: (c: HTMLCanvasElement) => Promise<unknown> }
  textEmbeds: Float32Array[]
}

let clipPromise: Promise<Clip> | null = null

function normalize(v: Float32Array): Float32Array {
  let s = 0
  for (const x of v) s += x * x
  const inv = 1 / Math.sqrt(s || 1)
  return v.map((x) => x * inv)
}

function readCache(): Float32Array[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { model: string; texts: string[]; dim: number; b64: string }
    if (parsed.model !== MODEL || parsed.texts.join('|') !== ALL_TEXTS.join('|')) return null
    const bytes = Uint8Array.from(atob(parsed.b64), (c) => c.charCodeAt(0))
    const all = new Float32Array(bytes.buffer)
    return ALL_TEXTS.map((_, i) => all.slice(i * parsed.dim, (i + 1) * parsed.dim))
  } catch {
    return null
  }
}

function writeCache(embeds: Float32Array[]) {
  try {
    const dim = embeds[0].length
    const all = new Float32Array(embeds.length * dim)
    embeds.forEach((e, i) => all.set(e, i * dim))
    const bytes = new Uint8Array(all.buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    localStorage.setItem(CACHE_KEY, JSON.stringify({ model: MODEL, texts: ALL_TEXTS, dim, b64: btoa(bin) }))
  } catch {
    /* quota piena: pazienza, si ricalcola la prossima volta */
  }
}

async function loadClip(onProgress?: ModelProgress): Promise<Clip> {
  const tf = await import('@huggingface/transformers')
  tf.env.allowLocalModels = false

  // progresso aggregato sui file scaricati
  const files = new Map<string, { loaded: number; total: number }>()
  const progress_callback = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status === 'progress' && info.file && info.total) {
      files.set(info.file, { loaded: info.loaded ?? 0, total: info.total })
      let l = 0,
        t = 0
      files.forEach((f) => {
        l += f.loaded
        t += f.total
      })
      onProgress?.(t ? l / t : 0)
    }
  }
  const opts = { dtype: 'q8' as const, progress_callback }

  const [processor, vision] = await Promise.all([
    tf.AutoProcessor.from_pretrained(MODEL, { progress_callback }),
    // visivo fp16 (23 MB): la versione q8 di MobileCLIP dà risultati sbagliati
    tf.CLIPVisionModelWithProjection.from_pretrained(MODEL, { ...opts, dtype: 'fp16' }),
  ])

  let textEmbeds = readCache()
  if (!textEmbeds) {
    const [tokenizer, textModel] = await Promise.all([
      tf.AutoTokenizer.from_pretrained(MODEL, { progress_callback }),
      tf.CLIPTextModelWithProjection.from_pretrained(MODEL, opts),
    ])
    // MobileCLIP richiede lunghezza fissa (77 token)
    const inputs = tokenizer(ALL_TEXTS, { padding: 'max_length', truncation: true })
    const { text_embeds } = (await textModel(inputs)) as { text_embeds: { data: Float32Array; dims: number[] } }
    const dim = text_embeds.dims[1]
    textEmbeds = ALL_TEXTS.map((_, i) => normalize(text_embeds.data.slice(i * dim, (i + 1) * dim)))
    writeCache(textEmbeds)
    await textModel.dispose()
  }

  try {
    localStorage.setItem(READY_KEY, MODEL)
  } catch {
    /* storage non disponibile */
  }
  return {
    processor: processor as unknown as Clip['processor'],
    vision: vision as unknown as Clip['vision'],
    RawImage: tf.RawImage as unknown as Clip['RawImage'],
    textEmbeds,
  }
}

function softmax(xs: number[]): number[] {
  const m = Math.max(...xs)
  const e = xs.map((x) => Math.exp(x - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((x) => x / s)
}

export async function classifyGarment(src: HTMLCanvasElement, onProgress?: ModelProgress): Promise<Classification> {
  clipPromise ??= loadClip(onProgress).catch((e) => {
    clipPromise = null
    throw e
  })
  const clip = await clipPromise

  // capo centrato in un quadrato bianco, come una foto da catalogo: il preprocessore
  // fa un ritaglio centrale quadrato e altrimenti taglierebbe colletto o scarpe
  const side = Math.max(src.width, src.height)
  const flat = makeCanvas(side, side)
  const ctx = ctx2d(flat)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, side, side)
  ctx.drawImage(src, (side - src.width) / 2, (side - src.height) / 2)

  const image = await clip.RawImage.read(flat)
  const inputs = await clip.processor(image)
  const { image_embeds } = await clip.vision(inputs)
  const img = normalize(image_embeds.data)
  const sims = clip.textEmbeds.map((t) => 100 * t.reduce((acc, v, i) => acc + v * img[i], 0))

  const typeProbs = softmax(sims.slice(0, TYPE_PROMPTS.length))
  const byCategory = new Map<Category, number>()
  TYPE_PROMPTS.forEach((p, i) => byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + typeProbs[i]))
  let bestCat: Category = TYPE_PROMPTS[0].category
  byCategory.forEach((v, k) => {
    if (v > (byCategory.get(bestCat) ?? 0)) bestCat = k
  })
  const confidence = byCategory.get(bestCat) ?? 0

  // sostantivo: il prompt più probabile dentro la categoria vincente
  let bestPrompt = TYPE_PROMPTS.findIndex((p) => p.category === bestCat)
  TYPE_PROMPTS.forEach((p, i) => {
    if (p.category === bestCat && typeProbs[i] > typeProbs[bestPrompt]) bestPrompt = i
  })

  const off = TYPE_PROMPTS.length
  const formality = softmax(sims.slice(off, off + FORMALITY.length))
  const season = softmax(sims.slice(off + FORMALITY.length))
  const tags: string[] = []
  const fi = formality.indexOf(Math.max(...formality))
  if (formality[fi] > 0.6) tags.push(FORMALITY[fi].tag)
  const si = season.indexOf(Math.max(...season))
  if (season[si] > 0.6) tags.push(SEASON[si].tag)

  return {
    category: confidence >= 0.5 ? bestCat : null,
    confidence,
    noun: TYPE_PROMPTS[bestPrompt].noun,
    tags,
  }
}

/** "Felpa con cappuccio" + verde oliva → "Felpa con cappuccio verde oliva"; concorda genere e numero. */
export function composeName(noun: Noun, colorForms: [string, string, string, string] | null): string {
  if (!colorForms) return noun.label
  const idx = (noun.gender === 'f' ? 1 : 0) + (noun.plural ? 2 : 0)
  return `${noun.label} ${colorForms[idx]}`
}
