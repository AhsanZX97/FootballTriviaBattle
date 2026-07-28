import { describe, expect, it } from 'vitest'
import { isNonRevenuePurchase, isWellFormedRequest, verifyPurchase } from '../verify'

describe('verifyPurchase', () => {
  it('credits a completed purchase', () => {
    expect(verifyPurchase({ purchaseState: 0 })).toBe('purchased')
  })

  it('holds off on a deferred payment rather than crediting it', () => {
    expect(verifyPurchase({ purchaseState: 2 })).toBe('pending')
  })

  it('never credits a cancelled or refunded purchase', () => {
    expect(verifyPurchase({ purchaseState: 1 })).toBe('cancelled')
  })

  it('fails closed on a missing purchase state', () => {
    expect(verifyPurchase({})).toBe('invalid')
  })

  it('fails closed on a null or undefined response', () => {
    expect(verifyPurchase(null)).toBe('invalid')
    expect(verifyPurchase(undefined)).toBe('invalid')
  })

  it('fails closed on a purchase state it does not recognise', () => {
    expect(verifyPurchase({ purchaseState: 99 })).toBe('invalid')
  })

  it('credits regardless of whether the token was already consumed', () => {
    // Normal after a reinstall. Double-crediting is stopped by the
    // purchase_token primary key, not here.
    expect(verifyPurchase({ purchaseState: 0, consumptionState: 1 })).toBe('purchased')
  })
})

describe('isNonRevenuePurchase', () => {
  it.each([
    ['licence tester', 0],
    ['promo code', 1],
  ])('flags a %s purchase', (_label, purchaseType) => {
    expect(isNonRevenuePurchase({ purchaseState: 0, purchaseType })).toBe(true)
  })

  it('treats a normal paid purchase, which carries no purchaseType, as revenue', () => {
    expect(isNonRevenuePurchase({ purchaseState: 0 })).toBe(false)
  })
})

describe('isWellFormedRequest', () => {
  const token = 'abcdefg.AO-J1Ox_valid_looking_token'

  it('accepts a plausible product id and token', () => {
    expect(isWellFormedRequest('coins_500', token)).toBe(true)
  })

  it.each([
    ['a missing product id', undefined, 'tok'],
    ['a non-string product id', 42, 'tok'],
    ['an empty product id', '', 'tok'],
    ['an uppercase product id', 'Coins_500', 'tok'],
    ['a product id with a slash, which could escape the request path', 'a/../b', 'tok'],
    ['a missing token', 'coins_500', undefined],
    ['an empty token', 'coins_500', ''],
    ['an absurdly long token', 'coins_500', 'x'.repeat(1025)],
  ])('rejects %s', (_label, productId, purchaseToken) => {
    expect(isWellFormedRequest(productId, purchaseToken)).toBe(false)
  })
})
