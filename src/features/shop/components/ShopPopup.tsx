import { useEffect, useState, useSyncExternalStore } from 'react'
import { shopStore, type ShopStore } from '../store'
import { authStore } from '../../auth/store'
import type { CustomizationSlot, ShopItem } from '../../../types/customization'
import { previewGoalSound, stopPreview } from '../../../services/sound'
import { BALL_SKIN_SOURCES } from '../../../services/shopCatalogue'
import { ShopItemList } from './ShopItemList'
import { ShopConfirm } from './ShopConfirm'
import './ShopPopup.css'

type Props = {
  onClose: () => void
  /** Defaults to the real singleton; tests inject a fake. */
  store?: ShopStore
}

/** The shop's three tabs, in display order. Each maps 1:1 to a customization
 * slot on the profile, so picking a tab is picking the slot to equip. */
const TABS: Array<{ slot: CustomizationSlot; label: string; empty: string }> = [
  { slot: 'gkSkin', label: 'SKIN', empty: 'No keeper skins yet.' },
  { slot: 'ballSkin', label: 'BALL', empty: 'No ball skins yet.' },
  { slot: 'goalSound', label: 'SOUNDS', empty: 'No goal sounds yet.' },
]

/** Modal shell for the shop. Shares the FriendsPopup layout/skin so the two
 * read as one system. Tapping an item opens a buy (or equip) confirmation. */
export function ShopPopup({ onClose, store = shopStore }: Props) {
  const [slot, setSlot] = useState<CustomizationSlot>('gkSkin')
  const [selected, setSelected] = useState<ShopItem | null>(null)
  const shop = useSyncExternalStore(store.subscribe, store.getState)
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)

  // Load what the player already owns whenever the shop opens.
  useEffect(() => {
    void store.refresh()
  }, [store])

  // Never leave a preview playing behind a closed shop.
  useEffect(() => stopPreview, [])

  // Escape closes, matching the app's other dismissable overlays. The confirm
  // popup handles its own Escape, so it takes priority while open.
  useEffect(() => {
    if (selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, selected])

  const active = TABS.find((t) => t.slot === slot) ?? TABS[0]
  const items = shop.items[slot]
  const equippedId = auth.customization[slot]

  const closeConfirm = () => {
    setSelected(null)
    store.clearError()
  }

  const onBuy = async () => {
    if (!selected) return
    // Success flips this same popup to its equip state — the store's `owned`
    // list drives the mode, so there's nothing to set here.
    await store.purchase(selected.id)
  }

  const onEquip = async () => {
    if (!selected) return
    const ok = await store.equip(slot, selected.id)
    if (ok) closeConfirm()
  }

  const ownsSelected = selected !== null && shop.owned.includes(selected.id)

  return (
    // The confirm popup is a sibling of the backdrop, not a child: nested inside
    // it, a click on the confirm's own backdrop would bubble into this one's
    // onClick and close the whole shop behind it.
    <>
      <div className="shop-popup" role="dialog" aria-modal="true" aria-label="Shop" onClick={onClose}>
        <div className="shop-popup__panel" onClick={(e) => e.stopPropagation()}>
          <div className="shop-popup__head">
            <h2 className="shop-popup__title">SHOP</h2>
            <button type="button" className="shop-popup__close" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="shop-popup__tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.slot}
                type="button"
                role="tab"
                aria-selected={slot === tab.slot}
                className={`shop-popup__tab${slot === tab.slot ? ' is-active' : ''}`}
                onClick={() => {
                  stopPreview()
                  setSlot(tab.slot)
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="shop-popup__body">
            {/* The store's error shows inside the confirm popup while one is open. */}
            {shop.error && !selected && <p className="shop-popup__error">{shop.error}</p>}
            {items.length === 0 ? (
              <p className="shop-popup__empty">{active.empty}</p>
            ) : (
              <ShopItemList
                items={items}
                owned={shop.owned}
                equippedId={equippedId}
                onPreview={slot === 'goalSound' ? (item) => previewGoalSound(item.id) : undefined}
                iconFor={slot === 'ballSkin' ? (item) => BALL_SKIN_SOURCES[item.id]?.thumb : undefined}
                onSelect={(item) => {
                  store.clearError()
                  setSelected(item)
                }}
              />
            )}
          </div>
        </div>
      </div>

      {selected && (
        <ShopConfirm
          item={selected}
          mode={ownsSelected ? 'owned' : 'buy'}
          busy={shop.purchasing === selected.id || shop.equipping}
          error={shop.error}
          equipped={equippedId === selected.id}
          onBuy={() => void onBuy()}
          onEquip={() => void onEquip()}
          onCancel={closeConfirm}
        />
      )}
    </>
  )
}
