import type { ShopItem } from '../../../types/customization'
import { Sprite } from '../../../components/Sprite'
import volumeIcon from '../../../assets/volume-icon.png'
import './ShopItemList.css'

type Props = {
  items: ShopItem[]
  /** Ids the player already owns — these show EQUIP instead of a price. */
  owned: string[]
  /** The id currently equipped in this slot. */
  equippedId: string
  /** Preview button. Only sounds are previewable; omit for visual slots. */
  onPreview?: (item: ShopItem) => void
  /** Tapping the row itself — opens the buy/equip popup. */
  onSelect: (item: ShopItem) => void
}

/** Rows of buyable cosmetics, mirroring FriendList's row layout so the two
 * popups read the same. The preview control is its own button beside the row's
 * main target rather than nested inside it (a button can't contain a button). */
export function ShopItemList({ items, owned, equippedId, onPreview, onSelect }: Props) {
  return (
    <ul className="shop-items">
      {items.map((item) => {
        const isOwned = owned.includes(item.id)
        const isEquipped = equippedId === item.id
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
            <button
              type="button"
              className="shop-items__main"
              aria-label={item.name}
              onClick={() => onSelect(item)}
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
          </li>
        )
      })}
    </ul>
  )
}
