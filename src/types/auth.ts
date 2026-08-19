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
  /** Day-in-cycle (1..7) of the most recently claimed daily login reward; 0
   * before the first claim. Server-authoritative — mirrored here for the UI. */
  dailyRewardStreak: number
  /** Calendar day (YYYY-MM-DD) the daily reward was last claimed, or null. Used
   * to decide whether today's reward is still available. */
  lastDailyRewardDate: string | null
  /**
   * True when this account was minted by the Play Games path (its profile
   * carries a `pgs_player_id`). Such an account has no password and an
   * unroutable `@players.invalid` email, so there is no way back into it
   * except Play Games' own automatic sign-in — which is why the UI offers
   * these players no sign-out.
   */
  isPlayGamesAccount: boolean
  /** Surfaced on sign-in/sign-up failure; cleared on the next attempt. */
  error: string | null
}
