import { describe, expect, it } from 'vitest'
import {
  BOT_KICK_DELAY_MS,
  BOT_REMATCH_DELAY_MS,
  BOT_SKILL,
  botKickDelayMs,
  botRematchDelayMs,
  botScores,
  createBotProfile,
} from '../bot'

/** Deterministic stand-in for Math.random: yields the given values in order. */
const rngOf = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]!
}

describe('createBotProfile', () => {
  it('gives the bot a name that fits the lobby name format', () => {
    const profile = createBotProfile(rngOf(0.5))
    expect(profile.name).toMatch(/^[A-Z]+ [A-Z]+ \d\d$/)
  })

  it('maps the lowest roll to the minimum skill and the highest to the maximum', () => {
    expect(createBotProfile(rngOf(0)).skill).toBeCloseTo(BOT_SKILL.min)
    expect(createBotProfile(rngOf(1)).skill).toBeCloseTo(BOT_SKILL.max)
  })

  it('never lands outside the skill band', () => {
    for (let i = 0; i < 50; i++) {
      const { skill } = createBotProfile()
      expect(skill).toBeGreaterThanOrEqual(BOT_SKILL.min)
      expect(skill).toBeLessThanOrEqual(BOT_SKILL.max)
    }
  })

  it('does not equip a keeper skin on every bot', () => {
    // A roll above the equip chance leaves the bot on the stock keeper, which
    // is what most real players look like.
    expect(createBotProfile(rngOf(0.5, 1)).gkSkin).toBeNull()
  })

  it('equips a real catalogue keeper skin when the roll is under the chance', () => {
    const profile = createBotProfile(rngOf(0.5, 0, 0))
    expect(profile.gkSkin).toMatch(/^gk_/)
  })
})

describe('botScores', () => {
  const profile = { name: 'TEST BOT 01', skill: 0.6, gkSkin: null }

  it('scores when the roll is under the bot skill', () => {
    expect(botScores(profile, rngOf(0.59))).toBe(true)
  })

  it('misses when the roll is at or over the bot skill', () => {
    expect(botScores(profile, rngOf(0.6))).toBe(false)
    expect(botScores(profile, rngOf(0.99))).toBe(false)
  })

  it('converts roughly in line with its skill over many kicks', () => {
    const scored = Array.from({ length: 2000 }, () => botScores(profile)).filter(Boolean).length
    expect(scored / 2000).toBeGreaterThan(0.5)
    expect(scored / 2000).toBeLessThan(0.7)
  })
})

describe('botKickDelayMs', () => {
  it('spans the configured thinking window', () => {
    expect(botKickDelayMs(rngOf(0))).toBe(BOT_KICK_DELAY_MS.min)
    expect(botKickDelayMs(rngOf(1))).toBe(BOT_KICK_DELAY_MS.max)
  })

  it('stays inside the window for arbitrary rolls', () => {
    for (let i = 0; i < 50; i++) {
      const delay = botKickDelayMs()
      expect(delay).toBeGreaterThanOrEqual(BOT_KICK_DELAY_MS.min)
      expect(delay).toBeLessThanOrEqual(BOT_KICK_DELAY_MS.max)
    }
  })
})

describe('botRematchDelayMs', () => {
  it('spans the configured deliberation window', () => {
    expect(botRematchDelayMs(rngOf(0))).toBe(BOT_REMATCH_DELAY_MS.min)
    expect(botRematchDelayMs(rngOf(1))).toBe(BOT_REMATCH_DELAY_MS.max)
  })
})
