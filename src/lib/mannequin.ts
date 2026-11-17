/**
 * Manichino parametrico (SPEC 2.3 A): geometria in centimetri, vista frontale.
 * Tutto è calcolato qui, il componente React disegna soltanto.
 */

export type Measures = {
  body_shape: number // 0 femminile … 100 maschile
  height_cm: number
  weight_kg: number | null
  shoulders_cm: number | null
  chest_cm: number | null
  waist_cm: number | null
  hips_cm: number | null
  legs_cm: number | null // lunghezza interna gamba (cavallo → pavimento)
}

export type ResolvedMeasures = { [K in keyof Measures]: number }

export const DEFAULT_MEASURES: Measures = {
  body_shape: 85,
  height_cm: 174,
  weight_kg: null,
  shoulders_cm: null,
  chest_cm: null,
  waist_cm: 78,
  hips_cm: 93,
  legs_cm: null,
}

/** Stime per le misure non inserite, in base ad altezza e forma del corpo. */
export function estimate(m: Measures): ResolvedMeasures {
  const s = m.body_shape / 100
  const h = m.height_cm
  return {
    body_shape: m.body_shape,
    height_cm: h,
    weight_kg: m.weight_kg ?? Math.round(23 * (h / 100) ** 2),
    shoulders_cm: m.shoulders_cm ?? Math.round(h * (0.23 + 0.03 * s)),
    chest_cm: m.chest_cm ?? Math.round(h * (0.5 + 0.05 * s)),
    waist_cm: m.waist_cm ?? Math.round(h * (0.4 + 0.05 * s)),
    hips_cm: m.hips_cm ?? Math.round(h * (0.56 - 0.03 * s)),
    legs_cm: m.legs_cm ?? Math.round(h * 0.45),
  }
}

/** Gli ancoraggi della SPEC: 7 punti usati per posizionare i capi (e calibrati sulla foto). */
export const ANCHOR_KEYS = ['neck', 'shoulder_l', 'shoulder_r', 'waist', 'hips', 'ankle_l', 'ankle_r'] as const
export type AnchorKey = (typeof ANCHOR_KEYS)[number]
export type Point = { x: number; y: number }
/** Coordinate 0..1 rispetto al riquadro dell'immagine (manichino o foto). "_l" = lato sinistro dell'immagine. */
export type Anchors = Record<AnchorKey, Point>

export const ANCHOR_LABEL: Record<AnchorKey, string> = {
  neck: 'Collo',
  shoulder_l: 'Spalla',
  shoulder_r: 'Spalla',
  waist: 'Vita',
  hips: 'Fianchi',
  ankle_l: 'Caviglia',
  ankle_r: 'Caviglia',
}

// riquadro fisso: un manichino più alto occupa davvero più spazio
export const VIEW = { x: -50, y: 0, w: 100, h: 216 }
const GROUND = 212

export type MannequinShape = {
  head: { cx: number; cy: number; rx: number; ry: number }
  neck: string
  torso: string
  legs: [string, string]
  arms: [string, string]
  feet: [{ cx: number; cy: number; rx: number; ry: number }, { cx: number; cy: number; rx: number; ry: number }]
  floor: { cx: number; cy: number; rx: number; ry: number }
  /** ancoraggi in coordinate 0..1 del riquadro VIEW */
  anchors: Anchors
  /** riquadro che contiene la figura, in coordinate 0..1 di VIEW (per adattare gli ancoraggi a una foto ritagliata) */
  bounds: { x: number; y: number; w: number; h: number }
  /** larghezza del corpo ai fianchi, in frazione della larghezza di VIEW */
  hipWidth: number
}

type P = [number, number]

/** Curva morbida (Catmull-Rom → Bézier) che passa per tutti i punti. */
function smooth(points: P[], closed = true): string {
  const n = points.length
  const at = (i: number) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]
  let d = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return closed ? d + 'Z' : d
}

const mirror = (pts: P[]): P[] => pts.map(([x, y]) => [-x, y] as P)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function buildMannequin(input: Measures): MannequinShape {
  const m = estimate(input)
  const s = m.body_shape / 100
  const h = m.height_cm
  const y = (fromFloor: number) => GROUND - fromFloor // da "altezza dal pavimento" a coordinata SVG

  const bmi = m.weight_kg / (h / 100) ** 2
  const fat = clamp((bmi - 22) / 10, -0.5, 1.2) // spessore di arti e collo
  const limb = 1 + 0.35 * fat

  // larghezze: circonferenza → larghezza frontale (sezione ellittica)
  const shoulderHalf = m.shoulders_cm / 2
  const chestHalf = m.chest_cm / (Math.PI * 1.7)
  const waistHalf = m.waist_cm / (Math.PI * 1.75)
  const hipHalf = m.hips_cm / (Math.PI * 1.65)
  const neckHalf = (5 + 1 * s) * (1 + 0.25 * fat)

  // quote verticali (proporzioni antropometriche medie)
  const headRy = h * 0.066
  const headRx = h * (0.047 + 0.002 * s)
  const top = y(h)
  const yChin = top + headRy * 2
  const yNeckBase = y(h * 0.828)
  const yShoulder = y(h * 0.812)
  const yArmpit = y(h * 0.72)
  const yWaist = y(h * (0.61 + 0.01 * (1 - s)))
  const yHip = y(h * (0.52 - 0.015 * (1 - s)))
  const crotch = clamp(m.legs_cm, h * 0.38, h * 0.52)
  const yCrotch = y(crotch)
  const yKnee = y(crotch * 0.56)
  const yAnkle = y(h * 0.045)

  // busto
  const bust = (1 - s) * 1.5 // leggera curva del seno nella forma femminile
  const torsoR: P[] = [
    [neckHalf, yNeckBase - 1],
    [shoulderHalf * 0.72, yShoulder - 0.6],
    [shoulderHalf, yShoulder + 3],
    [chestHalf + 0.5, yArmpit - 3],
    [chestHalf + bust, yArmpit + 3],
    [waistHalf, yWaist],
    [hipHalf, yHip],
    [hipHalf * 0.93, yHip + (yCrotch - yHip) * 0.6],
    [hipHalf * 0.35, yCrotch - 0.5],
  ]
  const torso = smooth([...torsoR, [0, yCrotch], ...mirror(torsoR).reverse()])

  // gambe (destra; la sinistra è speculare)
  const kneeHalf = 4.6 * limb
  const calfHalf = 5.2 * limb
  const ankleHalf = 2.9 * limb
  const kneeX = Math.max(hipHalf * 0.48, kneeHalf + 0.8)
  const ankleX = Math.max(hipHalf * 0.4, ankleHalf + 1)
  const legR: P[] = [
    [hipHalf * 0.99, yHip + 2],
    [hipHalf * 0.96, yCrotch],
    [kneeX + kneeHalf + 2.2, (yCrotch + yKnee) / 2],
    [kneeX + kneeHalf, yKnee],
    [(kneeX + ankleX) / 2 + calfHalf, yKnee + (yAnkle - yKnee) * 0.3],
    [ankleX + ankleHalf, yAnkle],
    [ankleX + ankleHalf * 0.7, yAnkle + 2.5],
    [ankleX - ankleHalf * 0.7, yAnkle + 2.5],
    [ankleX - ankleHalf, yAnkle],
    [(kneeX + ankleX) / 2 - calfHalf * 0.8, yKnee + (yAnkle - yKnee) * 0.3],
    [kneeX - kneeHalf, yKnee],
    [0.7, yCrotch + 2],
    [hipHalf * 0.5, yCrotch - 6],
  ]
  // la gamba specchiata va percorsa al contrario: stesso verso del busto, niente buchi nel tracciato unito
  const legs: [string, string] = [smooth(mirror(legR).reverse()), smooth(legR)]

  // braccia leggermente aperte, ruotate attorno alla spalla
  const theta = (11 * Math.PI) / 180
  const joint: P = [shoulderHalf - 2.4 * limb, yShoulder + 2.5]
  const armLen = y(h * 0.485) - joint[1]
  const hand = h * 0.105
  const upper = 4.6 * limb
  const fore = 3.7 * limb
  const wrist = 2.4 * limb
  const local: P[] = [
    [upper + 0.6, 0],
    [upper, armLen * 0.25],
    [upper * 0.85, armLen * 0.47],
    [fore, armLen * 0.62],
    [wrist, armLen],
    [wrist * 1.25, armLen + hand * 0.55],
    [0, armLen + hand],
    [-wrist * 1.15, armLen + hand * 0.55],
    [-wrist, armLen],
    [-fore * 0.9, armLen * 0.62],
    [-upper * 0.8, armLen * 0.47],
    [-upper, armLen * 0.2],
    [-upper * 0.4, -1],
  ]
  const rot = ([u, v]: P): P => [
    joint[0] + v * Math.sin(theta) + u * Math.cos(theta),
    joint[1] + v * Math.cos(theta) - u * Math.sin(theta),
  ]
  const armR = local.map(rot)
  const arms: [string, string] = [smooth(mirror(armR)), smooth(armR)]

  // collo: tronco di cono che si allarga verso le spalle
  const neckTop = yChin - headRy * 0.35
  const neck =
    `M${-neckHalf * 0.9} ${neckTop}L${neckHalf * 0.9} ${neckTop}` +
    `Q${neckHalf} ${yNeckBase - 2} ${neckHalf * 1.6} ${yNeckBase + 1.5}` +
    `L${-neckHalf * 1.6} ${yNeckBase + 1.5}Q${-neckHalf} ${yNeckBase - 2} ${-neckHalf * 0.9} ${neckTop}Z`

  const foot = { cx: ankleX + 1, cy: GROUND - 2.2, rx: 4.6 * Math.sqrt(limb), ry: 2.6 }

  const nx = (x: number) => (x - VIEW.x) / VIEW.w
  const ny = (v: number) => (v - VIEW.y) / VIEW.h
  const anchors: Anchors = {
    neck: { x: nx(0), y: ny(yNeckBase) },
    shoulder_l: { x: nx(-shoulderHalf), y: ny(yShoulder + 2) },
    shoulder_r: { x: nx(shoulderHalf), y: ny(yShoulder + 2) },
    waist: { x: nx(0), y: ny(yWaist) },
    hips: { x: nx(0), y: ny(yHip) },
    ankle_l: { x: nx(-ankleX), y: ny(yAnkle) },
    ankle_r: { x: nx(ankleX), y: ny(yAnkle) },
  }

  const halfW = Math.max(...armR.map(([x]) => x), hipHalf, shoulderHalf)
  const bounds = { x: nx(-halfW), y: ny(top), w: (2 * halfW) / VIEW.w, h: (GROUND - top) / VIEW.h }

  return {
    head: { cx: 0, cy: top + headRy, rx: headRx, ry: headRy },
    neck,
    torso,
    legs,
    arms,
    feet: [{ ...foot, cx: -foot.cx }, foot],
    floor: { cx: 0, cy: GROUND, rx: Math.max(hipHalf, ankleX + 6) * 1.5, ry: 2.2 },
    anchors,
    bounds,
    hipWidth: (2 * hipHalf) / VIEW.w,
  }
}

/** Ancoraggi iniziali per una foto ritagliata alla figura: stessi punti del manichino, riportati al suo riquadro. */
export function anchorsForCroppedFigure(m: Measures): Anchors {
  const { anchors, bounds } = buildMannequin(m)
  const out = {} as Anchors
  for (const k of ANCHOR_KEYS) {
    out[k] = {
      x: clamp((anchors[k].x - bounds.x) / bounds.w, 0, 1),
      y: clamp((anchors[k].y - bounds.y) / bounds.h, 0, 1),
    }
  }
  return out
}
