import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase'

/** Apre Google Immagini in una nuova scheda (SPEC 1.3). */
export function googleImagesUrl(query: string) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query.trim())}`
}

/**
 * Estrae il link dell'immagine da un testo incollato. Gestisce i link di Google Immagini
 * ("…/imgres?imgurl=<immagine>&…") e gli URL data:.
 */
export function extractImageUrl(text: string): string | null {
  const t = text.trim()
  if (t.startsWith('data:image/')) return t
  const m = t.match(/https?:\/\/[^\s"'<>]+/i)
  if (!m) return null
  try {
    const u = new URL(m[0])
    const inner = u.searchParams.get('imgurl') ?? u.searchParams.get('mediaurl')
    if (inner && /^https?:\/\//i.test(inner)) return inner
    return u.toString()
  } catch {
    return null
  }
}

const extFor = (type: string) => (type.split('/')[1] ?? 'img').replace('jpeg', 'jpg').replace(/\+.*/, '')
const toFile = (blob: Blob, type = blob.type || 'image/jpeg') => new File([blob], `web.${extFor(type)}`, { type })

/** Scarica l'immagine passando dalla Edge Function `fetch-image` (niente problemi di CORS). */
export async function downloadImage(url: string): Promise<File> {
  if (url.startsWith('data:image/')) return toFile(await (await fetch(url)).blob())

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessione scaduta: rientra nell’app.')

  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify({ url }),
    })
  } catch {
    // funzione non raggiungibile: alcuni siti permettono il download diretto
    return directDownload(url)
  }
  if (res.status === 404) return directDownload(url) // funzione non ancora pubblicata
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) {
    let msg = 'Download non riuscito.'
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg
    } catch {
      /* risposta non JSON */
    }
    throw new Error(msg)
  }
  return toFile(await res.blob(), type)
}

async function directDownload(url: string): Promise<File> {
  try {
    const r = await fetch(url, { mode: 'cors' })
    const blob = await r.blob()
    if (r.ok && blob.type.startsWith('image/')) return toFile(blob)
  } catch {
    /* bloccato dal CORS */
  }
  throw new Error('Non riesco a scaricare questa immagine. Prova a copiare l’immagine invece del link.')
}

export type ClipboardContent = { kind: 'file'; file: File } | { kind: 'url'; url: string } | { kind: 'empty' }

/**
 * Legge gli appunti: prima un'immagine copiata, altrimenti un link.
 * Su iPhone Safari mostra il fumetto "Incolla" da toccare.
 * Lancia un errore se il browser non permette di leggere gli appunti.
 */
export async function readClipboard(): Promise<ClipboardContent> {
  // può mancare (contesto non sicuro) o non avere read() (Firefox vecchi)
  const clip = navigator.clipboard as Partial<Clipboard> | undefined
  if (clip?.read) {
    const items = await clip.read()
    for (const it of items) {
      const img = it.types.find((t) => t.startsWith('image/'))
      if (img) return { kind: 'file', file: toFile(await it.getType(img), img) }
    }
    for (const it of items) {
      for (const t of ['text/uri-list', 'text/plain', 'text/html']) {
        if (!it.types.includes(t)) continue
        const text = await (await it.getType(t)).text()
        const fromHtml = t === 'text/html' ? text.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] : null
        const url = extractImageUrl(fromHtml ?? text)
        if (url) return { kind: 'url', url }
      }
    }
    return { kind: 'empty' }
  }
  if (clip?.readText) {
    const url = extractImageUrl(await clip.readText())
    return url ? { kind: 'url', url } : { kind: 'empty' }
  }
  throw new Error('unsupported')
}
