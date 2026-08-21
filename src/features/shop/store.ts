import type { CustomizationSlot, PurchaseResult, ShopItem } from '../../types/customization'
import { customizationApi, type CustomizationApi } from '../../services/customization'
import { catalogueFor } from '../../services/shopCatalogue'
import { authStore } from '../auth/store'
import { localProgressStore } from '../progress/store'
import { t } from '../../services/i18n/store'

export interface ShopState {
  /** The catalogue, per slot. Static (it ships with the bundle) — only `owned`
   * and the in-flight flags actually change. */
  items: Record<CustomizationSlot, ShopItem[]>
  /** Ids the player has bought. Loaded on open; added to on a purchase. */
  owned: string[]
  status: 'idle' | 'loading' | 'loaded'
  /** Id of the item currently being bought, so its tile can show progress. */
  purchasing: string | null
  /** True while an equip is in flight, so the UI can disable the tiles. */
  equipping: boolean
  /** Surfaced when a purchase or equip fails; cleared on the next attempt. */
  error: string | null
}

/** Minimal slice of the auth store this store needs. Injected so tests can
 * drive it without the real singleton (same seam as the friends store). */
export interface ShopAuthSeam {
  getState(): { status: string }
  applyCustomizationUpdate(slot: CustomizationSlot, itemId: string): void
  applyCoinsUpdate(balance: number): void
}

/** The on-device shop a signed-out player uses. Injected for tests. */
export interface ShopProgressSeam {
  getState(): { coins: number; pendingPurchases: { id: string }[] }
  owns(itemId: string): boolean
  purchaseItem(itemId: string, price: number): boolean
  equip(slot: CustomizationSlot, itemId: string): boolean
}

type Listener = () => void

const EQUIP_FAILED_ERROR = () => t('shop.error.equipFailed')
const PURCHASE_FAILED_ERROR = () => t('shop.error.purchaseFailed')
const INSUFFICIENT_COINS_ERROR = () => t('shop.error.insufficient')

const emptyState = (): ShopState => ({
  items: {
    gkSkin: catalogueFor('gkSkin'),
    ballSkin: catalogueFor('ballSkin'),
    goalSound: catalogueFor('goalSound'),
  },
  owned: [],
  status: 'idle',
  purchasing: null,
  equipping: false,
  error: null,
})

/** Exported for tests, which inject a fake api and auth seam; the app uses the
 * `shopStore` singleton. */
export function createShopStore(
  deps: { api?: CustomizationApi; auth?: ShopAuthSeam; progress?: ShopProgressSeam } = {},
) {
  const api = deps.api ?? customizationApi
  const auth = deps.auth ?? (authStore as unknown as ShopAuthSeam)
  const progress = deps.progress ?? (localProgressStore as unknown as ShopProgressSeam)

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

  const signedIn = () => auth.getState().status === 'signedIn'
  const isOwned = (itemId: string) => state.owned.includes(itemId)

  /** Catalogue price, or null for an id that isn't sold. Display-only prices,
   * same as everywhere else — the server charges its own when it re-buys. */
  function priceOf(itemId: string): number | null {
    for (const slotItems of Object.values(state.items)) {
      const found = slotItems.find((i) => i.id === itemId)
      if (found) return found.price
    }
    return null
  }

  /** Load what the player already owns. Fire-and-forget on shop open, so a
   * network failure leaves the catalogue browsable rather than crashing. */
  async function refresh(): Promise<void> {
    if (!signedIn()) {
      // Signed out the "owned" list is whatever was bought on-device, so the
      // Customize tab has something real to show before an account exists.
      set({ owned: progress.getState().pendingPurchases.map((p) => p.id), status: 'loaded' })
      return
    }
    set({ status: state.status === 'loaded' ? 'loaded' : 'loading' })
    try {
      set({ owned: await api.listOwnedItems(), status: 'loaded' })
    } catch (err) {
      console.error('[shop] refresh failed', err)
      set({ status: 'loaded' })
    }
  }

  /**
   * Buy an item with coins. The server owns the price and the debit; this only
   * banks the result — so a rejected purchase can never leave the UI showing an
   * item the player wasn't actually charged for.
   */
  async function purchase(itemId: string): Promise<PurchaseResult> {
    if (isOwned(itemId)) return 'already_owned'

    // Signed out: buy with on-device coins. The purchase is provisional — the
    // server re-charges it at sign-in (see localProgressStore.syncPurchases) —
    // but the player gets the item now, which is the whole point.
    if (!signedIn()) {
      const price = priceOf(itemId)
      if (price === null) return 'not_found'
      if (!progress.purchaseItem(itemId, price)) {
        set({ error: INSUFFICIENT_COINS_ERROR() })
        return 'insufficient_coins'
      }
      set({ owned: [...state.owned, itemId], error: null })
      return 'ok'
    }

    set({ purchasing: itemId, error: null })
    const { status, coins } = await api.purchaseItem(itemId)

    if (status === 'ok') {
      auth.applyCoinsUpdate(coins)
      set({ owned: [...state.owned, itemId], purchasing: null })
      return status
    }
    if (status === 'already_owned') {
      // The DB knows better than our cached list — bank it rather than nag.
      set({ owned: [...state.owned, itemId], purchasing: null })
      return status
    }
    set({
      purchasing: null,
      error: status === 'insufficient_coins' ? INSUFFICIENT_COINS_ERROR() : PURCHASE_FAILED_ERROR(),
    })
    return status
  }

  /** Equip `itemId` in `slot`. The server is the source of truth: the profile
   * only reflects the change once the RPC confirms it. */
  async function equip(slot: CustomizationSlot, itemId: string): Promise<boolean> {
    // Signed out this is purely local and instant; the chosen look is applied
    // to the profile at sign-in for whichever slots survived the re-charge.
    if (!signedIn()) {
      const ok = progress.equip(slot, itemId)
      set({ error: ok ? null : EQUIP_FAILED_ERROR() })
      return ok
    }
    set({ equipping: true, error: null })
    const ok = await api.setCustomization(slot, itemId)
    if (ok) auth.applyCustomizationUpdate(slot, itemId)
    set({ equipping: false, error: ok ? null : EQUIP_FAILED_ERROR() })
    return ok
  }

  function clearError(): void {
    set({ error: null })
  }

  return { getState, subscribe, isOwned, refresh, purchase, equip, clearError }
}

export type ShopStore = ReturnType<typeof createShopStore>

export const shopStore = createShopStore()
