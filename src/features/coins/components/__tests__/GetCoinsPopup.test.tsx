import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AuthState } from '../../../../types/auth'
import { defaultCustomization } from '../../../../types/customization'
import type { CoinsApi } from '../../../../services/coins'
import type { RewardedAdOutcome } from '../../../../services/ads'
import type { PurchaseAttempt } from '../../../../services/billing'
import type { CoinPack } from '../../../../types/coins'

const PACKS: CoinPack[] = [
  { productId: 'coins_500', coins: 500, name: 'HANDFUL OF COINS', sortOrder: 1 },
  { productId: 'coins_1200', coins: 1200, name: 'SACK OF COINS', sortOrder: 2 },
]
const PRICES = { coins_500: '£1.99', coins_1200: '£3.99' }

let authState: AuthState
const authListeners = new Set<() => void>()
vi.mock('../../../auth/store', () => ({
  authStore: {
    getState: () => authState,
    subscribe: (l: () => void) => {
      authListeners.add(l)
      return () => void authListeners.delete(l)
    },
  },
}))

import { createCoinsStore } from '../../store'
import { GetCoinsPopup } from '../GetCoinsPopup'

type StoreOptions = {
  api?: Partial<CoinsApi>
  outcome?: RewardedAdOutcome
  /** When set, the ad only settles once the returned `finishAd` is called, so a
   * test can assert what the UI looks like mid-flight. */
  manualAd?: boolean
  billing?: { available?: boolean; prices?: Record<string, string>; attempt?: PurchaseAttempt }
}

/**
 * Each test gets its own store over a fake api, ad runner and billing seam —
 * the popup then drives the real store, so these cover the actual
 * watch/claim/buy transitions rather than a mocked-out imitation of them.
 */
function makeStore({
  api = {},
  outcome = 'rewarded',
  manualAd = false,
  billing = {},
}: StoreOptions = {}) {
  const applyCoinsUpdate = vi.fn()
  const full: CoinsApi = {
    claimRewardedAd: api.claimRewardedAd ?? vi.fn(async () => 125),
    rewardedAdsRemaining: api.rewardedAdsRemaining ?? vi.fn(async () => 4),
    listCoinPacks: api.listCoinPacks ?? vi.fn(async () => PACKS),
    redeemPurchase: api.redeemPurchase ?? vi.fn(async () => ({ status: 'ok' as const, coins: 700 })),
  }

  let finishAd = () => {}
  const showAd = vi.fn(async (): Promise<RewardedAdOutcome> => {
    if (!manualAd) return outcome
    await new Promise<void>((resolve) => {
      finishAd = resolve
    })
    return outcome
  })

  const billingSeam = {
    isAvailable: vi.fn(async () => billing.available ?? true),
    fetchPrices: vi.fn(async () => billing.prices ?? PRICES),
    purchase: vi.fn(
      async (): Promise<PurchaseAttempt> =>
        billing.attempt ?? { status: 'ok', purchaseToken: 'tok-1' },
    ),
    consume: vi.fn(async () => {}),
    listUnconsumed: vi.fn(async () => []),
  }

  const store = createCoinsStore({
    api: full,
    showAd,
    billing: billingSeam,
    auth: { getState: () => ({ status: authState.status }), applyCoinsUpdate },
  })
  return {
    store,
    api: full,
    showAd,
    billing: billingSeam,
    applyCoinsUpdate,
    finishAd: () => finishAd(),
  }
}

const watchButton = () => screen.getByRole('button', { name: /WATCH AD|LOADING|COME BACK/ })

beforeEach(() => {
  vi.clearAllMocks()
  authListeners.clear()
  authState = {
    status: 'signedIn',
    userId: 'u1',
    username: 'Ahsan',
    email: 'a@b.com',
    coins: 100,
    customization: defaultCustomization(),
    dailyRewardStreak: 0,
    lastDailyRewardDate: null,
    error: null,
  }
})

describe('GetCoinsPopup', () => {
  it('shows the reward on offer and how many are left today', async () => {
    const { store } = makeStore()
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    expect(screen.getByText('+25')).toBeDefined()
    await waitFor(() => expect(screen.getByText('4 of 5 left today')).toBeDefined())
  })

  it('credits the coins when an ad is watched', async () => {
    const { store, applyCoinsUpdate } = makeStore()
    render(<GetCoinsPopup onClose={() => {}} store={store} />)
    await waitFor(() => expect(screen.getByText('4 of 5 left today')).toBeDefined())

    fireEvent.click(watchButton())

    await waitFor(() => expect(applyCoinsUpdate).toHaveBeenCalledWith(125))
    await waitFor(() => expect(screen.getByText('3 of 5 left today')).toBeDefined())
  })

  it('disables the button and shows progress while the ad is in flight', async () => {
    const { store, finishAd } = makeStore({ manualAd: true })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    fireEvent.click(watchButton())

    await waitFor(() => expect(watchButton().textContent).toBe('LOADING…'))
    expect((watchButton() as HTMLButtonElement).disabled).toBe(true)

    finishAd()
    await waitFor(() => expect(watchButton().textContent).toBe('WATCH AD'))
    expect((watchButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not run a second ad while one is already in flight', async () => {
    const { store, showAd, finishAd } = makeStore({ manualAd: true })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    fireEvent.click(watchButton())
    await waitFor(() => expect(showAd).toHaveBeenCalledTimes(1))
    fireEvent.click(watchButton())

    finishAd()
    await waitFor(() => expect(watchButton().textContent).toBe('WATCH AD'))
    expect(showAd).toHaveBeenCalledTimes(1)
  })

  it('explains itself when no ad could be shown', async () => {
    const { store } = makeStore({ outcome: 'unavailable' })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    fireEvent.click(watchButton())

    await waitFor(() => expect(screen.getByText(/No ad available right now/)).toBeDefined())
  })

  it('says nothing when the player simply closed the ad', async () => {
    const { store, applyCoinsUpdate, api } = makeStore({ outcome: 'dismissed' })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    fireEvent.click(watchButton())

    await waitFor(() => expect((watchButton() as HTMLButtonElement).disabled).toBe(false))
    expect(applyCoinsUpdate).not.toHaveBeenCalled()
    expect(api.claimRewardedAd).not.toHaveBeenCalled()
    expect(screen.queryByText(/No ad available/)).toBeNull()
  })

  it('surfaces a server refusal without crediting anything', async () => {
    const { store, applyCoinsUpdate } = makeStore({
      api: { claimRewardedAd: vi.fn(async () => null) },
    })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    fireEvent.click(watchButton())

    await waitFor(() => expect(screen.getByText(/all the ad rewards for now/)).toBeDefined())
    expect(applyCoinsUpdate).not.toHaveBeenCalled()
  })

  it('stops offering ads once the daily allowance is spent', async () => {
    const { store, showAd } = makeStore({ api: { rewardedAdsRemaining: vi.fn(async () => 0) } })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    const button = await screen.findByRole('button', { name: 'COME BACK TOMORROW' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(showAd).not.toHaveBeenCalled()
  })

  it('offers the generic allowance line when the count is unknown', () => {
    const { store } = makeStore({ api: { rewardedAdsRemaining: vi.fn(async () => null) } })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    expect(screen.getByText('Up to 5 per day')).toBeDefined()
  })

  it('does not offer an ad to a signed-out player', () => {
    authState = { ...authState, status: 'signedOut' }
    const { store } = makeStore()
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    expect((watchButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('closes from the close button, the backdrop and Escape', () => {
    const onClose = vi.fn()
    const { store } = makeStore()
    render(<GetCoinsPopup onClose={onClose} store={store} />)

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('dialog', { name: 'Get coins' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('does not close when the panel itself is clicked', () => {
    const onClose = vi.fn()
    const { store } = makeStore()
    render(<GetCoinsPopup onClose={onClose} store={store} />)

    fireEvent.click(screen.getByRole('heading', { name: 'GET COINS' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('GetCoinsPopup coin packs', () => {
  it("lists each pack with its coin amount and the store's own price", async () => {
    const { store } = makeStore()
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    expect(await screen.findByRole('heading', { name: 'COIN PACKS' })).toBeDefined()
    expect(screen.getByText('500')).toBeDefined()
    expect(screen.getByText('HANDFUL OF COINS')).toBeDefined()
    expect(screen.getByRole('button', { name: '£1.99' })).toBeDefined()
    expect(screen.getByRole('button', { name: '£3.99' })).toBeDefined()
  })

  it('hides the paid section entirely when billing is unavailable', async () => {
    const { store } = makeStore({ billing: { available: false } })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    // Wait for the ad section to settle so this isn't just asserting on an
    // un-rendered first frame.
    await screen.findByText('4 of 5 left today')
    expect(screen.queryByRole('heading', { name: 'COIN PACKS' })).toBeNull()
  })

  it('does not offer a pack Play could not price', async () => {
    const { store } = makeStore({ billing: { prices: { coins_500: '£1.99' } } })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    expect(await screen.findByRole('button', { name: '£1.99' })).toBeDefined()
    expect(screen.queryByText('SACK OF COINS')).toBeNull()
  })

  it('buys the pack that was tapped and banks the new balance', async () => {
    const { store, billing, applyCoinsUpdate } = makeStore()
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    fireEvent.click(await screen.findByRole('button', { name: '£3.99' }))

    await waitFor(() => expect(billing.purchase).toHaveBeenCalledWith('coins_1200'))
    await waitFor(() => expect(applyCoinsUpdate).toHaveBeenCalledWith(700))
  })

  it('says nothing when the player backs out of the Play sheet', async () => {
    const { store, applyCoinsUpdate } = makeStore({ billing: { attempt: { status: 'cancelled' } } })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    fireEvent.click(await screen.findByRole('button', { name: '£1.99' }))

    await waitFor(() =>
      expect((screen.getByRole('button', { name: '£1.99' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    )
    expect(applyCoinsUpdate).not.toHaveBeenCalled()
    expect(screen.queryByText(/didn't go through/)).toBeNull()
  })

  it('explains a purchase the server would not verify', async () => {
    const { store } = makeStore({
      api: { redeemPurchase: vi.fn(async () => ({ status: 'not_purchased' as const, coins: 0 })) },
    })
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    fireEvent.click(await screen.findByRole('button', { name: '£1.99' }))

    await waitFor(() => expect(screen.getByText(/didn't go through/)).toBeDefined())
  })

  it('does not offer packs to a signed-out player', async () => {
    authState = { ...authState, status: 'signedOut' }
    const { store } = makeStore()
    render(<GetCoinsPopup onClose={() => {}} store={store} />)

    const buy = await screen.findByRole('button', { name: '£1.99' })
    expect((buy as HTMLButtonElement).disabled).toBe(true)
  })
})
