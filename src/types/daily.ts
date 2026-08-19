/** The daily challenges the game can offer (see pickDailyChallenges). Ids and
 * reward amounts are mirrored server-side by claim_daily_challenge in
 * 0008_daily_rewards.sql — keep the two in step. The retired 'win_2_cpu' id is
 * still handled there; it is simply never offered now that 1 v CPU is gone. */
export type DailyChallengeId = 'answer_15' | 'score_5_pens' | 'win_1v1'

/** A challenge's static definition: what it asks, how far, and the coin payout.
 * `reward` is display-only — the server owns the amount actually granted. */
export interface DailyChallengeDef {
  id: DailyChallengeId
  /** Target count that marks the challenge complete. Also interpolated into
   * the localised objective line, so the number is never hardcoded in prose. */
  goal: number
  /** Coins awarded on claim (must match the server's case statement). */
  reward: number
}

/** How many challenges are active on any given day. */
export const DAILY_CHALLENGE_COUNT = 3

/** Length of the login-reward cycle before it repeats. */
export const DAILY_REWARD_CYCLE = 7
/** Coins for a normal day (days 1-6 of the cycle). */
export const DAILY_REWARD_BASE = 5
/** Coins for the milestone (day 7) instead of the base amount. */
export const DAILY_REWARD_MILESTONE = 20

/** The reward for a given day-in-cycle (1..7): milestone on day 7, else base. */
export function dailyRewardFor(day: number): number {
  return day === DAILY_REWARD_CYCLE ? DAILY_REWARD_MILESTONE : DAILY_REWARD_BASE
}
