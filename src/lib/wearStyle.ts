/**
 * Vestibilità di un "modo di indossare", letta dal suo nome: parole chiave combinabili
 * (es. "Aperta oversize", "Cropped", "Baggy"), il resto del nome passa così com'è.
 * Usata dai prompt di Gemini (sagoma e foto indossata).
 */
export type WearStyle = {
  open: boolean
  closed: boolean
  cropped: boolean
  oversize: boolean
  slim: boolean
  baggy: boolean
  rolled: boolean
  /** parole non riconosciute, passate a Gemini come descrizione libera */
  extra: string
}

const RULES: [keyof Omit<WearStyle, 'extra'>, RegExp][] = [
  ['open', /^(apert[aoie]|open|sbottonat[aoie]|unzipped)$/],
  ['closed', /^(chius[aoie]|closed|zipped|abbottonat[aoie])$/],
  ['cropped', /^(crop|cropped|cort[aoie])$/],
  ['oversize', /^(oversize|oversized|over|ampi[aoe]|abbondant[ei]|boxy)$/],
  ['slim', /^(aderent[ei]|slim|skinny|stretto|stretta|attillat[aoie])$/],
  ['baggy', /^(baggy|wide|morbid[aoie]|lungh[ie]|larghi|largo|larga|larghe)$/],
  ['rolled', /^(arrotolat[aoie]|rolled|risvolt[oi])$/],
]

export function parseWear(name: string): WearStyle {
  const style: WearStyle = { open: false, closed: false, cropped: false, oversize: false, slim: false, baggy: false, rolled: false, extra: '' }
  const rest: string[] = []
  for (const word of name.trim().toLowerCase().split(/[\s,+/]+/).filter(Boolean)) {
    if (word === 'base' || word === 'maniche' || word === 'e') continue
    const rule = RULES.find(([, re]) => re.test(word))
    if (rule) style[rule[0]] = true
    else rest.push(word)
  }
  style.extra = rest.join(' ')
  return style
}

const BOTTOMS = ['pantaloni', 'jeans']

/** "worn like this: …" */
export function describeWear(s: WearStyle, category: string): string {
  const bottom = BOTTOMS.includes(category)
  const parts: string[] = []
  if (s.open) parts.push('open (fully unzipped / unbuttoned), the two front panels hanging loose')
  if (s.closed) parts.push('closed (fully zipped / buttoned)')
  if (s.cropped) parts.push('cropped')
  if (s.oversize && !bottom) parts.push('oversized, loose and boxy, dropped shoulders')
  if ((s.baggy || s.oversize) && bottom) parts.push('baggy, wide and loose legs')
  if (s.baggy && !bottom) parts.push('loose')
  if (s.slim) parts.push('slim, close-fitting')
  if (s.rolled) parts.push(bottom ? 'with the hems rolled up' : 'with the sleeves pushed up to the mid forearm')
  if (s.extra) parts.push(s.extra)
  return parts.join(', ') || 'as it is normally worn'
}

/**
 * Regole di taglia e lunghezza riferite a qualcuno (il manichino o il modello): senza, Gemini copia
 * la lunghezza della foto del capo steso e lo fa troppo lungo.
 */
export function sizeRules(s: WearStyle, category: string, who: 'mannequin' | 'model'): string {
  const bottom = BOTTOMS.includes(category)
  const green = who === 'mannequin'
  const keep = (what: string) => (green ? `: the green ${what} must stay visible` : '')
  const out: string[] = []
  const relaxed = s.oversize || s.baggy
  out.push(
    relaxed
      ? `Size: relaxed as described, not tight, but sized for this ${who}.`
      : s.slim
        ? `Size: slim, close to this ${who}, not tight like a second skin.`
        : `Size: TRUE TO SIZE for this ${who}, a regular fit, not oversized and not longer than needed.`,
  )
  if (bottom) {
    out.push(`The waistband sits at the ${who} waist.`)
    if (s.baggy || s.oversize) {
      out.push(
        `The legs are wide and fall softly: the hem goes past the ankles and rests on the feet, stacking slightly and covering the top of the feet${green ? ' (only the green toes visible)' : ''}.`,
      )
    } else if (s.cropped || s.rolled) {
      out.push(`The hem ends a few centimetres above the ankles${keep('ankles')}.`)
    } else {
      out.push(`The hem ends at the ankles${keep('feet')}.`)
    }
  } else {
    out.push('Shoulder seams exactly on the shoulder points' + (s.oversize ? ', or slightly dropped.' : '.'))
    if (!s.rolled) out.push(`The cuffs end exactly at the ${who} wrists${green ? ': the whole green hand and a little green wrist must stay visible' : ''}.`)
    if (s.cropped) {
      out.push(`Cropped: the hem ends a few centimetres above the ${who} waist${green ? ', the green belly just above the waist stays visible' : ''}.`)
    } else if (category === 'camicie') {
      out.push(`The hem ends just below the ${who} waist, above the crotch.`)
    } else if (category === 'giacche_cappotti') {
      out.push(`A short jacket ends at the ${who} waist, above the hips; a coat keeps its real length.`)
    } else {
      out.push(`The hem ends at the ${who} waist (the narrowest point of the torso), well above the hips and the crotch${keep('hips')}.`)
    }
  }
  out.push(`If the garment in the garment image looks longer, adjust it: the length must follow the ${who} and these rules, not the garment image.`)
  return out.join(' ')
}

/** Suggerimenti di modi per tipo di capo (nel dettaglio capo). */
export const WEAR_SUGGESTIONS: Record<string, string[]> = {
  maglie: ['Regular', 'Cropped', 'Oversize'],
  canotte: ['Regular', 'Cropped'],
  camicie: ['Chiusa', 'Aperta', 'Oversize'],
  felpe_maglioni: ['Chiusa', 'Aperta', 'Cropped', 'Oversize'],
  giacche_cappotti: ['Chiusa', 'Aperta'],
  pantaloni: ['Regular', 'Baggy', 'Slim'],
  jeans: ['Regular', 'Baggy', 'Slim'],
}
