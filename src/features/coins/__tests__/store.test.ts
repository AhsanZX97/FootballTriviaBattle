import { describe, expect, it, vi } from 'vitest'
import { createCoinsStore } from '../store'
import type { CoinsApi } from '../../../services/coins'
import type { RewardedAdOutcome } from '../../../services/ads'
import type { PendingPurchase, PurchaseAttempt } from '../../../services/billing'
import type { CoinPack } from '../../../types/coins'

const PACKS: CoinPack[] = [
  { productId: 'coins_500', coins: 500, name: 'HANDFUL OF COINS', sortOrder: 1 },
  { productId: 'coins_1200', coins: 1200, name: 'SACK OF COINS', sortOrder: 2 },
]

type Overrides = {
  api?: Partial<CoinsApi>
  outcome?: RewardedAdOutcome
  status?: string
  /** Fakes the Play billing seam. */
  billing?: {
    available?: boolean
    prices?: Record<string, string>
    attempt?: PurchaseAttempt
  }
}

function makeDeps({ api = {}, outcome = 'rewarded', status = 'signedIn', billing = {} }: Overrides = {}) {
  const coinUpdates: number[] = []
  const fullApi: CoinsApi = {
    claimRewardedAd: api.claimRewardedAd ?? vi.fn(async () => 125),
    rewardedAdsRemaining: api.rewardedAdsRemaining ?? vi.fn(async () => 4),
    listCoinPacks: api.listCoinPacks ?? vi.fn(async () => PACKS),
    redeemPurchase: api.redeemPurchase ?? vi.fn(async () => ({ status: 'ok' as const, coins: 700 })),
  }
  const showAd = vi.fn(async (): Promise<RewardedAdOutcome> => outcome)
  const auth = {
    getState: () => ({ status }),
    applyCoinsUpdate: (balance: number) => {
      coinUpdates.push(balance)
    },
  }
  const billingSeam = {
    isAvailable: vi.fn(async () => billing.available ?? true),
    fetchPrices: vi.fn(async () => billing.prices ?? { coins_500: '£1.99', coins_1200: '£3.99' }),
    purchase: vi.fn(
      async (): Promise<PurchaseAttempt> =>
        billing.attempt ?? { status: 'ok', purchaseToken: 'tok-1' },
    ),
    consume: vi.fn(async () => {}),
    listUnconsumed: vi.fn(async (): Promise<PendingPurchase[]> => []),
  }
  return { api: fullApi, auth, showAd, billing: billingSeam, coinUpdates }
}

describe('coins store', () => {
  it('starts idle with nothing known about the daily allowance', () => {
    const store = createCoinsStore(makeDeps())
    expect(store.getState()).toMatchObject({
      watching: false,
      remaining: null,
      error: null,
    })
  })

  it('banks the new balance and tells the auth store when an ad is watched', async () => {
    const deps = makeDeps()
    const store = createCoinsStore(deps)

    await expect(store.watchAdForCoins()).resolves.toBe('ok')

    expect(deps.coinUpdates).toEqual([125])
    expect(store.getState().error).toBeNull()
    expect(store.getState().watching).toBe(false)
  })

  it('decrements the remaining count locally so the button disables without a refetch', async () => {
    const deps = makeDeps()
    const store = createCoinsStore(deps)
    await store.refresh()
    expect(store.getState().remaining).toBe(4)

    await store.watchAdForCoins()
    expect(store.getState().remaining).toBe(3)
  })

  it('does not claim coins when the player dismissed the ad early', async () => {
    const deps = makeDeps({ outcome: 'dismissed' })
    const store = createCoinsStore(deps)

    await expect(store.watchAdForCoins()).resolves.toBe('no_reward')

    expect(deps.api.claimRewardedAd).not.toHaveBeenCalled()
    expect(deps.coinUpdates).toEqual([])
    // Closing an ad is a deliberate choice — it needs no error message.
    expect(store.getState().error).toBeNull()
  })

  it('explains itself when no ad could be shown', async () => {
    const deps = makeDeps({ outcome: 'unavailable' })
    const store = createCoinsStore(deps)

    await expect(store.watchAdForCoins()).resolves.toBe('unavailable')

    expect(deps.api.claimRewardedAd).not.toHaveBeenCalled()
    expect(store.getState().error).toBeTruthy()
  })

  it('reports a server refusal without changing the balance', async () => {
    // null is what claim_rewarded_ad returns when the cooldown or daily cap bit.
    const deps = makeDeps({ api: { claimRewardedAd: vi.fn(async () => null) } })
    const store = createCoinsStore(deps)

    await expect(store.watchAdForCoins()).resolves.toBe('rate_limited')

    expect(deps.coinUpdates).toEqual([])
    expect(store.getState().error).toBeTruthy()
    expect(store.getState().watching).toBe(false)
  })

  it('refuses to show an ad at all when signed out', async () => {
    const deps = makeDeps({ status: 'signedOut' })
    const store = createCoinsStore(deps)

    await expect(store.watchAdForCoins()).resolves.toBe('signed_out')

    expect(deps.showAd).not.toHaveBeenCalled()
    expect(deps.api.claimRewardedAd).not.toHaveBeenCalled()
    expect(store.getState().error).toBeTruthy()
  })

  it('ignores a second request while an ad is already in flight', async () => {
    const deps = makeDeps()
    const store = createCoinsStore(deps)

    const first = store.watchAdForCoins()
    const second = store.watchAdForCoins()

    expect(await second).toBe('busy')
    await first
    expect(deps.showAd).toHaveBeenCalledTimes(1)
    expect(deps.coinUpdates).toEqual([125])
  })

  it('leaves the allowance unknown rather than guessing when refresh fails', async () => {
    const deps = makeDeps({ api: { rewardedAdsRemaining: vi.fn(async () => null) } })
    const store = createCoinsStore(deps)
    await store.refresh()
    expect(store.getState().remaining).toBeNull()
  })

  it('does not hit the network on refresh when signed out', async () => {
    const deps = makeDeps({ status: 'signedOut' })
    const store = createCoinsStore(deps)
    await store.refresh()
    expect(deps.api.rewardedAdsRemaining).not.toHaveBeenCalled()
    expect(store.getState().remaining).toBeNull()
  })

  it('notifies subscribers as the ad runs', async () => {
    const deps = makeDeps()
    const store = createCoinsStore(deps)
    const seen: boolean[] = []
    const unsubscribe = store.subscribe(() => seen.push(store.getState().watching))

    await store.watchAdForCoins()
    unsubscribe()

    expect(seen[0]).toBe(true)
    expect(seen.at(-1)).toBe(false)
  })

  it('clears a surfaced error on request', async () => {
    const deps = makeDeps({ outcome: 'unavailable' })
    const store = createCoinsStore(deps)
    await store.watchAdForCoins()
    expect(store.getState().error).toBeTruthy()

    store.clearError()
    expect(store.getState().error).toBeNull()
  })
})

describe('coins store — coin packs', () => {
  it('offers no packs until they are loaded', () => {
    const store = createCoinsStore(makeDeps())
    expect(store.getState().packs).toEqual([])
  })

  it('pairs each pack with the price Google Play reports for it', async () => {
    const store = createCoinsStore(makeDeps())
    await store.refresh()

    expect(store.getState().packs).toEqual([
      { productId: 'coins_500', coins: 500, name: 'HANDFUL OF COINS', sortOrder: 1, priceString: '£1.99' },
      { productId: 'coins_1200', coins: 1200, name: 'SACK OF COINS', sortOrder: 2, priceString: '£3.99' },
    ])
  })

  it('leaves a pack unpriced when the store has no price for it', async () => {
    const store = createCoinsStore(makeDeps({ billing: { prices: { coins_500: '£1.99' } } }))
    await store.refresh()

    expect(store.getState().packs.map((p) => p.priceString)).toEqual(['£1.99', null])
  })

  it('reports billing unavailable so the UI can hide the paid section', async () => {
    const store = createCoinsStore(makeDeps({ billing: { available: false } }))
    await store.refresh()
    expect(store.getState().billingAvailable).toBe(false)
  })

  it('credits the coins and only then consumes the purchase', async () => {
    const deps = makeDeps()
    const order: string[] = []
    deps.api.redeemPurchase = vi.fn(async () => {
      order.push('redeem')
      return { status: 'ok' as const, coins: 700 }
    })
    deps.billing.consume = vi.fn(async () => {
      order.push('consume')
    })
    const store = createCoinsStore(deps)

    await expect(store.buyPack('coins_500')).resolves.toBe('ok')

    // Consuming destroys the only proof of payment, so it must come second.
    expect(order).toEqual(['redeem', 'consume'])
    expect(deps.coinUpdates).toEqual([700])
    expect(deps.billing.consume).toHaveBeenCalledWith('tok-1')
  })

  it('does not consume a purchase the server would not verify', async () => {
    const deps = makeDeps({
      api: { redeemPurchase: vi.fn(async () => ({ status: 'not_purchased' as const, coins: 0 })) },
    })
    const store = createCoinsStore(deps)

    await expect(store.buyPack('coins_500')).resolves.toBe('error')

    expect(deps.billing.consume).not.toHaveBeenCalled()
    expect(deps.coinUpdates).toEqual([])
    expect(store.getState().error).toBeTruthy()
  })

  it('consumes an already-redeemed purchase so it stops coming back', async () => {
    const deps = makeDeps({
      api: {
        redeemPurchase: vi.fn(async () => ({ status: 'already_redeemed' as const, coins: 700 })),
      },
    })
    const store = createCoinsStore(deps)

    await expect(store.buyPack('coins_500')).resolves.toBe('ok')

    expect(deps.billing.consume).toHaveBeenCalledWith('tok-1')
    // The balance is still worth banking — it is the server's current truth.
    expect(deps.coinUpdates).toEqual([700])
  })

  it('leaves a pending payment unconsumed so it can be retried', async () => {
    const deps = makeDeps({
      api: { redeemPurchase: vi.fn(async () => ({ status: 'pending' as const, coins: 0 })) },
    })
    const store = createCoinsStore(deps)

    await expect(store.buyPack('coins_500')).resolves.toBe('pending')

    expect(deps.billing.consume).not.toHaveBeenCalled()
    expect(deps.coinUpdates).toEqual([])
  })

  it('says nothing when the player backs out of the Play sheet', async () => {
    const deps = makeDeps({ billing: { attempt: { status: 'cancelled' } } })
    const store = createCoinsStore(deps)

    await expect(store.buyPack('coins_500')).resolves.toBe('cancelled')

    expect(deps.api.redeemPurchase).not.toHaveBeenCalled()
    expect(store.getState().error).toBeNull()
  })

  it('refuses to sell to a signed-out player', async () => {
    const deps = makeDeps({ status: 'signedOut' })
    const store = createCoinsStore(deps)

    await expect(store.buyPack('coins_500')).resolves.toBe('signed_out')

    expect(deps.billing.purchase).not.toHaveBeenCalled()
    expect(store.getState().error).toBeTruthy()
  })

  it('ignores a second buy while one is already in flight', async () => {
    const deps = makeDeps()
    const store = createCoinsStore(deps)

    const first = store.buyPack('coins_500')
    await expect(store.buyPack('coins_1200')).resolves.toBe('busy')
    await first

    expect(deps.billing.purchase).toHaveBeenCalledTimes(1)
  })

  it('tracks which pack is being bought so only its tile shows progress', async () => {
    const deps = makeDeps()
    const store = createCoinsStore(deps)

    const pending = store.buyPack('coins_1200')
    expect(store.getState().purchasing).toBe('coins_1200')
    await pending
    expect(store.getState().purchasing).toBeNull()
  })
})

describe('coins store — recovering interrupted purchases', () => {
  it('redeems and consumes a purchase left behind by an earlier crash', async () => {
    const deps = makeDeps()
    deps.billing.listUnconsumed = vi.fn(async () => [
      { productId: 'coins_500', purchaseToken: 'stale-tok' },
    ])
    const store = createCoinsStore(deps)

    await store.recoverPurchases()

    expect(deps.api.redeemPurchase).toHaveBeenCalledWith('coins_500', 'stale-tok')
    expect(deps.billing.consume).toHaveBeenCalledWith('stale-tok')
    expect(deps.coinUpdates).toEqual([700])
  })

  it('does nothing when Play is holding no purchases', async () => {
    const deps = makeDeps()
    const store = createCoinsStore(deps)

    await store.recoverPurchases()

    expect(deps.api.redeemPurchase).not.toHaveBeenCalled()
    expect(deps.billing.consume).not.toHaveBeenCalled()
  })

  it('does not touch Play purchases while signed out', async () => {
    const deps = makeDeps({ status: 'signedOut' })
    deps.billing.listUnconsumed = vi.fn(async () => [
      { productId: 'coins_500', purchaseToken: 'stale-tok' },
    ])
    const store = createCoinsStore(deps)

    await store.recoverPurchases()

    // Crediting needs a signed-in user; consuming now would lose the purchase.
    expect(deps.api.redeemPurchase).not.toHaveBeenCalled()
    expect(deps.billing.consume).not.toHaveBeenCalled()
  })
})
