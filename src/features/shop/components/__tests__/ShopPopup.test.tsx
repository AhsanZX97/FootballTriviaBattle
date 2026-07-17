import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AuthState } from '../../../../types/auth'
import { defaultCustomization } from '../../../../types/customization'
import type { CustomizationApi, PurchaseResponse } from '../../../../services/customization'

const previewGoalSound = vi.fn()
const stopPreview = vi.fn()
vi.mock('../../../../services/sound', () => ({
  previewGoalSound: (id: string) => previewGoalSound(id),
  stopPreview: () => stopPreview(),
}))

let authState: AuthState
const authListeners = new Set<() => void>()
const applyCoinsUpdate = vi.fn()
vi.mock('../../../auth/store', () => ({
  authStore: {
    getState: () => authState,
    subscribe: (l: () => void) => {
      authListeners.add(l)
      return () => void authListeners.delete(l)
    },
  },
}))

import { createShopStore } from '../../store'
import { ShopPopup } from '../ShopPopup'

/**
 * Each test gets its own store over a fake api — the popup then drives the real
 * store, so these cover the actual purchase/equip transitions rather than a
 * mocked-out imitation of them. (The singleton would leak `owned` between tests.)
 */
function makeStore(api: Partial<CustomizationApi> = {}) {
  const applyCustomizationUpdate = (slot: string, itemId: string) => {
    authState = { ...authState, customization: { ...authState.customization, [slot]: itemId } }
    authListeners.forEach((l) => l())
  }
  const full: CustomizationApi = {
    setCustomization: api.setCustomization ?? vi.fn(async () => true),
    purchaseItem:
      api.purchaseItem ?? vi.fn(async (): Promise<PurchaseResponse> => ({ status: 'ok', coins: 400 })),
    listOwnedItems: api.listOwnedItems ?? vi.fn(async () => []),
  }
  const store = createShopStore({
    api: full,
    auth: {
      getState: () => ({ status: authState.status }),
      applyCustomizationUpdate,
      applyCoinsUpdate,
    },
  })
  return { store, api: full }
}

/** Render on the SOUNDS tab with the owned-items load settled. */
async function renderSounds(api: Partial<CustomizationApi> = {}) {
  const { store, api: full } = makeStore(api)
  render(<ShopPopup onClose={() => {}} store={store} />)
  fireEvent.click(screen.getByRole('tab', { name: 'SOUNDS' }))
  await waitFor(() => expect(full.listOwnedItems).toHaveBeenCalled())
  return { store, api: full }
}

beforeEach(() => {
  vi.clearAllMocks()
  authListeners.clear()
  authState = {
    status: 'signedIn',
    userId: 'u1',
    username: 'Ahsan',
    email: 'a@b.com',
    coins: 500,
    customization: defaultCustomization(),
    error: null,
  }
})

describe('ShopPopup tabs', () => {
  it('renders a tab for each customization slot', () => {
    render(<ShopPopup onClose={() => {}} store={makeStore().store} />)
    expect(screen.getByRole('tab', { name: 'SKIN' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'BALL' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'SOUNDS' })).toBeDefined()
  })

  it('shows the empty state for the slots with no items yet', () => {
    render(<ShopPopup onClose={() => {}} store={makeStore().store} />)
    expect(screen.getByText(/no keeper skins yet/i)).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: 'BALL' }))
    expect(screen.getByText(/no ball skins yet/i)).toBeDefined()
  })

  it('lists the five goal sounds with their price', async () => {
    await renderSounds()
    for (const name of ['goal + horn', 'gooal', 'GOOOOOOOOOOAL', 'SIUUUU', 'video game sound']) {
      expect(screen.getByRole('button', { name })).toBeDefined()
    }
    expect(screen.getAllByText('100')).toHaveLength(5)
  })

  it('calls onClose from the close button', () => {
    const onClose = vi.fn()
    render(<ShopPopup onClose={onClose} store={makeStore().store} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<ShopPopup onClose={onClose} store={makeStore().store} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ShopPopup preview', () => {
  it('previews a sound from its audio button without opening the confirm', async () => {
    await renderSounds()
    fireEvent.click(screen.getByRole('button', { name: 'Preview SIUUUU' }))
    expect(previewGoalSound).toHaveBeenCalledWith('siuuuu')
    expect(screen.queryByRole('dialog', { name: /confirm purchase/i })).toBeNull()
  })
})

describe('ShopPopup buy flow', () => {
  it('opens a buy confirmation when an unowned sound is picked', async () => {
    await renderSounds()
    fireEvent.click(screen.getByRole('button', { name: 'SIUUUU' }))

    expect(screen.getByRole('dialog', { name: /confirm purchase/i })).toBeDefined()
    expect(screen.getByRole('button', { name: 'BUY' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'CANCEL' })).toBeDefined()
  })

  it('cancel closes the confirmation without buying', async () => {
    const { api } = await renderSounds()
    fireEvent.click(screen.getByRole('button', { name: 'SIUUUU' }))
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }))

    expect(screen.queryByRole('dialog', { name: /confirm purchase/i })).toBeNull()
    expect(api.purchaseItem).not.toHaveBeenCalled()
  })

  it('buying charges the item and offers to equip it', async () => {
    const { api } = await renderSounds()
    fireEvent.click(screen.getByRole('button', { name: 'SIUUUU' }))
    fireEvent.click(screen.getByRole('button', { name: 'BUY' }))

    await waitFor(() => expect(api.purchaseItem).toHaveBeenCalledWith('siuuuu'))
    expect(applyCoinsUpdate).toHaveBeenCalledWith(400)
    expect(await screen.findByRole('button', { name: 'EQUIP' })).toBeDefined()
    expect(screen.getByText('PURCHASED')).toBeDefined()
  })

  it('equipping applies the item and closes the confirmation', async () => {
    const { api } = await renderSounds()
    fireEvent.click(screen.getByRole('button', { name: 'SIUUUU' }))
    fireEvent.click(screen.getByRole('button', { name: 'BUY' }))
    fireEvent.click(await screen.findByRole('button', { name: 'EQUIP' }))

    await waitFor(() => expect(api.setCustomization).toHaveBeenCalledWith('goalSound', 'siuuuu'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'EQUIP' })).toBeNull())
  })

  it('surfaces a rejected purchase in the confirmation', async () => {
    await renderSounds({
      purchaseItem: vi.fn(async () => ({ status: 'insufficient_coins' as const, coins: 20 })),
    })
    fireEvent.click(screen.getByRole('button', { name: 'SIUUUU' }))
    fireEvent.click(screen.getByRole('button', { name: 'BUY' }))

    expect(await screen.findByText(/not enough coins/i)).toBeDefined()
    // still on the buy step — nothing was granted
    expect(screen.getByRole('button', { name: 'BUY' })).toBeDefined()
  })
})

describe('ShopPopup owned items', () => {
  it('marks an owned sound and skips the buy step', async () => {
    await renderSounds({ listOwnedItems: vi.fn(async () => ['siuuuu']) })
    await screen.findByText('OWNED')

    fireEvent.click(screen.getByRole('button', { name: 'SIUUUU' }))

    expect(screen.getByRole('dialog', { name: /equip item/i })).toBeDefined()
    expect(screen.getByRole('button', { name: 'EQUIP' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'BUY' })).toBeNull()
  })

  it('marks the equipped sound and offers no second equip', async () => {
    authState = { ...authState, customization: { ...defaultCustomization(), goalSound: 'siuuuu' } }
    await renderSounds({ listOwnedItems: vi.fn(async () => ['siuuuu']) })
    await screen.findByText('EQUIPPED')

    fireEvent.click(screen.getByRole('button', { name: 'SIUUUU' }))
    expect(screen.getByRole('button', { name: 'EQUIPPED' }).hasAttribute('disabled')).toBe(true)
  })
})
