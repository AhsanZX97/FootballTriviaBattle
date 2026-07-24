import type { DailyChallengeDef, DailyChallengeId } from '../types/daily'
import { DAILY_CHALLENGE_COUNT, DAILY_REWARD_CYCLE, dailyRewardFor } from '../types/daily'

/** Every challenge the game can draw from. `pickDailyChallenges` selects a
 * deterministic subset for each calendar day. Rewards mirror the server's
 * claim_daily_challenge case statement (0008_daily_rewards.sql). */
export const DAILY_CHALLENGE_POOL: DailyChallengeDef[] = [
  {
    id: 'answer_15',
    title: 'SHARP SHOOTER',
    description: 'Answer 15 questions correctly',
    goal: 15,
    reward: 10,
  },
  {
    id: 'win_2_cpu',
    title: 'CPU CRUSHER',
    description: 'Win 2 matches vs CPU',
    goal: 2,
    reward: 15,
  },
  {
    id: 'score_5_pens',
    title: 'DEAD-EYE',
    description: 'Score 5 penalties',
    goal: 5,
    reward: 10,
  },
  {
    id: 'win_1v1',
    title: 'DUELIST',
    description: 'Win a 1v1 match',
    goal: 1,
    reward: 20,
  },
]

const POOL_BY_ID: Record<DailyChallengeId, DailyChallengeDef> = Object.fromEntries(
  DAILY_CHALLENGE_POOL.map((c) => [c.id, c]),
) as Record<DailyChallengeId, DailyChallengeDef>

/** Look up a challenge's static definition by id. */
export function challengeDef(id: DailyChallengeId): DailyChallengeDef {
  return POOL_BY_ID[id]
}

/** Local calendar day as `YYYY-MM-DD` — the key challenges and the streak reset
 * against. Local (not UTC) so "a new day" matches the player's own midnight. */
export function dailyKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function previousKey(now: Date): string {
  const prev = new Date(now)
  prev.setDate(prev.getDate() - 1)
  return dailyKey(prev)
}

// xmur3 string hash -> mulberry32 PRNG: a tiny, dependency-free deterministic
// seed so every device shows the same three challenges on the same date.
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = (h ^= h >>> 16) >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The `count` challenge ids active on the given calendar-day key. Deterministic:
 * the same key always yields the same set, in the same order, on every device. */
export function pickDailyChallenges(
  key: string,
  count: number = DAILY_CHALLENGE_COUNT,
): DailyChallengeId[] {
  const rand = seededRandom(key)
  const ids = DAILY_CHALLENGE_POOL.map((c) => c.id)
  // Fisher-Yates with the seeded PRNG, then take the first `count`.
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids.slice(0, Math.min(count, ids.length))
}

/** The login-reward state derivable from the stored streak. `day` is the
 * day-in-cycle (1..7) that a claim right now would land on — or, when already
 * claimed today, the day just claimed. `reward` is 0 when not claimable. */
export interface RewardStatus {
  claimable: boolean
  day: number
  reward: number
}

/** Given the last-claimed date and stored streak day, work out whether today's
 * reward can be claimed and what it would be. A consecutive day advances the
 * cycle (wrapping day 7 back to day 1); any gap resets to day 1. Mirrors the
 * server's claim_daily_reward so the UI can preview the exact outcome. */
export function claimableReward(
  streak: number,
  lastDate: string | null,
  now: Date = new Date(),
): RewardStatus {
  const today = dailyKey(now)
  if (lastDate === today) {
    return { claimable: false, day: streak, reward: 0 }
  }
  const pending =
    lastDate === previousKey(now) ? (streak >= DAILY_REWARD_CYCLE ? 1 : streak + 1) : 1
  return { claimable: true, day: pending, reward: dailyRewardFor(pending) }
}
