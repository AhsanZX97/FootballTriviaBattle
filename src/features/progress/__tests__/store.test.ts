import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalProgressStore } from '../store'
import type { LocalProgressApi } from '../../../services/localProgress'
import {
  LOCAL_MATCH_CLAIM_LIMIT,
  LOCAL_MATCH_LOG_LIMIT,
  emptyLocalProgress,
} from '../../../types/progress'
import type { LocalMatchResult } from '../../../types/progress'
import type { PurchaseResult } from '../../../types/customization'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  }
}

const aMatch = (over: Partial<LocalMatchResult> = {}): LocalMatchResult => ({
  outcome: 'win',
  userScore: 3,
  opponentScore: 1,
  opponentName: 'Bot',
  byDisconnect: false,
  createdAt: '2026-08-21T10:00:00.000Z',
  ...over,
})

/** Fake CustomizationApi for the claim-time re-charge. */
function fakeShop(purchase: PurchaseResult = 'ok') {
  return {
    purchaseItem: vi.fn(async () => ({ status: purchase, coins: 0 })),
    setCustomization: vi.fn(async () => true),
    listOwnedItems: vi.fn(async () => [] as string[]),
  }
}

describe('local progress store', () => {
  let storage: ReturnType<typeof fakeStorage>
  let api: LocalProgressApi & { claimLocalProgress: ReturnType<typeof vi.fn> }
  let shop: ReturnType<typeof fakeShop>

  beforeEach(() => {
    storage = fakeStorage()
    api = { claimLocalProgress: vi.fn(async () => ({ coins: 300, granted: 12 })) }
    shop = fakeShop()
  })

  it('starts empty', () => {
    const store = createLocalProgressStore({ storage, api })
    expect(store.getState()).toEqual(emptyLocalProgress())
  })

  it('accumulates coins and persists them across store instances', () => {
    const first = createLocalProgressStore({ storage, api })
    first.addCoins(3)
    first.addCoins(5)
    expect(first.getState().coins).toBe(8)

    const second = createLocalProgressStore({ storage, api })
    expect(second.getState().coins).toBe(8)
  })

  it('ignores non-positive coin awards', () => {
    const store = createLocalProgressStore({ storage, api })
    store.addCoins(0)
    store.addCoins(-5)
    expect(store.getState().coins).toBe(0)
  })

  it('records matches most-recent-first', () => {
    const store = createLocalProgressStore({ storage, api })
    store.recordMatch(aMatch({ opponentName: 'older' }))
    store.recordMatch(aMatch({ opponentName: 'newer' }))
    expect(store.getState().matches.map((m) => m.opponentName)).toEqual(['newer', 'older'])
  })

  it('caps the match log, dropping the oldest entries', () => {
    const store = createLocalProgressStore({ storage, api })
    for (let i = 0; i < LOCAL_MATCH_LOG_LIMIT + 10; i++) {
      store.recordMatch(aMatch({ opponentName: `match-${i}` }))
    }
    const { matches } = store.getState()
    expect(matches).toHaveLength(LOCAL_MATCH_LOG_LIMIT)
    expect(matches[0].opponentName).toBe(`match-${LOCAL_MATCH_LOG_LIMIT + 9}`)
  })

  it('starts fresh when stored progress is corrupt', () => {
    const store = createLocalProgressStore({ storage: fakeStorage({ 'ftb.progress': '{{' }), api })
    expect(store.getState()).toEqual(emptyLocalProgress())
  })

  it('notifies subscribers on every change', () => {
    const store = createLocalProgressStore({ storage, api })
    const listener = vi.fn()
    store.subscribe(listener)
    store.addCoins(3)
    store.recordMatch(aMatch())
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('claims coins and match history, then clears local progress', async () => {
    const store = createLocalProgressStore({ storage, api })
    store.addCoins(12)
    store.recordMatch(aMatch())

    const result = await store.claim()

    expect(api.claimLocalProgress).toHaveBeenCalledWith(12, [aMatch()], {
      streak: 0,
      lastDate: null,
    })
    expect(result).toEqual({ coins: 300, granted: 12 })
    expect(store.getState()).toEqual(emptyLocalProgress())
  })

  it('sends at most LOCAL_MATCH_CLAIM_LIMIT matches', async () => {
    const store = createLocalProgressStore({ storage, api })
    store.addCoins(1)
    for (let i = 0; i < LOCAL_MATCH_CLAIM_LIMIT + 5; i++) store.recordMatch(aMatch())

    await store.claim()

    const [, matches] = api.claimLocalProgress.mock.calls[0]
    expect(matches).toHaveLength(LOCAL_MATCH_CLAIM_LIMIT)
  })

  it('does not call the server when there is nothing to claim', async () => {
    const store = createLocalProgressStore({ storage, api })
    expect(await store.claim()).toBeNull()
    expect(api.claimLocalProgress).not.toHaveBeenCalled()
  })

  it('claims history even when no coins were earned', async () => {
    const store = createLocalProgressStore({ storage, api })
    store.recordMatch(aMatch({ outcome: 'loss' }))
    expect(await store.claim()).not.toBeNull()
    expect(api.claimLocalProgress).toHaveBeenCalled()
  })

  it('keeps progress intact when the claim fails, so it can be retried', async () => {
    const failing = { claimLocalProgress: vi.fn(async () => null) }
    const store = createLocalProgressStore({ storage, api: failing })
    store.addCoins(9)
    store.recordMatch(aMatch())

    expect(await store.claim()).toBeNull()
    expect(store.getState().coins).toBe(9)
    expect(store.getState().matches).toHaveLength(1)
  })

  it('pays today’s login reward without an account, starting the cycle at day 1', () => {
    const store = createLocalProgressStore({ storage, api, now: () => new Date(2026, 7, 21, 12) })

    expect(store.claimDailyReward()).toEqual({ reward: 5, streak: 1 })
    expect(store.getState()).toMatchObject({ coins: 5, dailyRewardStreak: 1 })
  })

  it('refuses a second login reward on the same day', () => {
    const store = createLocalProgressStore({ storage, api, now: () => new Date(2026, 7, 21, 12) })
    store.claimDailyReward()

    expect(store.claimDailyReward()).toBeNull()
    expect(store.getState().coins).toBe(5)
  })

  it('advances the streak on a consecutive day', () => {
    let today = new Date(2026, 7, 21, 12)
    const store = createLocalProgressStore({ storage, api, now: () => today })
    store.claimDailyReward()

    today = new Date(2026, 7, 22, 12)
    expect(store.claimDailyReward()).toEqual({ reward: 5, streak: 2 })
  })

  it('resets the streak after a missed day', () => {
    let today = new Date(2026, 7, 21, 12)
    const store = createLocalProgressStore({ storage, api, now: () => today })
    store.claimDailyReward()

    today = new Date(2026, 7, 24, 12) // two days skipped
    expect(store.claimDailyReward()).toEqual({ reward: 5, streak: 1 })
  })

  it('pays the day-7 milestone, then wraps back to day 1', () => {
    let day = 21
    const store = createLocalProgressStore({ storage, api, now: () => new Date(2026, 7, day, 12) })
    for (let i = 0; i < 6; i++, day++) store.claimDailyReward()

    expect(store.claimDailyReward()).toEqual({ reward: 20, streak: 7 })
    day++
    expect(store.claimDailyReward()).toEqual({ reward: 5, streak: 1 })
  })

  it('persists the streak across store instances', () => {
    const now = () => new Date(2026, 7, 21, 12)
    createLocalProgressStore({ storage, api, now }).claimDailyReward()

    const next = createLocalProgressStore({ storage, api, now })
    expect(next.getState()).toMatchObject({ dailyRewardStreak: 1, lastDailyRewardDate: '2026-08-21' })
    // Already claimed today — a fresh instance must not hand out a second one.
    expect(next.claimDailyReward()).toBeNull()
  })

  it('carries the streak up so a converting player keeps their cycle', async () => {
    const store = createLocalProgressStore({ storage, api, now: () => new Date(2026, 7, 21, 12) })
    store.claimDailyReward()

    await store.claim()

    expect(api.claimLocalProgress).toHaveBeenCalledWith(5, [], {
      streak: 1,
      lastDate: '2026-08-21',
    })
  })

  it('claims a streak even with no coins or matches banked', async () => {
    const store = createLocalProgressStore({ storage, api })
    // A streak alone is worth carrying up — it is the cycle position, not coins.
    store.claimDailyReward()
    expect(store.hasProgress()).toBe(true)
  })

  it('buys a cosmetic with on-device coins, debiting the balance', () => {
    const store = createLocalProgressStore({ storage, api })
    store.addCoins(150)

    expect(store.purchaseItem('gold-trim', 100)).toBe(true)
    expect(store.getState().coins).toBe(50)
    expect(store.owns('gold-trim')).toBe(true)
  })

  it('refuses a purchase the balance cannot cover', () => {
    const store = createLocalProgressStore({ storage, api })
    store.addCoins(50)

    expect(store.purchaseItem('gold-trim', 100)).toBe(false)
    expect(store.getState().coins).toBe(50)
    expect(store.owns('gold-trim')).toBe(false)
  })

  it('does not charge twice for the same item', () => {
    const store = createLocalProgressStore({ storage, api })
    store.addCoins(300)
    store.purchaseItem('gold-trim', 100)

    expect(store.purchaseItem('gold-trim', 100)).toBe(false)
    expect(store.getState().coins).toBe(200)
  })

  it('treats the stock look as always owned', () => {
    const store = createLocalProgressStore({ storage, api })
    expect(store.owns('default')).toBe(true)
    expect(store.equip('ballSkin', 'default')).toBe(true)
  })

  it('equips only what was bought on-device', () => {
    const store = createLocalProgressStore({ storage, api })
    store.addCoins(100)

    expect(store.equip('ballSkin', 'gold-trim')).toBe(false)
    store.purchaseItem('gold-trim', 100)
    expect(store.equip('ballSkin', 'gold-trim')).toBe(true)
    expect(store.getState().customization.ballSkin).toBe('gold-trim')
  })

  it('pays an ad reward and counts it against the daily allowance', () => {
    const store = createLocalProgressStore({ storage, api, now: () => new Date(2026, 7, 21, 12) })

    expect(store.recordAdReward(25, 5)).toBe(true)
    expect(store.getState().coins).toBe(25)
    expect(store.adsRemaining(5)).toBe(4)
  })

  it('refuses an ad reward once the daily allowance is spent', () => {
    const store = createLocalProgressStore({ storage, api, now: () => new Date(2026, 7, 21, 12) })
    for (let i = 0; i < 5; i++) store.recordAdReward(25, 5)

    expect(store.recordAdReward(25, 5)).toBe(false)
    expect(store.getState().coins).toBe(125)
    expect(store.adsRemaining(5)).toBe(0)
  })

  it('resets the ad allowance on a new day', () => {
    let today = new Date(2026, 7, 21, 12)
    const store = createLocalProgressStore({ storage, api, now: () => today })
    for (let i = 0; i < 5; i++) store.recordAdReward(25, 5)

    today = new Date(2026, 7, 22, 12)
    expect(store.adsRemaining(5)).toBe(5)
    expect(store.recordAdReward(25, 5)).toBe(true)
  })

  it('claims the gross coins earned, including what was spent on-device', async () => {
    const store = createLocalProgressStore({ storage, api, shop })
    store.addCoins(150)
    store.purchaseItem('gold-trim', 100)

    await store.claim()

    // 50 left + 100 spent = the 150 actually earned.
    expect(api.claimLocalProgress.mock.calls[0][0]).toBe(150)
  })

  it('re-buys on-device purchases server-side, then applies the look', async () => {
    const store = createLocalProgressStore({ storage, api, shop })
    store.addCoins(150)
    store.purchaseItem('gold-trim', 100)
    store.equip('ballSkin', 'gold-trim')

    await store.claim()

    expect(shop.purchaseItem).toHaveBeenCalledWith('gold-trim')
    expect(shop.setCustomization).toHaveBeenCalledWith('ballSkin', 'gold-trim')
  })

  it('does not equip an item the server refused to sell', async () => {
    const broke = fakeShop('insufficient_coins')
    const store = createLocalProgressStore({ storage, api, shop: broke })
    store.addCoins(150)
    store.purchaseItem('gold-trim', 100)
    store.equip('ballSkin', 'gold-trim')

    await store.claim()

    // The item never landed, so the profile must not be pointed at it.
    expect(broke.setCustomization).not.toHaveBeenCalled()
  })

  it('still banks the coins when the purchase re-charge throws', async () => {
    const exploding = {
      ...fakeShop(),
      purchaseItem: vi.fn(async () => {
        throw new Error('network')
      }),
    }
    const store = createLocalProgressStore({ storage, api, shop: exploding })
    store.addCoins(150)
    store.purchaseItem('gold-trim', 100)

    await expect(store.claim()).resolves.toEqual({ coins: 300, granted: 12 })
    expect(store.getState()).toEqual(emptyLocalProgress())
  })

  it('claims a purchase even with no coins left over', async () => {
    const store = createLocalProgressStore({ storage, api, shop })
    store.addCoins(100)
    store.purchaseItem('gold-trim', 100)

    expect(store.hasProgress()).toBe(true)
    expect(await store.claim()).not.toBeNull()
  })

  it('does not run two claims at once', async () => {
    const store = createLocalProgressStore({ storage, api })
    store.addCoins(4)
    const [first, second] = await Promise.all([store.claim(), store.claim()])
    expect(api.claimLocalProgress).toHaveBeenCalledTimes(1)
    // Whichever lost the race resolves null rather than double-claiming.
    expect([first, second].filter((r) => r !== null)).toHaveLength(1)
  })
})
