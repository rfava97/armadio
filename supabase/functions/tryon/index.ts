// Edge Function `tryon` (SPEC 2.3 C, "Provalo su di me"): veste la foto del corpo con un capo usando
// un modello open source di virtual try-on ospitato gratis su Hugging Face (ZeroGPU).
// Input: POST { person, garment, category, photoType } con le due immagini in base64 (JPEG/PNG),
// category "tops" | "bottoms" e photoType "flat-lay" (capo steso, default) | "model" (capo indossato:
// il modello ne copia vestibilità e chiusura). Output: l'immagine generata.
// Il token HF (account gratuito, senza carta) sta solo nei secrets: HF_TOKEN. Senza token si usa la
// quota anonima, più piccola.
// Solo utenti autenticati: il token Supabase viene verificato qui (deploy con --no-verify-jwt).

const MAX_IMAGE = 6 * 1024 * 1024
const BUDGET_MS = 140_000 // le Edge Functions gratuite si fermano a 150 s

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-tryon-model',
}

const fail = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Category = 'tops' | 'bottoms'
type PhotoType = 'flat-lay' | 'model'
type FileData = { path: string; meta: { _type: 'gradio.FileData' } }

type Model = {
  id: string
  name: string
  host: string
  api: string
  data: (person: FileData, garment: FileData, category: Category, photo: PhotoType) => unknown[]
}

/** Modelli in ordine di preferenza: se uno non risponde si passa al successivo. */
const MODELS: Model[] = [
  {
    // Apache-2.0, ha una modalità apposta per capi fotografati stesi, nessuna maschera da fornire
    id: 'fashn-ai/fashn-vton-1.5',
    name: 'FASHN VTON 1.5',
    host: 'https://fashn-ai-fashn-vton-1-5.hf.space',
    api: 'try_on',
    data: (p, g, c, photo) => [p, g, c, photo, 30, 1.5, 42, true],
  },
  {
    // MIT; "dress_code" gestisce anche pantaloni e gonne
    id: 'franciszzj/Leffa',
    name: 'Leffa',
    host: 'https://franciszzj-leffa.hf.space',
    api: 'leffa_predict_vt',
    data: (p, g, c) => [
      p,
      g,
      'False',
      30,
      2.5,
      42,
      c === 'bottoms' ? 'dress_code' : 'viton_hd',
      c === 'bottoms' ? 'lower_body' : 'upper_body',
      'False',
    ],
  },
]

function hfHeaders(): Record<string, string> {
  const token = Deno.env.get('HF_TOKEN')
  // come il client ufficiale di Gradio: la quota ZeroGPU viene conteggiata su questo account
  return token ? { 'X-HF-Authorization': `Bearer ${token}` } : {}
}

function decodeImage(b64: unknown): Uint8Array {
  if (typeof b64 !== 'string' || !b64) throw new HttpError(400, 'Immagine mancante.')
  const clean = b64.replace(/^data:image\/[a-z+]+;base64,/, '')
  if (clean.length > (MAX_IMAGE * 4) / 3) throw new HttpError(413, 'Immagine troppo grande.')
  try {
    return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0))
  } catch {
    throw new HttpError(400, 'Immagine non valida.')
  }
}

async function isRunning(m: Model): Promise<boolean> {
  try {
    const r = await fetch(`https://huggingface.co/api/spaces/${m.id}`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return false
    const info = await r.json()
    return info?.runtime?.stage === 'RUNNING'
  } catch {
    return false
  }
}

async function upload(m: Model, bytes: Uint8Array, name: string): Promise<FileData> {
  const form = new FormData()
  form.append('files', new Blob([bytes], { type: 'image/jpeg' }), name)
  const r = await fetch(`${m.host}/gradio_api/upload`, {
    method: 'POST',
    headers: hfHeaders(),
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  if (!r.ok) throw new Error(`upload ${r.status}`)
  const paths = (await r.json()) as string[]
  return { path: paths[0], meta: { _type: 'gradio.FileData' } }
}

/** Legge lo stream SSE di Gradio fino a "complete" (o errore). */
async function waitResult(m: Model, eventId: string, deadline: number): Promise<unknown[]> {
  const r = await fetch(`${m.host}/gradio_api/call/${m.api}/${eventId}`, {
    headers: hfHeaders(),
    signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
  })
  if (!r.ok || !r.body) throw new Error(`stream ${r.status}`)
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  let event = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += value
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (event === 'complete') {
          await reader.cancel()
          return JSON.parse(data) as unknown[]
        }
        if (event === 'error') {
          await reader.cancel()
          const msg = data && data !== 'null' ? data : ''
          if (/quota|exceeded|GPU/i.test(msg)) {
            throw new HttpError(429, 'Quota gratuita di Hugging Face finita per oggi: riprova domani.')
          }
          throw new Error(`errore del modello ${msg}`)
        }
      }
    }
  }
  throw new Error('stream chiuso senza risultato')
}

async function runModel(m: Model, person: Uint8Array, garment: Uint8Array, category: Category, photo: PhotoType, deadline: number) {
  const [p, g] = await Promise.all([upload(m, person, 'person.jpg'), upload(m, garment, 'garment.jpg')])
  const r = await fetch(`${m.host}/gradio_api/call/${m.api}`, {
    method: 'POST',
    headers: { ...hfHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: m.data(p, g, category, photo) }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`call ${r.status}`)
  const { event_id } = (await r.json()) as { event_id: string }
  const out = await waitResult(m, event_id, deadline)
  const first = out[0] as { url?: string; path?: string } | null
  const url = first?.url ?? (first?.path ? `${m.host}/gradio_api/file=${first.path}` : null)
  if (!url) throw new Error('risultato senza immagine')
  const img = await fetch(url, { headers: hfHeaders(), signal: AbortSignal.timeout(20_000) })
  if (!img.ok) throw new Error(`download ${img.status}`)
  return { bytes: new Uint8Array(await img.arrayBuffer()), type: img.headers.get('content-type') ?? 'image/png' }
}

async function isAuthenticated(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization')
  const apikey = req.headers.get('apikey')
  const base = Deno.env.get('SUPABASE_URL')
  if (!auth || !apikey || !base) return false
  const r = await fetch(`${base}/auth/v1/user`, { headers: { authorization: auth, apikey } })
  return r.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail(405, 'Metodo non consentito.')
  if (!(await isAuthenticated(req))) return fail(401, 'Accesso richiesto.')

  const deadline = Date.now() + BUDGET_MS
  try {
    const body = await req.json().catch(() => null)
    if (!body) throw new HttpError(400, 'Richiesta non valida.')
    const category: Category = body.category === 'bottoms' ? 'bottoms' : 'tops'
    const photo: PhotoType = body.photoType === 'model' ? 'model' : 'flat-lay'
    const person = decodeImage(body.person)
    const garment = decodeImage(body.garment)

    let lastError: unknown = null
    for (const m of MODELS) {
      if (Date.now() > deadline - 30_000) break
      if (!(await isRunning(m))) continue
      try {
        const { bytes, type } = await runModel(m, person, garment, category, photo, deadline)
        return new Response(bytes, { headers: { ...cors, 'Content-Type': type, 'x-tryon-model': m.name, 'Cache-Control': 'no-store' } })
      } catch (e) {
        if (e instanceof HttpError) throw e // quota finita: inutile provare altri modelli
        console.error(m.id, e)
        lastError = e
      }
    }
    if (lastError instanceof DOMException && lastError.name === 'TimeoutError') {
      throw new HttpError(504, 'Hugging Face è molto occupato in questo momento: riprova tra qualche minuto.')
    }
    throw new HttpError(503, 'Nessun modello di prova disponibile adesso: riprova più tardi.')
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message)
    console.error(e)
    return fail(500, 'Generazione non riuscita.')
  }
})
