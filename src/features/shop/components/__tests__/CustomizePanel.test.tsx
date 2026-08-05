import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
import { CustomizePanel } from '../CustomizePanel'

/** Own store per test over a fake api — the singleton would leak `owned`. */
function makeStore(api: Partial<CustomizationApi> = {}) {
  const full: CustomizationApi = {
    setCustomization: api.setCustomization ?? vi.fn(async () => true),
    purchaseItem:
      api.purchaseItem ?? vi.fn(async (): Promise<PurchaseResponse> => ({ status: 'ok', coins: 0 })),
    listOwnedItems: api.listOwnedItems ?? vi.fn(async () => []),
  }
  const store = createShopStore({
    api: full,
    auth: {
      getState: () => ({ status: authState.status }),
      applyCustomizationUpdate: (slot, itemId) => {
        authState = { ...authState, customization: { ...authState.customization, [slot]: itemId } }
        authListeners.forEach((l) => l())
      },
      applyCoinsUpdate: vi.fn(),
    },
  })
  return { store, api: full }
}

/** The EQUIP button on a named row. Scoped to the row rather than picked out of
 * the list by index, which shifts as rows swap their button for an EQUIPPED tag. */
function equipButtonFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li')
  if (!row) throw new Error(`no row for "${name}"`)
  return within(row).getByRole('button', { name: 'EQUIP' })
}

/** Render on the SOUNDS sub-tab with the owned-items load settled. */
async function renderSounds(api: Partial<CustomizationApi> = {}) {
  const made = makeStore(api)
  render(<CustomizePanel store={made.store} />)
  await waitFor(() => expect(made.api.listOwnedItems).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('tab', { name: 'SOUNDS' }))
  return made
}

/** Render on the BALL sub-tab with the owned-items load settled. */
async function renderBalls(api: Partial<CustomizationApi> = {}) {
  const made = makeStore(api)
  render(<CustomizePanel store={made.store} />)
  await waitFor(() => expect(made.api.listOwnedItems).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('tab', { name: 'BALL' }))
  return made
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
    dailyRewardStreak: 0,
    lastDailyRewardDate: null,
    error: null,
  }
})

describe('CustomizePanel tabs', () => {
  it('renders a sub-tab for each customization slot', () => {
    render(<CustomizePanel store={makeStore().store} />)
    expect(screen.getByRole('tab', { name: 'SKIN' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'BALL' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'SOUNDS' })).toBeDefined()
  })

  it('tells you when you own nothing in a slot', async () => {
    await renderSounds()
    expect(screen.getByText(/no goal sounds owned yet/i)).toBeDefined()
  })
})

describe('CustomizePanel owned items', () => {
  it('lists only what you own, never the rest of the catalogue', async () => {
    await renderSounds({ listOwnedItems: vi.fn(async () => ['celebration_yell']) })
    await screen.findByText('Celebration Yell')
    expect(screen.queryByText('GOOOOOOOOOOAL')).toBeNull()
    expect(screen.queryByText('gooal')).toBeNull()
  })

  it('marks the equipped item and offers no equip button for it', async () => {
    authState = { ...authState, customization: { ...defaultCustomization(), goalSound: 'celebration_yell' } }
    await renderSounds({ listOwnedItems: vi.fn(async () => ['celebration_yell']) })
    await screen.findByText('Celebration Yell')

    // one EQUIPPED tag (Celebration Yell), and DEFAULT keeps its equip button
    expect(screen.getAllByText('EQUIPPED')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'EQUIP' })).toHaveLength(1)
  })

  it('equips an owned item', async () => {
    const { api } = await renderSounds({ listOwnedItems: vi.fn(async () => ['celebration_yell']) })
    await screen.findByText('Celebration Yell')

    fireEvent.click(equipButtonFor('Celebration Yell'))

    await waitFor(() => expect(api.setCustomization).toHaveBeenCalledWith('goalSound', 'celebration_yell'))
    // the equipped marker moves off DEFAULT and onto Celebration Yell
    await waitFor(() =>
      expect(within(screen.getByText('Celebration Yell').closest('li')!).getByText('EQUIPPED')).toBeDefined(),
    )
  })

  it('surfaces a failed equip', async () => {
    await renderSounds({
      listOwnedItems: vi.fn(async () => ['celebration_yell']),
      setCustomization: vi.fn(async () => false),
    })
    await screen.findByText('Celebration Yell')

    fireEvent.click(equipButtonFor('Celebration Yell'))

    expect(await screen.findByText(/could not equip that item/i)).toBeDefined()
  })
})

describe('CustomizePanel default row', () => {
  it('always offers DEFAULT so the stock sound can be equipped back', async () => {
    authState = { ...authState, customization: { ...defaultCustomization(), goalSound: 'celebration_yell' } }
    const { api } = await renderSounds({ listOwnedItems: vi.fn(async () => ['celebration_yell']) })
    await screen.findByText('Celebration Yell')

    fireEvent.click(equipButtonFor('DEFAULT'))

    await waitFor(() => expect(api.setCustomization).toHaveBeenCalledWith('goalSound', 'default'))
  })

  it('shows DEFAULT as equipped on a fresh profile', async () => {
    await renderSounds()
    expect(screen.getByText('DEFAULT')).toBeDefined()
    expect(screen.getByText('EQUIPPED')).toBeDefined()
  })
})

describe('CustomizePanel ball skins', () => {
  it('lists an owned ball skin with a thumbnail and equips it', async () => {
    const { api } = await renderBalls({ listOwnedItems: vi.fn(async () => ['ball_gold_trim']) })
    await screen.findByText('Gold Trim Ball')

    const row = screen.getByText('Gold Trim Ball').closest('li')
    expect(row?.querySelector('img')).not.toBeNull()

    fireEvent.click(equipButtonFor('Gold Trim Ball'))

    await waitFor(() => expect(api.setCustomization).toHaveBeenCalledWith('ballSkin', 'ball_gold_trim'))
  })
})

describe('CustomizePanel keeper skins', () => {
  it('lists an owned keeper skin with a thumbnail and equips it', async () => {
    const made = makeStore({ listOwnedItems: vi.fn(async () => ['gk_green_wall']) })
    render(<CustomizePanel store={made.store} />)
    await waitFor(() => expect(made.api.listOwnedItems).toHaveBeenCalled())
    // SKIN is the opening tab, so no need to switch to it.
    await screen.findByText('Green Wall Keeper')

    const row = screen.getByText('Green Wall Keeper').closest('li')
    expect(row?.querySelector('img')).not.toBeNull()

    fireEvent.click(equipButtonFor('Green Wall Keeper'))

    await waitFor(() =>
      expect(made.api.setCustomization).toHaveBeenCalledWith('gkSkin', 'gk_green_wall'),
    )
  })
})

describe('CustomizePanel preview', () => {
  it('previews an owned sound', async () => {
    await renderSounds({ listOwnedItems: vi.fn(async () => ['celebration_yell']) })
    await screen.findByText('Celebration Yell')

    fireEvent.click(screen.getByRole('button', { name: 'Preview Celebration Yell' }))
    expect(previewGoalSound).toHaveBeenCalledWith('celebration_yell')
  })

  it('offers no preview on the visual slots', async () => {
    const made = makeStore({ listOwnedItems: vi.fn(async () => ['celebration_yell']) })
    render(<CustomizePanel store={made.store} />)
    await waitFor(() => expect(made.api.listOwnedItems).toHaveBeenCalled())

    // SKIN is the opening tab
    expect(screen.queryByRole('button', { name: /^Preview/ })).toBeNull()
  })

  it('stops a running preview when the slot changes', async () => {
    await renderSounds()
    fireEvent.click(screen.getByRole('tab', { name: 'BALL' }))
    expect(stopPreview).toHaveBeenCalled()
  })
})
