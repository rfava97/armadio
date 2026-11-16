/**
 * Palette di colori con nome italiano. Il capo salva l'hex del colore della palette
 * (colonna `color`), il nome si ricava da qui.
 * forms: [maschile singolare, femminile singolare, maschile plurale, femminile plurale]
 */
export type PaletteColor = { hex: string; name: string; forms: [string, string, string, string] }

const inv = (s: string): [string, string, string, string] => [s, s, s, s]

export const PALETTE: PaletteColor[] = [
  { hex: '#111111', name: 'nero', forms: ['nero', 'nera', 'neri', 'nere'] },
  { hex: '#3A3A3C', name: 'antracite', forms: inv('antracite') },
  { hex: '#808080', name: 'grigio', forms: ['grigio', 'grigia', 'grigi', 'grigie'] },
  { hex: '#C8C8C8', name: 'grigio chiaro', forms: ['grigio chiaro', 'grigia chiara', 'grigi chiari', 'grigie chiare'] },
  { hex: '#F5F5F2', name: 'bianco', forms: ['bianco', 'bianca', 'bianchi', 'bianche'] },
  { hex: '#EDE6D6', name: 'panna', forms: inv('panna') },
  { hex: '#D8C8A8', name: 'beige', forms: inv('beige') },
  { hex: '#B08A5A', name: 'cammello', forms: inv('cammello') },
  { hex: '#5C4033', name: 'marrone', forms: ['marrone', 'marrone', 'marroni', 'marroni'] },
  { hex: '#1F2A44', name: 'blu navy', forms: inv('blu navy') },
  { hex: '#2F5DA8', name: 'blu', forms: inv('blu') },
  { hex: '#4A6C8F', name: 'denim', forms: inv('denim') },
  { hex: '#8DB8E0', name: 'azzurro', forms: ['azzurro', 'azzurra', 'azzurri', 'azzurre'] },
  { hex: '#6B6B3A', name: 'verde oliva', forms: inv('verde oliva') },
  { hex: '#2E7D4F', name: 'verde', forms: ['verde', 'verde', 'verdi', 'verdi'] },
  { hex: '#9CAF88', name: 'verde salvia', forms: inv('verde salvia') },
  { hex: '#6D1A2A', name: 'bordeaux', forms: inv('bordeaux') },
  { hex: '#C62828', name: 'rosso', forms: ['rosso', 'rossa', 'rossi', 'rosse'] },
  { hex: '#E8A0B0', name: 'rosa', forms: inv('rosa') },
  { hex: '#E8772E', name: 'arancione', forms: ['arancione', 'arancione', 'arancioni', 'arancioni'] },
  { hex: '#E8C547', name: 'giallo', forms: ['giallo', 'gialla', 'gialli', 'gialle'] },
  { hex: '#6A4C93', name: 'viola', forms: inv('viola') },
]

export function paletteByHex(hex: string | null | undefined): PaletteColor | undefined {
  if (!hex) return undefined
  return PALETTE.find((c) => c.hex.toLowerCase() === hex.toLowerCase())
}

export const colorName = (hex: string | null | undefined) => paletteByHex(hex)?.name ?? null

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** sRGB → CIELAB (D65), per misurare distanze percettive. */
export function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  const lin = (c: number) => {
    c /= 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const PALETTE_LAB = PALETTE.map((c) => rgbToLab(hexToRgb(c.hex)))

export function nearestPaletteColor(rgb: [number, number, number]): PaletteColor {
  const lab = rgbToLab(rgb)
  let best = 0
  let bestD = Infinity
  PALETTE_LAB.forEach((p, i) => {
    const d = (p[0] - lab[0]) ** 2 + (p[1] - lab[1]) ** 2 + (p[2] - lab[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return PALETTE[best]
}
