import { useEffect, useState, useSyncExternalStore } from 'react'
import { shopStore } from '../store'
import type { CustomizationSlot } from '../../../types/customization'
import './ShopPopup.css'

type Props = {
  onClose: () => void
}

/** The shop's three tabs, in display order. Each maps 1:1 to a customization
 * slot on the profile, so picking a tab is picking the slot to equip. */
const TABS: Array<{ slot: CustomizationSlot; label: string; empty: string }> = [
  { slot: 'gkSkin', label: 'SKIN', empty: 'No keeper skins yet.' },
  { slot: 'ballSkin', label: 'BALL', empty: 'No ball skins yet.' },
  { slot: 'goalSound', label: 'SOUNDS', empty: 'No goal sounds yet.' },
]

/** Modal shell for the shop. Shares the FriendsPopup layout/skin so the two
 * read as one system. Every tab's catalogue is empty for now — the item grid
 * lands with the first cosmetics. */
export function ShopPopup({ onClose }: Props) {
  const [slot, setSlot] = useState<CustomizationSlot>('gkSkin')
  const shop = useSyncExternalStore(shopStore.subscribe, shopStore.getState)

  // Escape closes, matching the app's other dismissable overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const active = TABS.find((t) => t.slot === slot) ?? TABS[0]
  const items = shop.items[slot]

  return (
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
              onClick={() => setSlot(tab.slot)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="shop-popup__body">
          {shop.error && <p className="shop-popup__error">{shop.error}</p>}
          {items.length === 0 ? (
            <p className="shop-popup__empty">{active.empty}</p>
          ) : (
            <ul className="shop-popup__grid">
              {items.map((item) => (
                <li key={item.id} className="shop-popup__item">
                  {item.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
