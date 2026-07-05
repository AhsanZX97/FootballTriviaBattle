/**
 * Synchronous key/value storage. Backed by localStorage in the browser and a
 * no-op where it is unavailable (the WS server imports the trivia service, and
 * Node has no localStorage). On native (Phase 2) a boot step hydrates Capacitor
 * Preferences into localStorage before first render, so reads here stay
 * synchronous on every platform.
 */
function backend(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

/**
 * Optional write-through sink. On native it mirrors writes into Capacitor
 * Preferences (durable native storage) so values survive a WKWebView evicting
 * localStorage; the boot step in native/preferences.ts hydrates the other way.
 * Null on web, so writes stay pure-localStorage.
 */
type Mirror = (key: string, value: string | null) => void
let mirror: Mirror | null = null

export function setStorageMirror(fn: Mirror): void {
  mirror = fn
}

export function getItem(key: string): string | null {
  try {
    return backend()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function setItem(key: string, value: string): void {
  try {
    backend()?.setItem(key, value)
  } catch {
    // quota or privacy-mode failure — callers treat storage as best-effort
  }
  mirror?.(key, value)
}

export function removeItem(key: string): void {
  try {
    backend()?.removeItem(key)
  } catch {
    // best-effort
  }
  mirror?.(key, null)
}
