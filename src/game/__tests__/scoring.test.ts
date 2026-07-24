import { describe, expect, it } from 'vitest'
import { scoreOf } from '../scoring'

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
