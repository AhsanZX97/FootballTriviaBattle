import { describe, expect, it } from 'vitest'
import { CHEST_COINS, coinsForTries, levelPrize, unlockAt } from '../rewards'
import { LEVELS, NEXT_LEVEL, levelOf } from '../manifest'
import { LEVEL_IDS } from '../levelIds'
import { isComplete, levelProgress } from '../progress'
import { footballBank } from '../../../services/trivia/bank'
import { findItem } from '../../../services/shopCatalogue'

describe('coinsForTries', () => {
  it('pays 3, 2, 1 and then floors at 1', () => {
    expect([0, 1, 2, 3, 10].map(coinsForTries)).toEqual([3, 2, 1, 1, 1])
  })

  it('treats a nonsense try count as a clean answer, never more', () => {
    expect(coinsForTries(-4)).toBe(3)
    expect(coinsForTries(Number.NaN)).toBe(3)
  })
})

describe('level manifest', () => {
  it('opens with Level 1', () => {
    expect(LEVELS[0].level).toBe(1)
    expect(LEVELS[0].questionIds.length).toBeGreaterThan(0)
  })

  it('only references questions that exist in the bank', () => {
    const ids = new Set(footballBank.map((q) => q.id))
    for (const level of LEVELS) {
      for (const id of level.questionIds) expect(ids.has(id)).toBe(true)
    }
  })

  it('never puts one question in two levels', () => {
    const all = LEVELS.flatMap((l) => l.questionIds)
    expect(new Set(all).size).toBe(all.length)
  })

  it('finds a level by number, and nothing for an unknown one', () => {
    expect(levelOf(1)).toBe(LEVELS[0])
    expect(levelOf(999)).toBeUndefined()
  })

  it('makes Level 1 the first frozen deal of 24 cards, with the goal horn', () => {
    expect(LEVELS[0].questionIds).toEqual(LEVEL_IDS[0])
    expect(LEVELS[0].questionIds).toHaveLength(24)
    expect(LEVELS[0].prize).toEqual({ kind: 'item', itemId: 'goal_horn' })
  })

  it('only exposes Level 1 for now, with Level 2 shown locked', () => {
    expect(LEVELS.map((l) => l.level)).toEqual([1])
    expect(levelOf(2)).toBeUndefined()
    expect(NEXT_LEVEL).toEqual({ level: 2, title: 'ACADEMY', unlockAt: 18 })
  })
})

describe('frozen level ids', () => {
  it('deals the whole bank into 24-card levels, the last one short', () => {
    expect(LEVEL_IDS.flat()).toHaveLength(footballBank.length)
    expect(new Set(LEVEL_IDS.flat()).size).toBe(footballBank.length)
    expect(LEVEL_IDS.slice(0, -1).every((l) => l.length === 24)).toBe(true)
  })
})

describe('levelPrize', () => {
  it('gives the shop items in the plan table on odd levels', () => {
    expect(levelPrize(1)).toEqual({ kind: 'item', itemId: 'goal_horn' })
    expect(levelPrize(3)).toEqual({ kind: 'item', itemId: 'ball_gold_trim' })
    expect(levelPrize(27)).toEqual({ kind: 'item', itemId: 'gk_gold_standard' })
  })

  it('gives a coin chest on even levels and past the table', () => {
    expect(levelPrize(2)).toEqual({ kind: 'coins', coins: CHEST_COINS })
    expect(levelPrize(28)).toEqual({ kind: 'coins', coins: CHEST_COINS })
    expect(levelPrize(29)).toEqual({ kind: 'coins', coins: CHEST_COINS })
  })

  it('only names items the shop sells', () => {
    for (let n = 1; n <= 28; n++) {
      const prize = levelPrize(n)
      if (prize.kind === 'item') expect(findItem(prize.itemId)).toBeDefined()
    }
  })
})

describe('unlockAt', () => {
  it('opens Level 1 at once and each next level 18 solves later', () => {
    expect([1, 2, 3, 10].map(unlockAt)).toEqual([0, 18, 36, 162])
  })
})

describe('levelProgress', () => {
  const level = { level: 1, title: 'T', questionIds: ['a', 'b', 'c'] }

  it('counts only this level’s solved questions', () => {
    expect(levelProgress(level, { a: 0, c: 2, elsewhere: 0 })).toEqual({ solved: 2, total: 3 })
  })

  it('is zero when nothing is solved', () => {
    expect(levelProgress(level, {})).toEqual({ solved: 0, total: 3 })
  })

  it('is complete only when every card is solved', () => {
    expect(isComplete(level, { a: 0, b: 1 })).toBe(false)
    expect(isComplete(level, { a: 0, b: 1, c: 3 })).toBe(true)
  })
})
