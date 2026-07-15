import { describe, expect, it, vi } from 'vitest'
import { createShopStore } from '../store'
import type { CustomizationApi } from '../../../services/customization'
import type { CustomizationSlot } from '../../../types/customization'

function makeDeps(overrides: { setCustomization?: CustomizationApi['setCustomization'] } = {}) {
  const applied: Array<[CustomizationSlot, string]> = []
  const api: CustomizationApi = {
    setCustomization: overrides.setCustomization ?? vi.fn(async () => true),
  }
  const auth = {
    getState: () => ({ status: 'signedIn' }),
    applyCustomizationUpdate: (slot: CustomizationSlot, itemId: string) => {
      applied.push([slot, itemId])
    },
  }
  return { api, auth, applied }
}

describe('shop store', () => {
  it('starts with an empty catalogue for every slot', () => {
    const store = createShopStore(makeDeps())
    const { items } = store.getState()
    expect(items.gkSkin).toEqual([])
    expect(items.ballSkin).toEqual([])
    expect(items.goalSound).toEqual([])
  })

  it('equips an item and reflects it on the profile', async () => {
    const deps = makeDeps()
    const store = createShopStore(deps)

    await store.equip('ballSkin', 'retro_ball')

    expect(deps.api.setCustomization).toHaveBeenCalledWith('ballSkin', 'retro_ball')
    expect(deps.applied).toEqual([['ballSkin', 'retro_ball']])
    expect(store.getState().error).toBeNull()
  })

  it('does not touch the profile when the server rejects the equip', async () => {
    const deps = makeDeps({ setCustomization: vi.fn(async () => false) })
    const store = createShopStore(deps)

    await store.equip('gkSkin', 'nope')

    expect(deps.applied).toEqual([])
    expect(store.getState().error).toBe('Could not equip that item.')
  })

  it('rejects an equip while signed out without calling the api', async () => {
    const deps = makeDeps()
    deps.auth.getState = () => ({ status: 'signedOut' })
    const store = createShopStore(deps)

    await store.equip('goalSound', 'anthem')

    expect(deps.api.setCustomization).not.toHaveBeenCalled()
    expect(deps.applied).toEqual([])
    expect(store.getState().error).toBe('Sign in to customize your character.')
  })

  it('notifies subscribers when an equip fails', async () => {
    const deps = makeDeps({ setCustomization: vi.fn(async () => false) })
    const store = createShopStore(deps)
    const listener = vi.fn()
    store.subscribe(listener)

    await store.equip('gkSkin', 'nope')

    expect(listener).toHaveBeenCalled()
  })

  it('clears a previous error on the next equip attempt', async () => {
    const setCustomization = vi
      .fn<CustomizationApi['setCustomization']>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const store = createShopStore(makeDeps({ setCustomization }))

    await store.equip('gkSkin', 'nope')
    expect(store.getState().error).not.toBeNull()

    await store.equip('gkSkin', 'keeper_gold')
    expect(store.getState().error).toBeNull()
  })
})
