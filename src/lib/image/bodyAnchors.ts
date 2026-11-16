import { ctx2d } from './canvas'
import { ANCHOR_KEYS, type Anchors } from '@/lib/mannequin'

type Run = { start: number; end: number }

/** Tratti di pixel opachi consecutivi su una riga. */
function runsAt(data: Uint8ClampedArray, w: number, row: number): Run[] {
  const runs: Run[] = []
  let start = -1
  for (let x = 0; x < w; x++) {
    const opaque = data[(row * w + x) * 4 + 3] > 128
    if (opaque && start < 0) start = x
    if (!opaque && start >= 0) {
      runs.push({ start, end: x - 1 })
      start = -1
    }
  }
  if (start >= 0) runs.push({ start, end: w - 1 })
  return runs.filter((r) => r.end - r.start >= 2)
}

const widest = (runs: Run[]) => runs.reduce<Run | null>((a, r) => (!a || r.end - r.start > a.end - a.start ? r : a), null)

/**
 * Prima stima dei 7 marcatori su una foto del corpo già scontornata: le altezze vengono dalle
 * proporzioni del manichino, le posizioni orizzontali dalla sagoma reale. L'utente poi li corregge.
 */
export function guessBodyAnchors(cut: HTMLCanvasElement, base: Anchors): Anchors {
  const { width: w, height: h } = cut
  const data = ctx2d(cut).getImageData(0, 0, w, h).data
  const out = structuredClone(base)
  const rowOf = (y: number) => Math.min(h - 1, Math.max(0, Math.round(y * h)))

  for (const k of ['neck', 'waist', 'hips'] as const) {
    const r = widest(runsAt(data, w, rowOf(base[k].y)))
    if (r) out[k].x = (r.start + r.end) / 2 / w
  }

  // le spalle sono la riga più larga poco sotto la quota stimata (il collo è più stretto)
  let sh: Run | null = null
  let shRow = rowOf(base.shoulder_l.y)
  for (let row = shRow; row <= rowOf(base.shoulder_l.y + 0.06); row += 2) {
    const r = widest(runsAt(data, w, row))
    if (r && (!sh || r.end - r.start > sh.end - sh.start)) {
      sh = r
      shRow = row
    }
  }
  if (sh) {
    out.shoulder_l.y = out.shoulder_r.y = shRow / h
    const inset = (sh.end - sh.start) * 0.06
    out.shoulder_l.x = (sh.start + inset) / w
    out.shoulder_r.x = (sh.end - inset) / w
  }

  const legs = runsAt(data, w, rowOf(base.ankle_l.y))
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, 2)
    .sort((a, b) => a.start - b.start)
  if (legs.length === 2) {
    out.ankle_l.x = (legs[0].start + legs[0].end) / 2 / w
    out.ankle_r.x = (legs[1].start + legs[1].end) / 2 / w
  }

  for (const k of ANCHOR_KEYS) {
    out[k].x = Math.min(1, Math.max(0, out[k].x))
    out[k].y = Math.min(1, Math.max(0, out[k].y))
  }
  return out
}
