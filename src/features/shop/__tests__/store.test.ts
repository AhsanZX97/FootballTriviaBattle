import { describe, expect, it, vi } from 'vitest'
import { createShopStore } from '../store'
import type { CustomizationApi, PurchaseResponse } from '../../../services/customization'
import type { CustomizationSlot } from '../../../types/customization'

type ApiOverrides = Partial<CustomizationApi>

function makeDeps(overrides: ApiOverrides = {}, status = 'signedIn') {
  const applied: Array<[CustomizationSlot, string]> = []
  const coinUpdates: number[] = []
  const api: CustomizationApi = {
    setCustomization: overrides.setCustomization ?? vi.fn(async () => true),
    purchaseItem:
      overrides.purchaseItem ?? vi.fn(async (): Promise<PurchaseResponse> => ({ status: 'ok', coins: 400 })),
    listOwnedItems: overrides.listOwnedItems ?? vi.fn(async () => []),
  }
  const auth = {
    getState: () => ({ status }),
    applyCustomizationUpdate: (slot: CustomizationSlot, itemId: string) => {
      applied.push([slot, itemId])
    },
    applyCoinsUpdate: (balance: number) => {
      coinUpdates.push(balance)
    },
  }
  return { api, auth, applied, coinUpdates }
}

describe('shop store', () => {
  it('exposes the goal sound catalogue', () => {
    const store = createShopStore(makeDeps())
    const { items } = store.getState()
    expect(items.goalSound.map((i) => i.name)).toEqual([
      'goal + horn',
      'gooal',
      'GOOOOOOOOOOAL',
      'SIUUUU',
      'video game sound',
    ])
    expect(items.goalSound.every((i) => i.price === 100)).toBe(true)
  })

  it('exposes the keeper skin catalogue', () => {
    const store = createShopStore(makeDeps())
    const { items } = store.getState()
    expect(items.gkSkin.map((i) => i.name)).toEqual(['Manuel Neuer'])
    expect(items.gkSkin.every((i) => i.price === 200)).toBe(true)
  })

  it('exposes the ball skin catalogue', () => {
    const store = createShopStore(makeDeps())
    const { items } = store.getState()
    expect(items.ballSkin.map((i) => i.name)).toEqual([
      '2010 WC Ball',
      '2014 WC Ball',
      '2018 WC Ball',
      '2022 WC Ball',
      '2026 WC Ball',
    ])
    expect(items.ballSkin.every((i) => i.price === 150)).toBe(true)
  })

  it('owns nothing before the owned list loads', () => {
    const store = createShopStore(makeDeps())
    expect(store.getState().owned).toEqual([])
  })

  it('loads the owned items on refresh', async () => {
    const deps = makeDeps({ listOwnedItems: vi.fn(async () => ['siuuuu']) })
    const store = createShopStore(deps)

    await store.refresh()

    expect(store.getState().owned).toEqual(['siuuuu'])
    expect(store.isOwned('siuuuu')).toBe(true)
    expect(store.isOwned('gooal')).toBe(false)
  })

  it('leaves the owned list empty when signed out', async () => {
    const deps = makeDeps({ listOwnedItems: vi.fn(async () => ['siuuuu']) }, 'signedOut')
    const store = createShopStore(deps)

    await store.refresh()

    expect(deps.api.listOwnedItems).not.toHaveBeenCalled()
    expect(store.getState().owned).toEqual([])
  })
})

describe('shop store purchase', () => {
  it('buys an item, banks it, and updates the coin balance', async () => {
    const deps = makeDeps()
    const store = createShopStore(deps)

    const result = await store.purchase('siuuuu')

    expect(result).toBe('ok')
    expect(deps.api.purchaseItem).toHaveBeenCalledWith('siuuuu')
    expect(store.isOwned('siuuuu')).toBe(true)
    expect(deps.coinUpdates).toEqual([400])
    expect(store.getState().error).toBeNull()
  })

  it('reports insufficient coins without banking the item', async () => {
    const deps = makeDeps({
      purchaseItem: vi.fn(async (): Promise<PurchaseResponse> => ({ status: 'insufficient_coins', coins: 20 })),
    })
    const store = createShopStore(deps)

    const result = await store.purchase('siuuuu')

    expect(result).toBe('insufficient_coins')
    expect(store.isOwned('siuuuu')).toBe(false)
    expect(store.getState().error).toBe('Not enough coins.')
  })

  it('treats an already-owned item as owned rather than an error', async () => {
    const deps = makeDeps({
      purchaseItem: vi.fn(async (): Promise<PurchaseResponse> => ({ status: 'already_owned', coins: 500 })),
    })
    const store = createShopStore(deps)

    const result = await store.purchase('siuuuu')

    expect(result).toBe('already_owned')
    expect(store.isOwned('siuuuu')).toBe(true)
    expect(store.getState().error).toBeNull()
  })

  it('surfaces a failed purchase', async () => {
    const deps = makeDeps({
      purchaseItem: vi.fn(async (): Promise<PurchaseResponse> => ({ status: 'error', coins: 0 })),
    })
    const store = createShopStore(deps)

    await store.purchase('siuuuu')

    expect(store.isOwned('siuuuu')).toBe(false)
    expect(store.getState().error).toBe('Could not complete that purchase.')
    // a failed purchase must never write a bogus balance onto the profile
    expect(deps.coinUpdates).toEqual([])
  })

  it('refuses to buy while signed out without calling the api', async () => {
    const deps = makeDeps({}, 'signedOut')
    const store = createShopStore(deps)

    const result = await store.purchase('siuuuu')

    expect(result).toBe('error')
    expect(deps.api.purchaseItem).not.toHaveBeenCalled()
    expect(store.getState().error).toBe('Sign in to customize your character.')
  })

  it('does not buy the same item twice', async () => {
    const deps = makeDeps({ listOwnedItems: vi.fn(async () => ['siuuuu']) })
    const store = createShopStore(deps)
    await store.refresh()

    const result = await store.purchase('siuuuu')

    expect(result).toBe('already_owned')
    expect(deps.api.purchaseItem).not.toHaveBeenCalled()
  })

  it('tracks which item is being bought', async () => {
    let resolve: ((r: PurchaseResponse) => void) | undefined
    const deps = makeDeps({
      purchaseItem: vi.fn(() => new Promise<PurchaseResponse>((r) => (resolve = r))),
    })
    const store = createShopStore(deps)

    const pending = store.purchase('gooal')
    expect(store.getState().purchasing).toBe('gooal')

    resolve?.({ status: 'ok', coins: 100 })
    await pending
    expect(store.getState().purchasing).toBeNull()
  })
})

describe('shop store equip', () => {
  it('equips an owned item and reflects it on the profile', async () => {
    const deps = makeDeps({ listOwnedItems: vi.fn(async () => ['siuuuu']) })
    const store = createShopStore(deps)
    await store.refresh()

    await store.equip('goalSound', 'siuuuu')

    expect(deps.api.setCustomization).toHaveBeenCalledWith('goalSound', 'siuuuu')
    expect(deps.applied).toEqual([['goalSound', 'siuuuu']])
    expect(store.getState().error).toBeNull()
  })

  it('does not touch the profile when the server rejects the equip', async () => {
    const deps = makeDeps({ setCustomization: vi.fn(async () => false) })
    const store = createShopStore(deps)

    await store.equip('goalSound', 'nope')

    expect(deps.applied).toEqual([])
    expect(store.getState().error).toBe('Could not equip that item.')
  })

  it('rejects an equip while signed out without calling the api', async () => {
    const deps = makeDeps({}, 'signedOut')
    const store = createShopStore(deps)

    await store.equip('goalSound', 'siuuuu')

    expect(deps.api.setCustomization).not.toHaveBeenCalled()
    expect(deps.applied).toEqual([])
    expect(store.getState().error).toBe('Sign in to customize your character.')
  })

  it('notifies subscribers when an equip fails', async () => {
    const deps = makeDeps({ setCustomization: vi.fn(async () => false) })
    const store = createShopStore(deps)
    const listener = vi.fn()
    store.subscribe(listener)

    await store.equip('goalSound', 'nope')

    expect(listener).toHaveBeenCalled()
  })

  it('clears a previous error on the next equip attempt', async () => {
    const setCustomization = vi
      .fn<CustomizationApi['setCustomization']>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const store = createShopStore(makeDeps({ setCustomization }))

    await store.equip('goalSound', 'nope')
    expect(store.getState().error).not.toBeNull()

    await store.equip('goalSound', 'siuuuu')
    expect(store.getState().error).toBeNull()
  })
})
