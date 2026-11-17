import type { Anchors } from '@/lib/mannequin'

/** Riga (px dell'avatar) dove una maglia infilata sparisce nei pantaloni. */
export const tuckLine = (a: Anchors, h: number) => (a.waist.y + (a.hips.y - a.waist.y) * 0.35) * h
