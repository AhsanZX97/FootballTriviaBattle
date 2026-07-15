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

/** A purchasable/equippable cosmetic in one slot. The catalogue is empty until
 * the first items ship, so nothing renders these yet. */
export interface ShopItem {
  id: string
  /** Shown on the item tile. */
  name: string
  slot: CustomizationSlot
  /** In coins. 0 for items every player starts with. */
  price: number
}

