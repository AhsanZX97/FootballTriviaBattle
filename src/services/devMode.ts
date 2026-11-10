import { useSyncExternalStore } from 'react'
import { getItem, removeItem, setItem } from './storage'

/**
 * Local-only "dev account": an override layer that makes the app unlimited
 * (infinite coins, everything owned, every level open, free packs and ads).
 *
 * It exists only under the Vite dev server on localhost. `import.meta.env.DEV`
 * is statically false in every production build, so this whole module reduces
 * to "never available" there and the checks below are dead-code eliminated.
 * Nothing here talks to Supabase or the multiplayer server: the server still
 * enforces its own rules, so the powers are a client-side layer on this
 * machine only.
 */

const STORAGE_KEY = 'ftb.devMode'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** True only on the Vite dev server, served from a loopback host. */
export function devModeAvailable(
  host: string = typeof location === 'undefined' ? '' : location.hostname,
): boolean {
  return import.meta.env.DEV && LOCAL_HOSTS.has(host)
}

type Listener = () => void

export function createDevMode(
  deps: {
    available?: () => boolean
    storage?: {
      getItem(key: string): string | null
      setItem(key: string, value: string): void
      removeItem(key: string): void
    }
  } = {},
) {
  const available = deps.available ?? (() => devModeAvailable())
  const storage = deps.storage ?? { getItem, setItem, removeItem }

  let on = available() && storage.getItem(STORAGE_KEY) === '1'
  const listeners = new Set<Listener>()

  const isOn = () => on
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }

  function setOn(next: boolean): void {
    // Unavailable means unavailable: no call can switch it on, whatever is
    // sitting in storage.
    const value = available() && next
    if (value === on) return
    on = value
    if (on) storage.setItem(STORAGE_KEY, '1')
    else storage.removeItem(STORAGE_KEY)
    listeners.forEach((l) => l())
  }

  return { isAvailable: available, isOn, subscribe, setOn }
}

export const devMode = createDevMode()

/** Re-renders when the dev account is switched on or off. */
export function useDevMode(): boolean {
  return useSyncExternalStore(devMode.subscribe, devMode.isOn)
}
