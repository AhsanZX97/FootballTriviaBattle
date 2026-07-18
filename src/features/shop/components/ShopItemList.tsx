import type { ShopItem } from '../../../types/customization'
import { Sprite } from '../../../components/Sprite'
import volumeIcon from '../../../assets/volume-icon.png'
import './ShopItemList.css'

type Props = {
  items: ShopItem[]
  /** Ids the player already owns — these show OWNED instead of a price. */
  owned: string[]
  /** The id currently equipped in this slot. */
  equippedId: string
  /** Preview button. Only sounds are previewable; omit for visual slots. */
  onPreview?: (item: ShopItem) => void
  /** Static thumbnail beside the row, e.g. a ball skin's art. Mutually
   * exclusive with `onPreview` — pass at most one. */
  iconFor?: (item: ShopItem) => string | undefined
  /**
   * Shop mode: the whole row is the target and opens the buy/equip confirm.
   * Mutually exclusive with `onEquip` — pass exactly one.
   */
  onSelect?: (item: ShopItem) => void
  /** Customize mode: each row carries its own EQUIP button instead. */
  onEquip?: (item: ShopItem) => void
  /** Disables the EQUIP buttons while one is in flight. */
  busy?: boolean
}

/** Rows of cosmetics, mirroring FriendList's row layout so the two popups read
 * the same. Serves both the shop (tap the row to buy) and the customize panel
 * (tap a per-row EQUIP), which differ only in the row's trailing control.
 *
 * The preview control is always its own button beside the row's main body
 * rather than nested inside it — a button can't contain a button. */
export function ShopItemList({
  items,
  owned,
  equippedId,
  onPreview,
  iconFor,
  onSelect,
  onEquip,
  busy,
}: Props) {
  return (
    <ul className="shop-items">
      {items.map((item) => {
        const isOwned = owned.includes(item.id)
        const isEquipped = equippedId === item.id
        const icon = iconFor?.(item)

        const body = onEquip ? (
          // Customize mode: static row, because the EQUIP button is the target.
          <div className="shop-items__main shop-items__main--static">
            <span className="shop-items__name">{item.name}</span>
            {isEquipped ? (
              <span className="shop-items__tag shop-items__tag--equipped">EQUIPPED</span>
            ) : (
              <button
                type="button"
                className="shop-items__equip"
                disabled={busy}
                onClick={() => onEquip(item)}
              >
                EQUIP
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="shop-items__main"
            aria-label={item.name}
            onClick={() => onSelect?.(item)}
          >
            <span className="shop-items__name">{item.name}</span>
            {isEquipped ? (
              <span className="shop-items__tag shop-items__tag--equipped">EQUIPPED</span>
            ) : isOwned ? (
              <span className="shop-items__tag">OWNED</span>
            ) : (
              <span className="shop-items__price">
                <Sprite name="coin" />
                {item.price}
              </span>
            )}
          </button>
        )

        return (
          <li key={item.id} className="shop-items__row">
            {onPreview && (
              <button
                type="button"
                className="shop-items__preview"
                aria-label={`Preview ${item.name}`}
                onClick={() => onPreview(item)}
              >
                <img className="shop-items__preview-img" src={volumeIcon} alt="" />
              </button>
            )}
            {icon && (
              <span className="shop-items__preview shop-items__preview--static" aria-hidden>
                <img className="shop-items__preview-img shop-items__preview-img--thumb" src={icon} alt="" />
              </span>
            )}
            {body}
          </li>
        )
      })}
    </ul>
  )
}
