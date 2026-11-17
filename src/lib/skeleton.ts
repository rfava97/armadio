import type { Anchors, Point } from './mannequin'

/**
 * Articolazioni del corpo in coordinate 0..1 dell'avatar. "L" e "R" sono i lati dell'immagine
 * (sinistra e destra di chi guarda), non della persona.
 */
export type Skeleton = {
  neck: Point
  shoulderL: Point
  shoulderR: Point
  elbowL: Point
  elbowR: Point
  wristL: Point
  wristR: Point
  waist: Point
  hipL: Point
  hipR: Point
  kneeL: Point
  kneeR: Point
  ankleL: Point
  ankleR: Point
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/**
 * Scheletro stimato dai 7 punti calibrati (quando la pose non è disponibile): braccia lungo i
 * fianchi leggermente aperte, gambe dritte dai fianchi alle caviglie.
 */
export function skeletonFromAnchors(a: Anchors, hipWidth: number, aspect: number): Skeleton {
  const torso = a.hips.y - a.shoulder_l.y
  const open = 0.05 * torso / aspect // apertura delle braccia, in x
  const hipHalf = Math.max(hipWidth * 0.27, Math.abs(a.ankle_r.x - a.ankle_l.x) / 2)
  const hipL = { x: a.hips.x - hipHalf, y: a.hips.y + torso * 0.05 }
  const hipR = { x: a.hips.x + hipHalf, y: a.hips.y + torso * 0.05 }
  return {
    neck: a.neck,
    shoulderL: a.shoulder_l,
    shoulderR: a.shoulder_r,
    elbowL: { x: a.shoulder_l.x - open, y: a.shoulder_l.y + torso * 0.62 },
    elbowR: { x: a.shoulder_r.x + open, y: a.shoulder_r.y + torso * 0.62 },
    wristL: { x: a.shoulder_l.x - open * 1.6, y: a.shoulder_l.y + torso * 1.15 },
    wristR: { x: a.shoulder_r.x + open * 1.6, y: a.shoulder_r.y + torso * 1.15 },
    waist: a.waist,
    hipL,
    hipR,
    kneeL: lerp(hipL, a.ankle_l, 0.5),
    kneeR: lerp(hipR, a.ankle_r, 0.5),
    ankleL: a.ankle_l,
    ankleR: a.ankle_r,
  }
}

/**
 * Unisce la pose riconosciuta con i punti calibrati dall'utente: spalle, collo, vita e caviglie
 * restano quelli scelti a mano (più affidabili); gomiti, polsi, anche e ginocchia vengono dalla pose.
 */
export function mergeSkeleton(pose: Skeleton, a: Anchors): Skeleton {
  return {
    ...pose,
    neck: a.neck,
    shoulderL: a.shoulder_l,
    shoulderR: a.shoulder_r,
    waist: a.waist,
    ankleL: a.ankle_l,
    ankleR: a.ankle_r,
  }
}
