import { describe, expect, it } from 'vitest'
import { parseClaimPrize, parseProgress } from '../levels'

describe('parseProgress', () => {
  it('reads solved tries and claimed prize levels', () => {
    expect(parseProgress({ solved: { 'wc-1': 0, 'pt-0': 2 }, prizes: [1] })).toEqual({
      solved: { 'wc-1': 0, 'pt-0': 2 },
      prizes: [1],
    })
  })

  it('drops malformed entries rather than trusting them', () => {
    expect(parseProgress({ solved: { a: 'x', b: -1, c: 1.5, d: 1 }, prizes: [1, '2', 0, 3.5] })).toEqual({
      solved: { d: 1 },
      prizes: [1],
    })
  })

  it('is null for a reply that is not progress at all', () => {
    expect(parseProgress(null)).toBeNull()
    expect(parseProgress('nope')).toBeNull()
    expect(parseProgress({ solved: [], prizes: {} })).toBeNull()
  })
})

describe('parseClaimPrize', () => {
  it('reads a granted item', () => {
    expect(parseClaimPrize({ status: 'ok', item_id: 'goal_horn', coins_paid: 0, coins: 40 })).toEqual({
      status: 'ok',
      itemId: 'goal_horn',
      coinsPaid: 0,
      coins: 40,
    })
  })

  it('reads coins paid instead of an item', () => {
    expect(parseClaimPrize({ status: 'ok', item_id: null, coins_paid: 100, coins: 140 })).toEqual({
      status: 'ok',
      itemId: null,
      coinsPaid: 100,
      coins: 140,
    })
  })

  it('reads an earlier claim', () => {
    expect(parseClaimPrize({ status: 'already_claimed', coins: 40 })).toEqual({
      status: 'already_claimed',
      itemId: null,
      coinsPaid: 0,
      coins: 40,
    })
  })

  it('is null for refusals and garbage', () => {
    expect(parseClaimPrize({ status: 'incomplete' })).toBeNull()
    expect(parseClaimPrize({ status: 'unknown_level' })).toBeNull()
    expect(parseClaimPrize({ status: 'ok' })).toBeNull()
    expect(parseClaimPrize(null)).toBeNull()
  })
})
