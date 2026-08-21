import { useEffect, useState, useSyncExternalStore } from 'react'
import { shopStore, type ShopStore } from '../store'
import { authStore } from '../../auth/store'
import { localProgressStore } from '../../progress/store'
import {
  DEFAULT_ITEM_ID,
  type CustomizationSlot,
  type ShopItem,
} from '../../../types/customization'
import { previewGoalSound, stopPreview } from '../../../services/sound'
import { BALL_SKIN_SOURCES, GK_SKIN_SOURCES } from '../../../services/shopCatalogue'
import { ShopItemList } from './ShopItemList'
import './CustomizePanel.css'
import { t, useT } from '../../../services/i18n/store'

type Props = {
  /** Defaults to the real singleton; tests inject a fake. */
  store?: ShopStore
}

const TAB_SLOTS: CustomizationSlot[] = ['gkSkin', 'ballSkin', 'goalSound']

/** The stock look/sound for a slot, shown as a row so it can be equipped back.
 * It isn't a catalogue item — every profile starts on it and the DB exempts it
 * from the ownership check — so it's synthesised here rather than sold. */
const defaultRow = (slot: CustomizationSlot): ShopItem => ({
  id: DEFAULT_ITEM_ID,
  name: t('customize.default'),
  slot,
  price: 0,
})

/** The Customize tab of the player's account popup: what you own, per slot,
 * with the equipped one marked. Buying happens in the shop; this only equips. */
export function CustomizePanel({ store = shopStore }: Props) {
  const t = useT()
  const [slot, setSlot] = useState<CustomizationSlot>('gkSkin')
  const shop = useSyncExternalStore(store.subscribe, store.getState)
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const local = useSyncExternalStore(localProgressStore.subscribe, localProgressStore.getState)

  useEffect(() => {
    void store.refresh()
  }, [store])

  // Never leave a preview playing behind a closed popup.
  useEffect(() => stopPreview, [])

  // Signed out the equipped look lives on-device; it is applied to the profile
  // at sign-in for whichever slots survive the server's re-charge.
  const equippedId =
    auth.status === 'signedIn' ? auth.customization[slot] : local.customization[slot]
  const owned = shop.items[slot].filter((item) => shop.owned.includes(item.id))
  // DEFAULT always leads the list — it's the way back to the stock look.
  const rows = [defaultRow(slot), ...owned]

  return (
    <div className="customize">
      <div className="customize__tabs" role="tablist">
        {TAB_SLOTS.map((tabSlot) => (
          <button
            key={tabSlot}
            type="button"
            role="tab"
            aria-selected={slot === tabSlot}
            className={`customize__tab${slot === tabSlot ? ' is-active' : ''}`}
            onClick={() => {
              stopPreview()
              setSlot(tabSlot)
            }}
          >
            {t(`shop.tab.${tabSlot}`)}
          </button>
        ))}
      </div>

      {shop.error && <p className="customize__error">{shop.error}</p>}

      <ShopItemList
        items={rows}
        owned={rows.map((r) => r.id)}
        equippedId={equippedId}
        onPreview={slot === 'goalSound' ? (item) => previewGoalSound(item.id) : undefined}
        iconFor={
          slot === 'ballSkin'
            ? (item) => BALL_SKIN_SOURCES[item.id]?.thumb
            : slot === 'gkSkin'
              ? (item) => GK_SKIN_SOURCES[item.id]?.thumb
              : undefined
        }
        onEquip={(item) => void store.equip(slot, item.id)}
        busy={shop.equipping}
      />

      {owned.length === 0 && <p className="customize__empty">{t(`customize.empty.${slot}`)}</p>}
    </div>
  )
}
