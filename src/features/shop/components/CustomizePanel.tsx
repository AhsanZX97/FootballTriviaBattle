import { useEffect, useState, useSyncExternalStore } from 'react'
import { shopStore, type ShopStore } from '../store'
import { authStore } from '../../auth/store'
import {
  DEFAULT_ITEM_ID,
  type CustomizationSlot,
  type ShopItem,
} from '../../../types/customization'
import { previewGoalSound, stopPreview } from '../../../services/sound'
import { BALL_SKIN_SOURCES } from '../../../services/shopCatalogue'
import { ShopItemList } from './ShopItemList'
import './CustomizePanel.css'

type Props = {
  /** Defaults to the real singleton; tests inject a fake. */
  store?: ShopStore
}

const TABS: Array<{ slot: CustomizationSlot; label: string; empty: string }> = [
  { slot: 'gkSkin', label: 'SKIN', empty: 'No keeper skins owned yet.' },
  { slot: 'ballSkin', label: 'BALL', empty: 'No ball skins owned yet.' },
  { slot: 'goalSound', label: 'SOUNDS', empty: 'No goal sounds owned yet.' },
]

/** The stock look/sound for a slot, shown as a row so it can be equipped back.
 * It isn't a catalogue item — every profile starts on it and the DB exempts it
 * from the ownership check — so it's synthesised here rather than sold. */
const defaultRow = (slot: CustomizationSlot): ShopItem => ({
  id: DEFAULT_ITEM_ID,
  name: 'DEFAULT',
  slot,
  price: 0,
})

/** The Customize tab of the player's account popup: what you own, per slot,
 * with the equipped one marked. Buying happens in the shop; this only equips. */
export function CustomizePanel({ store = shopStore }: Props) {
  const [slot, setSlot] = useState<CustomizationSlot>('gkSkin')
  const shop = useSyncExternalStore(store.subscribe, store.getState)
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)

  useEffect(() => {
    void store.refresh()
  }, [store])

  // Never leave a preview playing behind a closed popup.
  useEffect(() => stopPreview, [])

  const active = TABS.find((t) => t.slot === slot) ?? TABS[0]
  const equippedId = auth.customization[slot]
  const owned = shop.items[slot].filter((item) => shop.owned.includes(item.id))
  // DEFAULT always leads the list — it's the way back to the stock look.
  const rows = [defaultRow(slot), ...owned]

  return (
    <div className="customize">
      <div className="customize__tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.slot}
            type="button"
            role="tab"
            aria-selected={slot === tab.slot}
            className={`customize__tab${slot === tab.slot ? ' is-active' : ''}`}
            onClick={() => {
              stopPreview()
              setSlot(tab.slot)
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {shop.error && <p className="customize__error">{shop.error}</p>}

      <ShopItemList
        items={rows}
        owned={rows.map((r) => r.id)}
        equippedId={equippedId}
        onPreview={slot === 'goalSound' ? (item) => previewGoalSound(item.id) : undefined}
        iconFor={slot === 'ballSkin' ? (item) => BALL_SKIN_SOURCES[item.id]?.thumb : undefined}
        onEquip={(item) => void store.equip(slot, item.id)}
        busy={shop.equipping}
      />

      {owned.length === 0 && <p className="customize__empty">{active.empty}</p>}
    </div>
  )
}
