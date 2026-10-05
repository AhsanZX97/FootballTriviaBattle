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

export type LevelPrize = { kind: 'item'; itemId: string } | { kind: 'coins'; coins: number }

/** Even levels, and anything past the item table. Tunable. */
export const CHEST_COINS = 50

/** Odd levels 1..27, cheapest first. Seeded into `level_prizes` by the
 * migrations, which are what actually grant — keep the two in step. */
const ITEM_PRIZES = [
  'goal_horn',
  'ball_gold_trim',
  'gooal',
  'ball_carnival_swirl',
  'gk_green_wall',
  'celebration_yell',
  'ball_crimson_block',
  'gk_coral_guard',
  'goooooooooal',
  'ball_neon_streak',
  'gk_orange_blaze',
  'video_game_sound',
  'ball_prism_panel',
  'gk_gold_standard',
]

export function levelPrize(level: number): LevelPrize {
  const itemId = level % 2 === 1 ? ITEM_PRIZES[(level - 1) / 2] : undefined
  return itemId ? { kind: 'item', itemId } : { kind: 'coins', coins: CHEST_COINS }
}

/** Total solved (across all levels) that opens level `n`. Tunable. */
export function unlockAt(level: number): number {
  return Math.round(0.75 * 24 * (level - 1))
}
