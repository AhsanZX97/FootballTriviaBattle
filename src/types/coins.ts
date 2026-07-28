/** A real-money coin pack, as the database defines it. Mirrors a row of
 * `coin_packs` (0010_coin_packs.sql). `coins` is display-only here — the
 * server credits from its own copy. */
export interface CoinPack {
  /** The Play Console in-app product id. */
  productId: string
  coins: number
  name: string
  sortOrder: number
}

/**
 * A pack ready to show in the shop: the catalogue row plus the localized price
 * Google Play reports for it.
 *
 * `priceString` is deliberately the store's own string ("£2.99", "₦4,500")
 * rather than anything computed here — it is already formatted for the
 * player's country and currency, and it is what they will actually be charged.
 * Null means the price couldn't be fetched, and the pack must not be offered:
 * a buy button with no price is a dark pattern.
 */
export interface CoinPackOffer extends CoinPack {
  priceString: string | null
}

/** What the verify-coin-purchase edge function reports back. */
export type RedeemStatus =
  | 'ok'
  | 'already_redeemed'
  /** Deferred payment that hasn't cleared. Retry later; not an error. */
  | 'pending'
  | 'not_purchased'
  | 'unauthorized'
  | 'error'

export interface RedeemResponse {
  status: RedeemStatus
  /** The resulting balance; only meaningful for ok / already_redeemed. */
  coins: number
}

/** How a coin-pack purchase attempt ended, from the UI's point of view. */
export type BuyPackResult =
  | 'ok'
  /** The player backed out of the Play purchase sheet. */
  | 'cancelled'
  /** Payment taken but not yet cleared — coins will follow. */
  | 'pending'
  | 'unavailable'
  | 'signed_out'
  | 'busy'
  | 'error'
