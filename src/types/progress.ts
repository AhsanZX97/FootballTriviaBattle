/**
 * On-device progress earned before a player has an account.
 *
 * The whole point is that a first-time player never hits a sign-in wall: they
 * play, they earn, and the balance follows them into whatever account they
 * eventually get (Play Games or a manual signup). Until then it lives in
 * localStorage under `ftb.progress` and is spendable nowhere — the shop equips
 * through an authed RPC — which is deliberate: unspendable coins are the thing
 * that makes claiming worth doing.
 *
 * None of this is trusted. A player can edit localStorage and hand us any
 * number they like, so the server caps what a claim may ever grant
 * (LOCAL_CLAIM_LIFETIME_CAP in 0014_local_progress.sql). Treat every field here
 * as a *request*, never an entitlement.
 */

import type { Customization } from './customization'
import { defaultCustomization } from './customization'

/** One finished match played while signed out, shaped for `match_history`. */
export interface LocalMatchResult {
  outcome: 'win' | 'loss'
  userScore: number
  opponentScore: number
  /** Opponent's display name at match time; bots and anonymous players fall
   * back to a generic label rather than an empty string. */
  opponentName: string
  /** True when the match ended by disconnect/quit rather than at full time. */
  byDisconnect: boolean
  /** ISO timestamp, so claimed rows keep their real order instead of all
   * landing at the moment of the claim. */
  createdAt: string
}

/**
 * A cosmetic bought with local coins. Provisional: the price is kept so the
 * claim can hand the server the *gross* coins earned (balance + everything
 * spent) and let it charge the real price through `purchase_item`. The server
 * therefore never takes our word for what was bought or what it cost.
 */
export interface PendingPurchase {
  id: string
  /** Catalogue price at the time of the local purchase, for the gross total. */
  price: number
}

/** Everything earned on this device while signed out. */
export interface LocalProgress {
  /** Coins earned locally and not yet claimed into an account. */
  coins: number
  /** Most recent matches first, capped at LOCAL_MATCH_LOG_LIMIT. */
  matches: LocalMatchResult[]
  /** Day-in-cycle (1..7) of the most recent login reward taken on this device;
   * 0 before the first one. Mirrors `profiles.daily_reward_streak` so the same
   * `claimableReward` logic drives both. */
  dailyRewardStreak: number
  /** Calendar day (YYYY-MM-DD) the login reward was last taken here, or null. */
  lastDailyRewardDate: string | null
  /** Cosmetics bought on-device, re-charged against the real balance at claim. */
  pendingPurchases: PendingPurchase[]
  /** Cosmetics equipped on-device. Applied to the profile at claim, for
   * whichever slots the player still owns once the server has charged them. */
  customization: Customization
  /** Rewarded ads watched today, for the on-device daily cap. */
  adsToday: number
  /** Calendar day `adsToday` counts against, or null before the first ad. */
  adsDate: string | null
}

/** How many finished matches the device keeps. Older ones fall off the end —
 * the stats panel only ever shows the last five, and an unbounded log would
 * grow forever in a storage bucket that has a hard quota. */
export const LOCAL_MATCH_LOG_LIMIT = 50

/** How many of those get pushed up on a claim. History is cosmetic, so there
 * is no reason to spend a big jsonb payload replaying every game. Must not
 * exceed the server's own per-claim row cap. */
export const LOCAL_MATCH_CLAIM_LIMIT = 25

export const emptyLocalProgress = (): LocalProgress => ({
  coins: 0,
  matches: [],
  dailyRewardStreak: 0,
  lastDailyRewardDate: null,
  pendingPurchases: [],
  customization: defaultCustomization(),
  adsToday: 0,
  adsDate: null,
})
