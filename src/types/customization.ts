/** The three cosmetic slots bound to a player's profile. Each maps to one tab
 * in the shop popup:
 *   gkSkin    -> the goalkeeper's appearance
 *   ballSkin  -> the football's appearance
 *   goalSound -> the sting played when a goal is scored
 */
export type CustomizationSlot = 'gkSkin' | 'ballSkin' | 'goalSound'

/** A player's equipped cosmetics (from `profiles`). `DEFAULT_ITEM_ID` means the
 * stock look/sound — every profile starts there and no catalogue item is
 * required to render it. */
export interface Customization {
  gkSkin: string
  ballSkin: string
  goalSound: string
}

/** The stock item every slot defaults to, matching the DB column default. */
export const DEFAULT_ITEM_ID = 'default'

export const defaultCustomization = (): Customization => ({
  gkSkin: DEFAULT_ITEM_ID,
  ballSkin: DEFAULT_ITEM_ID,
  goalSound: DEFAULT_ITEM_ID,
})

/** A purchasable/equippable cosmetic in one slot. */
export interface ShopItem {
  id: string
  /** Shown on the item tile — the sound files' own names. */
  name: string
  slot: CustomizationSlot
  /** In coins. */
  price: number
}

/** Result code from `purchase_item`. */
export type PurchaseResult = 'ok' | 'already_owned' | 'insufficient_coins' | 'not_found' | 'error'
