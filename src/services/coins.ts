import { supabase } from './supabase'
import type { CoinPack, RedeemResponse } from '../types/coins'

/**
 * The coin-acquisition operations the coins store depends on. Defined as an
 * interface so the store's tests can inject a fake instead of hitting the
 * network (same seam as `CustomizationApi` and `FriendsApi`).
 */
export interface CoinsApi {
  /** Grants the coins for one watched rewarded ad. Resolves with the new
   * balance, or null when the server refused (cooldown, daily cap, signed
   * out) — the caller must not assume a refusal is an error worth retrying. */
  claimRewardedAd(): Promise<number | null>
  /** How many rewarded ads the player has left today. Advisory: the RPC above
   * is what actually enforces the cap. Null when it can't be determined. */
  rewardedAdsRemaining(): Promise<number | null>
  /** The real-money coin pack catalogue, cheapest first. Empty on failure. */
  listCoinPacks(): Promise<CoinPack[]>
  /** Hands a Play purchase token to the verify-coin-purchase edge function,
   * which checks it with Google before crediting anything. */
  redeemPurchase(productId: string, purchaseToken: string): Promise<RedeemResponse>
}

interface CoinPackRow {
  product_id: string
  coins: number
  name: string
  sort_order: number
}

async function claimRewardedAd(): Promise<number | null> {
  const { data, error } = await supabase.rpc('claim_rewarded_ad')
  if (error) {
    console.error('[coins] claim_rewarded_ad failed', error)
    return null
  }
  // The RPC returns null when rate-limited, which is a legitimate outcome
  // rather than a failure — either way there is no new balance to bank.
  return typeof data === 'number' ? data : null
}

async function rewardedAdsRemaining(): Promise<number | null> {
  const { data, error } = await supabase.rpc('rewarded_ads_remaining')
  if (error) {
    console.error('[coins] rewarded_ads_remaining failed', error)
    return null
  }
  return typeof data === 'number' ? data : null
}

async function listCoinPacks(): Promise<CoinPack[]> {
  const { data, error } = await supabase
    .from('coin_packs')
    .select('product_id, coins, name, sort_order')
    .eq('active', true)
    .order('sort_order')
  if (error) {
    console.error('[coins] listCoinPacks failed', error)
    return []
  }
  return ((data as CoinPackRow[] | null) ?? []).map((r) => ({
    productId: r.product_id,
    coins: r.coins,
    name: r.name,
    sortOrder: r.sort_order,
  }))
}

async function redeemPurchase(productId: string, purchaseToken: string): Promise<RedeemResponse> {
  // invoke (rather than a raw fetch like loginWithUsername) so the caller's
  // own session JWT is attached — the function derives the user from it and
  // never trusts a user id in the body.
  const { data, error } = await supabase.functions.invoke('verify-coin-purchase', {
    body: { productId, purchaseToken },
  })

  // A non-2xx from the function surfaces as `error` with the body still in
  // `data`; a genuine 402/401 is a real answer, not a transport failure, so
  // prefer the body's status whenever there is one.
  const row = data as Partial<RedeemResponse> | null
  if (row?.status) return { status: row.status, coins: row.coins ?? 0 }
  if (error) console.error('[coins] redeemPurchase failed', error)
  return { status: 'error', coins: 0 }
}

export const coinsApi: CoinsApi = {
  claimRewardedAd,
  rewardedAdsRemaining,
  listCoinPacks,
  redeemPurchase,
}
