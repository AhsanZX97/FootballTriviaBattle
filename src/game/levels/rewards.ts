/**
 * Coins for a level question, by wrong tries before the right answer:
 * 3 -> 2 -> 1, floored at 1. Tunable, but `level_coins_for_tries` in
 * 0019_level_mode.sql is what actually pays a signed-in player — keep the two
 * in step.
 */
export const LEVEL_MAX_COINS = 3
export const LEVEL_MIN_COINS = 1

export function coinsForTries(wrongTries: number): number {
  const tries = Number.isFinite(wrongTries) ? Math.max(0, Math.floor(wrongTries)) : 0
  return Math.max(LEVEL_MIN_COINS, LEVEL_MAX_COINS - tries)
}
