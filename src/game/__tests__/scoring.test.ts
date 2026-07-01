import { describe, expect, it } from 'vitest'
import { decideResult, scoreOf } from '../scoring'

describe('scoreOf', () => {
  it('gives the user a goal on a correct shot', () => {
    expect(scoreOf('shoot', true)).toBe('user')
  })
  it('gives nobody a goal on a missed shot', () => {
    expect(scoreOf('shoot', false)).toBe(null)
  })
  it('gives nobody a goal on a save (correct while keeping)', () => {
    expect(scoreOf('keep', true)).toBe(null)
  })
  it('lets the CPU score when the keeper answers wrong', () => {
    expect(scoreOf('keep', false)).toBe('cpu')
  })
})

describe('decideResult', () => {
  it('is a win when the user leads', () => {
    expect(decideResult(5, 4)).toEqual({ outcome: 'win', userScore: 5, cpuScore: 4 })
  })
  it('is a loss when the user trails', () => {
    expect(decideResult(4, 5).outcome).toBe('lose')
  })
})
