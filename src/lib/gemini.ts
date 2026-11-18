import type { Garment } from './garments'
import { describeWear, parseWear, sizeRules } from './wearStyle'

/**
 * Collegamento a Gemini: niente API. L'app copia un prompt con l'outfit e apre l'app Gemini
 * (gratuita); le foto le allega l'utente.
 */

export const KIND: Record<string, string> = {
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
export function geminiPrompt(items: Garment[], notes = '', worn: Set<string> = new Set()): string {
  const lines = items.map((g, i) => {
    const w = worn.has(g.id) ? ' — shown worn by another person: copy only the garment and the way it fits, not the person' : ''
    return `- Image ${i + 2}: ${KIND[g.category] ?? 'garment'} "${g.name}"${w}`
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

/**
 * Prompt per far creare a Gemini la foto indossata di un capo: un modello qualunque, con la tua
 * altezza, che lo porta come indicato (es. "aperta"). Nessuna tua foto: solo quella del capo.
 */
export function geminiFitPrompt(g: Garment, howIt: string, heightCm: number | null | undefined): string {
  const bottom = g.zone === 'gambe'
  const style = parseWear(howIt)
  return [
    'Fashion e-commerce photo. Use the garment in the attached image.',
    `Create a photo of a man wearing exactly this ${KIND[g.category] ?? 'garment'}, worn like this: ${describeWear(style, g.category)}.`,
    `Model: about ${Math.round(heightCm ?? 175)} cm tall, average build, standing straight and facing the camera, arms slightly away from the body, full body visible from head to feet.`,
    bottom
      ? 'He also wears a plain fitted white t-shirt and is barefoot, so the garment is clearly visible.'
      : 'He also wears plain fitted black trousers and is barefoot, so the garment is clearly visible.',
    'Reproduce the garment exactly: colour, fabric, texture, logos, prints, zips, buttons and details. Natural folds and drape, true to how it is worn above.',
    sizeRules(style, g.category, 'model'),
    'Plain light grey background, soft even studio light, sharp photo.',
    'Output: one single full-body image.',
  ].join('\n')
}
