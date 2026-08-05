import { randomName } from '../src/features/lobby/randomName'

/**
 * How a filler bot behaves. The bot is a full participant in a normal 1v1 room
 * — it takes its own kicks through the same `applyKick` path a real opponent's
 * `kickResult` does — so everything here is about making that participation
 * look human rather than about the match rules, which are unchanged.
 */
export interface BotProfile {
  name: string
  /** Chance this bot converts any one kick. Fixed per bot, so a single opponent
   * plays consistently instead of drifting mid-match. */
  skill: number
  /** Catalogue keeper-skin id, or null for the stock keeper. An id the client
   * doesn't recognise falls back to the stock keeper, so this can't break. */
  gkSkin: string | null
}

/** Skill band. Centred just above a coin flip so bots are beatable but not free. */
export const BOT_SKILL = { min: 0.45, max: 0.75 }

/**
 * How long a bot "thinks" before its kick resolves. Modelled on a real
 * opponent: they read the question, answer somewhere inside the 10s timer, and
 * sit through the ~2.6s feedback animation. Must stay well under the server's
 * KICK_TIMEOUT_MS or the bot would look like it had disconnected.
 */
export const BOT_KICK_DELAY_MS = { min: 2_500, max: 9_000 }

/** How long a bot takes to accept a rematch, so it doesn't answer instantly. */
export const BOT_REMATCH_DELAY_MS = { min: 1_500, max: 4_000 }

/** Share of bots carrying a bought keeper skin — most real players have none. */
const GK_SKIN_CHANCE = 0.35

// Mirrors the gkSkin ids in src/services/shopCatalogue.ts. Duplicated rather
// than imported because that module pulls in image/audio assets, which Node
// can't load; drift is harmless (see BotProfile.gkSkin).
const GK_SKIN_IDS = ['gk_green_wall', 'gk_gold_standard', 'gk_coral_guard', 'gk_orange_blaze']

function between(range: { min: number; max: number }, roll: number): number {
  return range.min + roll * (range.max - range.min)
}

export function createBotProfile(rng: () => number = Math.random): BotProfile {
  const skill = between(BOT_SKILL, rng())
  const gkSkin = rng() < GK_SKIN_CHANCE ? GK_SKIN_IDS[Math.floor(rng() * GK_SKIN_IDS.length)]! : null
  // Bots draw from the same generator anonymous players get, so a bot name is
  // indistinguishable from a real unauthenticated opponent's.
  return { name: randomName(), skill, gkSkin }
}

/** Roll whether this bot converts the kick it is about to take. */
export function botScores(profile: BotProfile, rng: () => number = Math.random): boolean {
  return rng() < profile.skill
}

export function botKickDelayMs(rng: () => number = Math.random): number {
  return Math.round(between(BOT_KICK_DELAY_MS, rng()))
}

export function botRematchDelayMs(rng: () => number = Math.random): number {
  return Math.round(between(BOT_REMATCH_DELAY_MS, rng()))
}
