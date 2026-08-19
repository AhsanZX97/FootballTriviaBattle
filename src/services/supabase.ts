import { createClient } from '@supabase/supabase-js'
import { getItem, removeItem, setItem } from './storage'

// Falls back to harmless placeholders when the env vars aren't baked in (unit
// tests run outside any Vite mode that loads .env.development.local). Every
// real build — dev, production, release — always sets these (see the three
// .env files), so the fallback only ever engages under vitest.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'test-anon-key'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * supabase-js's expected auth storage shape, backed by this repo's
 * storage.ts seam (never raw localStorage/Preferences directly) — the same
 * seam the volume setting persists through, which is what lets the session
 * survive a Capacitor Preferences restore on Android app restarts.
 */
export function createAuthStorageAdapter(
  storage: StorageLike = { getItem, setItem, removeItem },
): StorageLike {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: createAuthStorageAdapter() },
})

interface SessionResponse {
  session?: { access_token: string; refresh_token: string }
  error?: string
}

/**
 * Trades a Play Games server auth code for a Supabase session. The code is
 * useless to anyone but our backend — redeeming it needs the OAuth client
 * secret, which only the `pgs-signin` Edge Function holds — so posting it
 * here is what turns "Play Games says this device is a player" into "Supabase
 * says this request is that user".
 *
 * Never throws: every failure (declined, unconfigured, network, a backend that
 * couldn't mint a session) resolves to `{ error }`, and the caller falls back
 * to the ordinary sign-in screen.
 */
export async function signInWithPlayGames(authCode: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pgs-signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ authCode }),
    })

    const body = (await res.json().catch(() => null)) as SessionResponse | null
    if (!res.ok || !body?.session) {
      return { error: body?.error ?? 'pgs_rejected' }
    }

    const { error } = await supabase.auth.setSession({
      access_token: body.session.access_token,
      refresh_token: body.session.refresh_token,
    })
    return { error: error ? error.message : null }
  } catch {
    return { error: 'network_error' }
  }
}

interface LoginWithUsernameResponse {
  session?: { access_token: string; refresh_token: string }
  error?: string
}

/**
 * Username-based login: Supabase itself only does email password grants, so
 * this posts to the deployed `login-with-username` Edge Function (which
 * resolves username -> email server-side, never exposing the mapping to the
 * client) and, on success, adopts the returned session. Never throws — every
 * failure path (bad credentials, network error, malformed response) resolves
 * to `{ error: <message> }` so callers can await it unconditionally.
 */
export async function loginWithUsername(
  username: string,
  password: string,
): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/login-with-username`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ username, password }),
    })

    const body = (await res.json().catch(() => null)) as LoginWithUsernameResponse | null
    if (!res.ok || !body?.session) {
      return { error: body?.error ?? 'invalid_credentials' }
    }

    const { error } = await supabase.auth.setSession({
      access_token: body.session.access_token,
      refresh_token: body.session.refresh_token,
    })
    return { error: error ? error.message : null }
  } catch {
    return { error: 'network_error' }
  }
}
