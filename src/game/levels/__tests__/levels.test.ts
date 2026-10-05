import { describe, expect, it } from 'vitest'
import { coinsForTries } from '../rewards'
import { LEVELS, levelOf } from '../manifest'
import { levelProgress } from '../progress'
import { footballBank } from '../../../services/trivia/bank'

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
})

describe('levelProgress', () => {
  const level = { level: 1, title: 'T', questionIds: ['a', 'b', 'c'] }

  it('counts only this level’s solved questions', () => {
    expect(levelProgress(level, { a: 0, c: 2, elsewhere: 0 })).toEqual({ solved: 2, total: 3 })
  })

  it('is zero when nothing is solved', () => {
    expect(levelProgress(level, {})).toEqual({ solved: 0, total: 3 })
  })
})
