import { describe, expect, it } from 'vitest'
import {
  DAILY_CHALLENGE_POOL,
  claimableReward,
  dailyKey,
  pickDailyChallenges,
} from '../dailyChallenges'
import { DAILY_CHALLENGE_COUNT } from '../../types/daily'

describe('dailyKey', () => {
  it('formats a date as local YYYY-MM-DD', () => {
    expect(dailyKey(new Date(2026, 6, 24, 9, 30))).toBe('2026-07-24')
  })

  it('zero-pads month and day', () => {
    expect(dailyKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('pickDailyChallenges', () => {
  it('returns the configured number of challenges', () => {
    expect(pickDailyChallenges('2026-07-24')).toHaveLength(DAILY_CHALLENGE_COUNT)
  })

  it('is deterministic for the same key', () => {
    expect(pickDailyChallenges('2026-07-24')).toEqual(pickDailyChallenges('2026-07-24'))
  })

  it('only returns ids from the pool, with no duplicates', () => {
    const ids = pickDailyChallenges('2026-07-24')
    const pool = DAILY_CHALLENGE_POOL.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id) => expect(pool).toContain(id))
  })

  it('varies the set across different days', () => {
    const a = pickDailyChallenges('2026-07-24')
    const b = pickDailyChallenges('2026-07-25')
    // Not a hard guarantee for every pair, but these two known keys differ.
    expect(a).not.toEqual(b)
  })
})

describe('claimableReward', () => {
  const today = new Date(2026, 6, 24, 12, 0)

  it('is not claimable when already claimed today', () => {
    expect(claimableReward(3, '2026-07-24', today)).toEqual({
      claimable: false,
      day: 3,
      reward: 0,
    })
  })

  it('advances the streak on a consecutive day', () => {
    expect(claimableReward(3, '2026-07-23', today)).toEqual({
      claimable: true,
      day: 4,
      reward: 5,
    })
  })

  it('awards 20 on day 7', () => {
    expect(claimableReward(6, '2026-07-23', today)).toEqual({
      claimable: true,
      day: 7,
      reward: 20,
    })
  })

  it('wraps day 7 back to day 1 next time', () => {
    expect(claimableReward(7, '2026-07-23', today)).toEqual({
      claimable: true,
      day: 1,
      reward: 5,
    })
  })

  it('resets to day 1 after a missed day', () => {
    expect(claimableReward(5, '2026-07-20', today)).toEqual({
      claimable: true,
      day: 1,
      reward: 5,
    })
  })

  it('starts at day 1 for a player who has never claimed', () => {
    expect(claimableReward(0, null, today)).toEqual({
      claimable: true,
      day: 1,
      reward: 5,
    })
  })
})
