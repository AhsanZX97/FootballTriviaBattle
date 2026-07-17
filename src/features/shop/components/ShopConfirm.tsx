import { useEffect } from 'react'
import type { ShopItem } from '../../../types/customization'
import { Sprite } from '../../../components/Sprite'
import './ShopConfirm.css'

/** `buy` asks to spend coins; `owned` is the post-purchase (or already-bought)
 * state that offers to equip. */
export type ConfirmMode = 'buy' | 'owned'

type Props = {
  item: ShopItem
  mode: ConfirmMode
  /** True while the purchase/equip RPC is in flight. */
  busy?: boolean
  /** Failure from the last attempt, shown in place rather than behind the popup. */
  error?: string | null
  /** True when this item is already the equipped one. */
  equipped?: boolean
  onBuy: () => void
  onEquip: () => void
  onCancel: () => void
}

/** Buy/equip confirmation. Presentational — ShopPopup owns the store calls.
 * Sits above the shop popup (z 200) on the same layer as the challenge modal,
 * and borrows its panel/button skin so the app's confirmations look alike. */
export function ShopConfirm({ item, mode, busy, error, equipped, onBuy, onEquip, onCancel }: Props) {
  // Escape cancels, matching the app's other dismissable overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const buying = mode === 'buy'

  return (
    <div
      className="shop-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={buying ? 'Confirm purchase' : 'Equip item'}
      onClick={onCancel}
    >
      <div className="shop-confirm__panel" onClick={(e) => e.stopPropagation()}>
        <p className="shop-confirm__headline">
          {buying ? (
            <>
              Buy <strong>{item.name}</strong> for
              <span className="shop-confirm__price">
                <Sprite name="coin" />
                {item.price}
              </span>
              ?
            </>
          ) : (
            <>
              <strong>{item.name}</strong>
              <span className="shop-confirm__owned">{equipped ? 'EQUIPPED' : 'PURCHASED'}</span>
            </>
          )}
        </p>

        {error && <p className="shop-confirm__error">{error}</p>}

        <div className="shop-confirm__actions">
          {buying ? (
            <button
              type="button"
              className="shop-confirm__btn shop-confirm__btn--go"
              disabled={busy}
              onClick={onBuy}
            >
              {busy ? 'BUYING…' : 'BUY'}
            </button>
          ) : (
            <button
              type="button"
              className="shop-confirm__btn shop-confirm__btn--go"
              disabled={busy || equipped}
              onClick={onEquip}
            >
              {busy ? 'EQUIPPING…' : equipped ? 'EQUIPPED' : 'EQUIP'}
            </button>
          )}
          <button
            type="button"
            className="shop-confirm__btn shop-confirm__btn--cancel"
            onClick={onCancel}
          >
            {buying ? 'CANCEL' : 'CLOSE'}
          </button>
        </div>
      </div>
    </div>
  )
}
