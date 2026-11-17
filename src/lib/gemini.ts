import type { Garment } from './garments'

/**
 * Collegamento a Gemini: niente API. L'app copia un prompt con l'outfit e apre l'app Gemini
 * (gratuita); le foto le allega l'utente.
 */

const KIND: Record<string, string> = {
  maglie: 'top',
  camicie: 'shirt',
  canotte: 'tank top',
  felpe_maglioni: 'sweatshirt / sweater',
  giacche_cappotti: 'jacket / coat',
  pantaloni: 'trousers',
  jeans: 'jeans',
  scarpe: 'shoes',
}

/** Prompt in inglese (Gemini lo segue meglio); le note di vestibilità restano come le scrive l'utente. */
export function geminiPrompt(items: Garment[], notes = ''): string {
  const lines = items.map((g, i) => {
    const worn = g.fit_photo_path ? ' — shown worn by another person: copy only the garment and the way it fits, not the person' : ''
    return `- Image ${i + 2}: ${KIND[g.category] ?? 'garment'} "${g.name}"${worn}`
  })
  const shoes = items.some((g) => g.category === 'scarpe')
  const layered = items.filter((g) => g.zone === 'busto').length > 1
  return [
    'Virtual try-on, photorealistic.',
    'Image 1 is a full-body photo of me. The other images are clothes from my wardrobe, in this order:',
    ...lines,
    '',
    'Dress me in these clothes.' + (layered ? ' Layer the upper-body garments in the order listed (first = innermost).' : ''),
    '',
    'Keep EXACTLY as in image 1: my face, hair, skin tone, body shape and proportions, height, pose, arm and leg position, framing, camera angle, lighting and the plain light background. Do not slim, bulk up, retouch or beautify me. Same image size and composition as image 1.',
    '',
    "Clothes: reproduce colour, fabric, texture, logos, prints and details exactly as in the reference images. Realistic fit with natural folds and drape, true to each garment's real cut: do not make loose or oversized garments tight.",
    notes.trim() ? `How I want to wear them: ${notes.trim()}` : '',
    shoes ? '' : 'Feet: keep them exactly as in image 1.',
    '',
    'Output: one single full-body image.',
  ]
    .filter((l, i, all) => !(l === '' && all[i - 1] === ''))
    .join('\n')
    .trim()
}
