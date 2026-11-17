import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase'
import { ctx2d, makeCanvas } from './image/canvas'

/** Immagine su fondo pieno (i modelli di try-on non gestiscono la trasparenza), JPEG in base64. */
export async function flatten(src: string | Blob, background: string, maxSide = 1024): Promise<string> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k)
  const h = Math.round(bmp.height * k)
  // margine attorno alla figura: i modelli lavorano meglio con un po' di spazio
  const pad = Math.round(Math.max(w, h) * 0.06)
  const c = makeCanvas(w + pad * 2, h + pad * 2)
  const ctx = ctx2d(c)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, pad, pad, w, h)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.92)
}

/** photoType: "model" se nella foto il capo è indossato da qualcuno (vestibilità e chiusura copiate). */
export async function callTryOn(
  person: string,
  garment: string,
  category: 'tops' | 'bottoms',
  photoType: 'flat-lay' | 'model' = 'flat-lay',
): Promise<{ blob: Blob; model: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessione scaduta: rientra nell’app.')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tryon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
    body: JSON.stringify({ person, garment, category, photoType }),
  })
  if (res.status === 404) throw new Error('La funzione "tryon" non è ancora pubblicata su Supabase.')
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) {
    let msg = 'Generazione non riuscita.'
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg
    } catch {
      /* risposta non JSON */
    }
    throw new Error(msg)
  }
  return { blob: await res.blob(), model: res.headers.get('x-tryon-model') ?? 'Hugging Face' }
}

export type TryOnStep = 'prepare' | 'top' | 'bottom'

/**
 * "Provalo su di me": prima la maglia (lo strato più esterno), poi i pantaloni sulla foto già
 * vestita. Ogni passaggio è una generazione sulla quota gratuita di Hugging Face.
 */
export async function tryOnOutfit(
  input: { body: string; top?: string; bottom?: string; topWorn?: boolean; bottomWorn?: boolean },
  onStep: (s: TryOnStep) => void,
): Promise<{ blob: Blob; model: string }> {
  onStep('prepare')
  let person = await flatten(input.body, '#f3f1ec', 1024)
  let result: { blob: Blob; model: string } | null = null
  if (input.top) {
    onStep('top')
    result = await callTryOn(person, await flatten(input.top, '#ffffff', 768), 'tops', input.topWorn ? 'model' : 'flat-lay')
    person = await flatten(result.blob, '#f3f1ec', 1024)
  }
  if (input.bottom) {
    onStep('bottom')
    result = await callTryOn(person, await flatten(input.bottom, '#ffffff', 768), 'bottoms', input.bottomWorn ? 'model' : 'flat-lay')
  }
  if (!result) throw new Error('Metti almeno una maglia o un pantalone nel camerino.')
  return result
}

/** URL firmato dell'immagine intera di un capo (non la miniatura). */
export async function garmentImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('garments').createSignedUrl(path, 600)
  if (error) throw error
  return data.signedUrl
}
