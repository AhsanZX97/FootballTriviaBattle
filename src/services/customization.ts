import { supabase } from './supabase'
import type { CustomizationSlot, PurchaseResult } from '../types/customization'

/** What `purchase_item` reports back: the outcome, plus the resulting coin
 * balance so the caller can update the counter without a refetch. */
export interface PurchaseResponse {
  status: PurchaseResult
  coins: number
}

/** The customization operations the shop store depends on. Defined as an
 * interface so the store's tests can inject a fake instead of hitting the
 * network (same seam as `FriendsApi`). */
export interface CustomizationApi {
  setCustomization(slot: CustomizationSlot, itemId: string): Promise<boolean>
  purchaseItem(itemId: string): Promise<PurchaseResponse>
  listOwnedItems(): Promise<string[]>
}

interface OwnedRow {
  item_id: string
}

async function setCustomization(slot: CustomizationSlot, itemId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_customization', {
    p_slot: slot,
    p_item_id: itemId,
  })
  if (error) console.error('[customization] set_customization failed', { slot, itemId, error })
  return data === true
}

async function purchaseItem(itemId: string): Promise<PurchaseResponse> {
  const { data, error } = await supabase.rpc('purchase_item', { p_item_id: itemId })
  if (error) {
    console.error('[customization] purchase_item failed', { itemId, error })
    return { status: 'error', coins: 0 }
  }
  const row = data as PurchaseResponse | null
  // A transport hiccup can null `data` without setting `error`; treat that as a
  // failed purchase rather than reporting a bogus zero balance as fact.
  return row ?? { status: 'error', coins: 0 }
}

async function listOwnedItems(): Promise<string[]> {
  const { data } = await supabase.rpc('list_owned_items')
  return ((data as OwnedRow[] | null) ?? []).map((r) => r.item_id)
}

export const customizationApi: CustomizationApi = {
  setCustomization,
  purchaseItem,
  listOwnedItems,
}
