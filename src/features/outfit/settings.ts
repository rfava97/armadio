import { useSyncExternalStore } from 'react'

/**
 * Preferenze del camerino, salvate su questo dispositivo (si cambiano dal Profilo):
 * - mode "corpo": i capi seguono braccia e gambe (pose nel browser);
 *   "semplice": capi interi su spalle e fianchi, senza riconoscere le articolazioni.
 * - tryOn: mostra il pulsante "Provalo su di me".
 */
export type CamerinoMode = 'corpo' | 'semplice'
export type CamerinoSettings = { mode: CamerinoMode; tryOn: boolean }

const KEY = 'armadio.camerino-settings'
const DEFAULTS: CamerinoSettings = { mode: 'corpo', tryOn: true }
const listeners = new Set<() => void>()
let cache: CamerinoSettings | null = null

function read(): CamerinoSettings {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CamerinoSettings>) }
  } catch {
    cache = DEFAULTS
  }
  return cache
}

export function setCamerinoSettings(patch: Partial<CamerinoSettings>) {
  cache = { ...read(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage non disponibile: vale per questa sessione */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useCamerinoSettings = () => useSyncExternalStore(subscribe, read)
