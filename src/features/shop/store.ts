import type { CustomizationSlot, ShopItem } from '../../types/customization'
import { customizationApi, type CustomizationApi } from '../../services/customization'
import { authStore } from '../auth/store'

export interface ShopState {
  /** The catalogue, per slot. Empty until the first cosmetics ship — the shop
   * tabs render their empty state off these. */
  items: Record<CustomizationSlot, ShopItem[]>
  /** True while an equip is in flight, so the UI can disable the tiles. */
  equipping: boolean
  /** Surfaced when an equip fails; cleared on the next attempt. */
  error: string | null
}

/** Minimal slice of the auth store this store needs. Injected so tests can
 * drive it without the real singleton (same seam as the friends store). */
export interface ShopAuthSeam {
  getState(): { status: string }
  applyCustomizationUpdate(slot: CustomizationSlot, itemId: string): void
}

type Listener = () => void

const SIGNED_OUT_ERROR = 'Sign in to customize your character.'
const EQUIP_FAILED_ERROR = 'Could not equip that item.'

const emptyState = (): ShopState => ({
  items: { gkSkin: [], ballSkin: [], goalSound: [] },
  equipping: false,
  error: null,
})

/** Exported for tests, which inject a fake api and auth seam; the app uses the
 * `shopStore` singleton. */
export function createShopStore(deps: { api?: CustomizationApi; auth?: ShopAuthSeam } = {}) {
  const api = deps.api ?? customizationApi
  const auth = deps.auth ?? (authStore as unknown as ShopAuthSeam)

  let state: ShopState = emptyState()
  const listeners = new Set<Listener>()

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const set = (patch: Partial<ShopState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  /** Equip `itemId` in `slot`. The server is the source of truth: the profile
   * only reflects the change once the RPC confirms it, so a rejected equip
   * can't leave the UI showing something the DB doesn't have. */
  async function equip(slot: CustomizationSlot, itemId: string): Promise<boolean> {
    if (auth.getState().status !== 'signedIn') {
      set({ error: SIGNED_OUT_ERROR })
      return false
    }
    set({ equipping: true, error: null })
    const ok = await api.setCustomization(slot, itemId)
    if (ok) auth.applyCustomizationUpdate(slot, itemId)
    set({ equipping: false, error: ok ? null : EQUIP_FAILED_ERROR })
    return ok
  }

  function clearError(): void {
    set({ error: null })
  }

  return { getState, subscribe, equip, clearError }
}

export type ShopStore = ReturnType<typeof createShopStore>

export const shopStore = createShopStore()
