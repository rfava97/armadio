import { useSyncExternalStore } from 'react'

/**
 * Preferenze del camerino, salvate su questo dispositivo:
 * - tryOn: mostra il pulsante "Provalo su di me" (si cambia dal Profilo);
 * - view: "tavolo" (capi stesi) o "sudime" (i capi sulla tua foto), si cambia nel camerino.
 */
export type CamerinoView = 'tavolo' | 'sudime'
export type CamerinoSettings = { tryOn: boolean; view: CamerinoView }

const KEY = 'armadio.camerino-settings'
const DEFAULTS: CamerinoSettings = { tryOn: true, view: 'tavolo' }
const listeners = new Set<() => void>()
let cache: CamerinoSettings | null = null

function read(): CamerinoSettings {
  if (cache) return cache
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CamerinoSettings>
    cache = { tryOn: saved.tryOn ?? DEFAULTS.tryOn, view: saved.view === 'sudime' ? 'sudime' : 'tavolo' }
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
