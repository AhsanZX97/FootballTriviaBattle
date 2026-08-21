import { supabase } from './supabase'
import type { LocalMatchResult } from '../types/progress'

/** Outcome of banking on-device progress into the signed-in account. */
export interface ClaimResult {
  /** The account's new coin balance. */
  coins: number
  /** How much of the request actually landed — the server trims anything over
   * the account's lifetime allowance, so this can be less than what was sent
   * (and is what the UI should show as "+N"). */
  granted: number
}

/**
 * The one operation the progress store needs from the network, behind a seam so
 * tests can inject a fake (same pattern as `ChallengeApi` and `StatsApi`).
 */
/** The login-reward cycle position this device reached before signing up, so a
 * player who has been coming back daily doesn't restart at day 1. */
export interface LocalStreak {
  streak: number
  lastDate: string | null
}

export interface LocalProgressApi {
  /** Banks locally-earned coins, match history and login-reward streak.
   * Resolves null when the claim was refused or failed — the caller must keep
   * the local progress and retry rather than treating it as spent. */
  claimLocalProgress(
    coins: number,
    matches: LocalMatchResult[],
    streak: LocalStreak,
  ): Promise<ClaimResult | null>
}

async function claimLocalProgress(
  coins: number,
  matches: LocalMatchResult[],
  streak: LocalStreak,
): Promise<ClaimResult | null> {
  const { data, error } = await supabase.rpc('claim_local_progress', {
    p_coins: coins,
    p_matches: matches,
    p_streak: streak.streak,
    p_streak_date: streak.lastDate,
  })
  if (error || data == null || typeof data !== 'object') {
    if (error) console.error('[progress] claim_local_progress failed', error)
    return null
  }
  const row = data as { coins?: number; granted?: number }
  if (typeof row.coins !== 'number') return null
  return { coins: row.coins, granted: typeof row.granted === 'number' ? row.granted : 0 }
}

export const localProgressApi: LocalProgressApi = { claimLocalProgress }
