import type { Customization } from './customization'

/** A signed-in player's profile row from Supabase (`public.profiles`). */
export interface Profile {
  id: string
  username: string
  coins: number
  customization: Customization
}

export type AuthStatus = 'signedOut' | 'loading' | 'signedIn'

export interface AuthState {
  status: AuthStatus
  userId: string | null
  username: string | null
  email: string | null
  coins: number
  /** The player's equipped cosmetics. Falls back to the stock set while signed
   * out or loading, so render paths never need a null check. */
  customization: Customization
  /** Surfaced on sign-in/sign-up failure; cleared on the next attempt. */
  error: string | null
}
