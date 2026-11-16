import { useSyncExternalStore } from 'react'
import { PRESET_TAGS } from '@/lib/garments'
import { useGarments } from './api'

/**
 * Tag disponibili = preimpostati + quelli già usati su qualunque capo + quelli creati
 * su questo dispositivo (ricordati anche se il capo non è ancora stato salvato).
 */
const KEY = 'armadio.custom-tags'
const listeners = new Set<() => void>()
let cache: string[] | null = null

export const normalizeTag = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30)

function readCustom(): string[] {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    cache = []
  }
  return cache
}

export function rememberTag(tag: string) {
  const list = readCustom()
  if (list.includes(tag)) return
  cache = [...list, tag]
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage non disponibile: resta in memoria per la sessione */
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useKnownTags(): string[] {
  const custom = useSyncExternalStore(subscribe, readCustom)
  const { data: garments } = useGarments()
  const used = (garments ?? []).flatMap((g) => g.tags)
  return Array.from(new Set([...PRESET_TAGS, ...used, ...custom]))
}
