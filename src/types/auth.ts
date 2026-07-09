/** A signed-in player's profile row from Supabase (`public.profiles`). */
export interface Profile {
  id: string
  username: string
  coins: number
}

export type AuthStatus = 'signedOut' | 'loading' | 'signedIn'

export interface AuthState {
  status: AuthStatus
  userId: string | null
  username: string | null
  email: string | null
  coins: number
  /** Surfaced on sign-in/sign-up failure; cleared on the next attempt. */
  error: string | null
}
