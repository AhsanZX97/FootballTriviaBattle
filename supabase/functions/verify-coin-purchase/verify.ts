// Pure decision logic for a Google Play purchase, kept free of Deno, network
// and Supabase imports so it can be unit-tested with the project's normal
// vitest run (see __tests__/verify.test.ts). index.ts owns all the I/O.

/**
 * The subset of Google Play's `purchases.products.get` response this backend
 * actually reads.
 *
 * @see https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products
 */
export interface PlayProductPurchase {
  /** 0 = Purchased, 1 = Cancelled, 2 = Pending. */
  purchaseState?: number
  /** 0 = yet to be consumed, 1 = consumed. */
  consumptionState?: number
  /** 0 = acknowledged not yet, 1 = acknowledged. */
  acknowledgementState?: number
  /** 0 = Test (from a licence tester), 1 = Promo, 2 = Rewarded. Absent for a
   * normal paid purchase. */
  purchaseType?: number
  orderId?: string
}

export type PurchaseVerdict =
  /** Paid for and final — safe to credit. */
  | 'purchased'
  /** Deferred payment (e.g. cash at a kiosk) that hasn't completed. Not a
   * failure: the client should try again later, not show an error. */
  | 'pending'
  /** Cancelled or refunded. Never credit. */
  | 'cancelled'
  /** Google returned something this code doesn't recognise. Fail closed. */
  | 'invalid'

/**
 * What to do with a purchase Google has told us about.
 *
 * Note what is deliberately NOT checked here: that the purchase belongs to the
 * product the client claimed. That binding is enforced by the request URL —
 * `purchases/products/{productId}/tokens/{token}` — which Google rejects when
 * the token was not issued for that product. A client that lies about the
 * product never gets a 200 back in the first place.
 *
 * `consumptionState` is likewise not checked. An already-consumed token is
 * normal on a reinstall, and double-crediting is prevented by the
 * purchase_token primary key on iap_purchases, not by this function.
 */
export function verifyPurchase(purchase: PlayProductPurchase | null | undefined): PurchaseVerdict {
  if (!purchase || typeof purchase.purchaseState !== 'number') return 'invalid'
  switch (purchase.purchaseState) {
    case 0:
      return 'purchased'
    case 1:
      return 'cancelled'
    case 2:
      return 'pending'
    default:
      return 'invalid'
  }
}

/**
 * True when the purchase came from a licence tester or a promo code rather
 * than real money. Still credited — that is the whole point of testing the
 * flow end to end — but worth logging so test grants are distinguishable from
 * revenue in the function's logs.
 */
export function isNonRevenuePurchase(purchase: PlayProductPurchase): boolean {
  return purchase.purchaseType === 0 || purchase.purchaseType === 1
}

/** Rejects tokens and product ids that are obviously not worth a round-trip to
 * Google — empty, absurdly long, or (for the product id) not in the shape Play
 * allows. Cheap guard so a malformed request can't be used to hammer the Play
 * API through this endpoint. */
export function isWellFormedRequest(productId: unknown, purchaseToken: unknown): boolean {
  return (
    typeof productId === 'string' &&
    typeof purchaseToken === 'string' &&
    // Play product ids: lowercase alphanumerics, underscores and periods.
    /^[a-z0-9._]{1,64}$/.test(productId) &&
    purchaseToken.length > 0 &&
    purchaseToken.length <= 1024
  )
}
