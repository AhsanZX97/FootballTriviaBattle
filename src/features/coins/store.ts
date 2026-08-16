import { coinsApi, type CoinsApi } from '../../services/coins'
import { showRewardedAd, type RewardedAdOutcome } from '../../services/ads'
import { analytics } from '../../services/analytics'
import {
  consume,
  fetchPrices,
  isBillingAvailable,
  listUnconsumed,
  purchasePack,
  type PendingPurchase,
  type PurchaseAttempt,
} from '../../services/billing'
import type { BuyPackResult, CoinPackOffer } from '../../types/coins'
import { authStore } from '../auth/store'
import { t } from '../../services/i18n/store'

/**
 * How a "watch an ad for coins" attempt ended, from the UI's point of view.
 * Distinct from `RewardedAdOutcome`: that describes the ad, this describes
 * whether the player got paid and why not.
 */
export type WatchAdResult = 'ok' | 'no_reward' | 'unavailable' | 'rate_limited' | 'signed_out' | 'busy'

/**
 * What one rewarded ad pays, for display only.
 *
 * IMPORTANT: the real payout lives in `claim_rewarded_ad` (0009_rewarded_ads.sql)
 * and that is what a player is actually credited — a client can't be trusted
 * with what a reward is worth. Keep the two in sync; if they ever drift, the DB
 * wins on what is actually granted. Same rule as shopCatalogue.ts vs shop_items.
 */
export const REWARDED_AD_COINS = 25

/** Rewarded ads a player may watch per day. Display only — the daily cap in
 * `claim_rewarded_ad` is what actually enforces it. */
export const REWARDED_ADS_PER_DAY = 5

export interface CoinsState {
  /** True from the moment the ad is requested until the claim settles, so the
   * button can show progress and refuse a second tap. */
  watching: boolean
  /** Rewarded ads left today, or null while unknown (not yet loaded, signed
   * out, or the lookup failed). Advisory — the server enforces the real cap. */
  remaining: number | null
  /** Real-money coin packs, cheapest first, each with the Play Store's own
   * localized price (null when Play couldn't price it). */
  packs: CoinPackOffer[]
  /** False on web, on devices without Play Billing, and before the check has
   * run — the UI hides the paid section entirely rather than offering a
   * button that cannot work. */
  billingAvailable: boolean
  /** Product id of the pack currently being bought, so only its tile shows
   * progress. */
  purchasing: string | null
  /** Surfaced when an attempt fails; cleared on the next attempt. */
  error: string | null
}

/** Minimal slice of the auth store this store needs. Injected so tests can
 * drive it without the real singleton (same seam as the shop store). */
export interface CoinsAuthSeam {
  getState(): { status: string }
  applyCoinsUpdate(balance: number): void
}

/** The Play Billing operations this store drives, as an injectable seam — the
 * real implementations live in services/billing.ts and cannot run under
 * vitest (they need a native WebView). */
export interface CoinsBillingSeam {
  isAvailable(): Promise<boolean>
  fetchPrices(productIds: string[]): Promise<Record<string, string>>
  purchase(productId: string): Promise<PurchaseAttempt>
  consume(purchaseToken: string): Promise<void>
  listUnconsumed(): Promise<PendingPurchase[]>
}

type Listener = () => void

const SIGNED_OUT_ERROR = () => t('coins.error.signedOut')
const UNAVAILABLE_ERROR = () => t('coins.error.unavailable')
const RATE_LIMITED_ERROR = () => t('coins.error.rateLimited')
const SIGNED_OUT_BUY_ERROR = () => t('coins.error.signedOutBuy')
const PURCHASE_FAILED_ERROR = () => t('coins.error.purchaseFailed')
const STORE_UNAVAILABLE_ERROR = () => t('coins.error.storeUnavailable')

const emptyState = (): CoinsState => ({
  watching: false,
  remaining: null,
  packs: [],
  billingAvailable: false,
  purchasing: null,
  error: null,
})

const defaultBilling: CoinsBillingSeam = {
  isAvailable: isBillingAvailable,
  fetchPrices,
  purchase: purchasePack,
  consume,
  listUnconsumed,
}

/** Exported for tests, which inject a fake api, ad runner, billing seam and
 * auth seam; the app uses the `coinsStore` singleton. */
export function createCoinsStore(
  deps: {
    api?: CoinsApi
    auth?: CoinsAuthSeam
    showAd?: () => Promise<RewardedAdOutcome>
    billing?: CoinsBillingSeam
  } = {},
) {
  const api = deps.api ?? coinsApi
  const auth = deps.auth ?? (authStore as unknown as CoinsAuthSeam)
  const showAd = deps.showAd ?? showRewardedAd
  const billing = deps.billing ?? defaultBilling

  let state: CoinsState = emptyState()
  const listeners = new Set<Listener>()

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const set = (patch: Partial<CoinsState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  const signedIn = () => auth.getState().status === 'signedIn'

  /** Everything the "get coins" popup needs, loaded on open. The two halves are
   * independent — a failure to price the packs must not cost the player their
   * ad rewards, and vice versa. */
  async function refresh(): Promise<void> {
    await Promise.all([refreshAdAllowance(), refreshPacks()])
  }

  /** How many ad rewards are left today. A failed lookup leaves `remaining`
   * null, which the UI reads as "unknown" and still lets the player try — the
   * server is the one that says no. */
  async function refreshAdAllowance(): Promise<void> {
    if (!signedIn()) {
      set({ remaining: null })
      return
    }
    set({ remaining: await api.rewardedAdsRemaining() })
  }

  /** The pack catalogue, priced by the Play Store. Loaded signed-out too: the
   * catalogue is public, and a player deciding whether to make an account
   * should be able to see what is on offer. */
  async function refreshPacks(): Promise<void> {
    const [billingAvailable, packs] = await Promise.all([billing.isAvailable(), api.listCoinPacks()])
    const prices = billingAvailable
      ? await billing.fetchPrices(packs.map((p) => p.productId))
      : {}
    set({
      billingAvailable,
      // A pack Play won't price gets a null priceString and the UI refuses to
      // sell it — never a buy button whose cost we can't state.
      packs: packs.map((p) => ({ ...p, priceString: prices[p.productId] ?? null })),
    })
  }

  /**
   * Play a rewarded ad and, if the player earned it, claim the coins. The
   * server owns the payout and the rate limit; this only banks the result, so
   * a refused claim can never leave the counter showing coins that weren't
   * actually granted.
   */
  async function watchAdForCoins(): Promise<WatchAdResult> {
    if (state.watching) return 'busy'
    if (!signedIn()) {
      set({ error: SIGNED_OUT_ERROR() })
      return 'signed_out'
    }

    set({ watching: true, error: null })
    const outcome = await showAd()

    if (outcome !== 'rewarded') {
      // Dismissing is the player's own choice and needs no explanation; a
      // missing ad is the app failing them and does.
      set({ watching: false, error: outcome === 'unavailable' ? UNAVAILABLE_ERROR() : null })
      return outcome === 'unavailable' ? 'unavailable' : 'no_reward'
    }

    // Tracked on the ad completing, not on the claim: the claim can still be
    // refused by the daily cap, and "watched an ad" is the engagement signal.
    analytics.track('rewarded_ad_watched', {})

    const balance = await api.claimRewardedAd()
    if (balance === null) {
      set({ watching: false, error: RATE_LIMITED_ERROR() })
      return 'rate_limited'
    }

    auth.applyCoinsUpdate(balance)
    set({
      watching: false,
      // One fewer than whatever we last knew about; the next refresh corrects
      // any drift. Never goes below zero.
      remaining: state.remaining === null ? null : Math.max(0, state.remaining - 1),
    })
    return 'ok'
  }

  /**
   * Buy a coin pack with real money.
   *
   * The ordering here is the whole safety story and must not be rearranged:
   * pay → verify server-side → credit → consume. Consuming destroys the
   * purchase token, which is the only proof the player paid, so it happens
   * last and only once the coins are banked. Anything that goes wrong before
   * that leaves the purchase intact for `recoverPurchases` to finish.
   */
  async function buyPack(productId: string): Promise<BuyPackResult> {
    if (state.purchasing !== null) return 'busy'
    if (!signedIn()) {
      set({ error: SIGNED_OUT_BUY_ERROR() })
      return 'signed_out'
    }

    set({ purchasing: productId, error: null })
    const attempt = await billing.purchase(productId)

    if (attempt.status === 'cancelled') {
      // Backing out of the payment sheet is a decision, not a failure.
      set({ purchasing: null })
      return 'cancelled'
    }
    if (attempt.status === 'unavailable') {
      set({ purchasing: null, error: STORE_UNAVAILABLE_ERROR() })
      return 'unavailable'
    }

    const result = await redeem(productId, attempt.purchaseToken)
    set({ purchasing: null, error: result === 'error' ? PURCHASE_FAILED_ERROR() : null })
    return result
  }

  /** Verify one purchase with the server and, if it holds up, credit and
   * consume it. Shared by the buy flow and the recovery sweep so both obey the
   * same credit-before-consume rule. */
  async function redeem(
    productId: string,
    purchaseToken: string,
  ): Promise<'ok' | 'pending' | 'error'> {
    const { status, coins } = await api.redeemPurchase(productId, purchaseToken)

    // A deferred payment may still complete. Leave it unconsumed so the next
    // sweep picks it up rather than throwing the purchase away.
    if (status === 'pending') return 'pending'
    if (status !== 'ok' && status !== 'already_redeemed') return 'error'

    // already_redeemed is a success from here: the coins are on the account,
    // and the balance in the response is the server's current truth.
    auth.applyCoinsUpdate(coins)
    await billing.consume(purchaseToken)
    return 'ok'
  }

  /**
   * Finish any purchase Play is still holding — the app died between paying
   * and crediting, or the verify/consume call failed. Safe to call on every
   * app open: redemption is idempotent on the purchase token, so a token that
   * was already credited just consumes.
   *
   * Signed out this does nothing at all, deliberately: there is no account to
   * credit, and consuming now would destroy a purchase the player has paid for
   * but never received.
   */
  async function recoverPurchases(): Promise<void> {
    if (!signedIn()) return
    for (const pending of await billing.listUnconsumed()) {
      await redeem(pending.productId, pending.purchaseToken)
    }
  }

  function clearError(): void {
    set({ error: null })
  }

  return {
    getState,
    subscribe,
    refresh,
    watchAdForCoins,
    buyPack,
    recoverPurchases,
    clearError,
  }
}

export type CoinsStore = ReturnType<typeof createCoinsStore>

export const coinsStore = createCoinsStore()
