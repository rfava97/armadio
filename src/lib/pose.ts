import type { Skeleton } from './skeleton'
import type { Point } from './mannequin'
import { ctx2d, makeCanvas } from './image/canvas'
// motore WASM servito dall'app stessa (niente CDN), caricato solo quando serve
import wasmLoaderPath from '../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url'
import wasmBinaryPath from '../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url'

// modello ufficiale di Google (gratuito), ~9 MB, scaricato una volta e poi in cache del browser
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task'

const CACHE_KEY = 'armadio.pose.v1'

type Cache = Record<string, Skeleton | null>

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Cache
  } catch {
    return {}
  }
}

/** Pose già calcolata per questa foto (chiave = percorso nello storage). */
export function cachedPose(key: string): Skeleton | null | undefined {
  return readCache()[key]
}

function storePose(key: string, s: Skeleton | null) {
  try {
    // tengo solo la foto attuale: le pose vecchie non servono più
    localStorage.setItem(CACHE_KEY, JSON.stringify({ [key]: s }))
  } catch {
    /* storage pieno o non disponibile */
  }
}

/**
 * Riconosce le articolazioni su una foto del corpo scontornata, nel browser (MediaPipe Pose).
 * Restituisce null se non trova una persona intera.
 */
export async function detectPose(key: string, image: HTMLImageElement | HTMLCanvasElement): Promise<Skeleton | null> {
  const known = cachedPose(key)
  if (known !== undefined) return known

  const { PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const landmarker = await PoseLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    { baseOptions: { modelAssetPath: MODEL }, runningMode: 'IMAGE', numPoses: 1 },
  )

  // sfondo bianco al posto della trasparenza: il modello è allenato su foto normali
  const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width
  const h = image instanceof HTMLImageElement ? image.naturalHeight : image.height
  const c = makeCanvas(w, h)
  const ctx = ctx2d(c)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(image, 0, 0)

  let result: Skeleton | null = null
  try {
    const res = landmarker.detect(c)
    const lm = res.landmarks[0]
    if (lm && lm.length >= 29) {
      const p = (i: number): Point => ({ x: lm[i].x, y: lm[i].y })
      // la pose usa i lati della persona: li riporto a sinistra/destra dell'immagine
      const pair = (a: number, b: number): [Point, Point] => (lm[a].x <= lm[b].x ? [p(a), p(b)] : [p(b), p(a)])
      const [shoulderL, shoulderR] = pair(11, 12)
      const [elbowL, elbowR] = pair(13, 14)
      const [wristL, wristR] = pair(15, 16)
      const [hipL, hipR] = pair(23, 24)
      const [kneeL, kneeR] = pair(25, 26)
      const [ankleL, ankleR] = pair(27, 28)
      const visible = [11, 12, 23, 24, 25, 26, 27, 28].every((i) => (lm[i].visibility ?? 1) > 0.3)
      if (visible) {
        const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
        const hips = mid(hipL, hipR)
        const shoulders = mid(shoulderL, shoulderR)
        result = {
          neck: shoulders,
          shoulderL,
          shoulderR,
          elbowL,
          elbowR,
          wristL,
          wristR,
          waist: { x: hips.x, y: shoulders.y + (hips.y - shoulders.y) * 0.75 },
          hipL,
          hipR,
          kneeL,
          kneeR,
          ankleL,
          ankleR,
        }
      }
    }
  } finally {
    landmarker.close()
  }
  storePose(key, result)
  return result
}
