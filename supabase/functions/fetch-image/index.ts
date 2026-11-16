// Edge Function `fetch-image` (SPEC §5): scarica un'immagine lato server per evitare i blocchi CORS.
// Input: POST { url }. Output: l'immagine così com'è (max 10 MB, solo image/*).
// Se l'URL è una pagina web (es. la scheda di un prodotto) prova a prendere la sua og:image.
// Solo utenti autenticati: il token viene verificato qui (deploy con --no-verify-jwt).

const MAX_BYTES = 10 * 1024 * 1024
const MAX_HTML = 2 * 1024 * 1024
const TIMEOUT_MS = 15_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

/** Blocca indirizzi locali o privati: la funzione non deve fare da ponte verso la rete interna. */
function assertPublicUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new HttpError(400, 'Link non valido.')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Il link deve iniziare con http o https.')
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const privateHost =
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.internal') ||
    h.endsWith('.local') ||
    /^(0|10|127)\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === '::1' ||
    /^f[cd][0-9a-f]{2}:/.test(h) ||
    /^fe80:/.test(h)
  if (privateHost) throw new HttpError(400, 'Link non consentito.')
  return u
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > max) throw new HttpError(413, "L'immagine è troppo grande (max 10 MB).")
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      throw new HttpError(413, "L'immagine è troppo grande (max 10 MB).")
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

/** Cerca l'immagine principale di una pagina (og:image, twitter:image, image_src). */
function findPageImage(html: string, base: URL): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
    /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m) {
      try {
        return new URL(m[1].replace(/&amp;/g, '&'), base).toString()
      } catch {
        /* prova il successivo */
      }
    }
  }
  return null
}

async function download(raw: string, depth = 0): Promise<{ bytes: Uint8Array; type: string }> {
  const url = assertPublicUrl(raw)
  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // alcuni siti rifiutano client senza un user agent da browser
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,text/html;q=0.5,*/*;q=0.1',
      },
    })
  } catch {
    throw new HttpError(502, 'Il sito non risponde.')
  }
  if (!res.ok) throw new HttpError(502, `Il sito ha risposto con errore ${res.status}.`)
  // anche dopo i redirect la destinazione deve essere pubblica
  assertPublicUrl(res.url || raw)

  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type.startsWith('image/') && type !== 'image/svg+xml') {
    return { bytes: await readCapped(res, MAX_BYTES), type }
  }
  if (type === 'text/html' && depth === 0) {
    const html = new TextDecoder().decode(await readCapped(res, MAX_HTML))
    const img = findPageImage(html, new URL(res.url || raw))
    if (img) return download(img, depth + 1)
    throw new HttpError(415, "In questa pagina non trovo un'immagine: copia l'indirizzo dell'immagine.")
  }
  await res.body?.cancel()
  throw new HttpError(415, "Il link non porta a un'immagine.")
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

  let url: unknown
  try {
    ;({ url } = await req.json())
  } catch {
    return fail(400, 'Richiesta non valida.')
  }
  if (typeof url !== 'string' || !url) return fail(400, 'Manca il link.')

  try {
    const { bytes, type } = await download(url)
    return new Response(bytes, { headers: { ...cors, 'Content-Type': type, 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message)
    console.error(e)
    return fail(500, 'Download non riuscito.')
  }
})
