import { supabase } from './supabase'
import type { CustomizationSlot } from '../types/customization'

/** The customization operations the shop store depends on. Defined as an
 * interface so the store's tests can inject a fake instead of hitting the
 * network (same seam as `FriendsApi`). */
export interface CustomizationApi {
  setCustomization(slot: CustomizationSlot, itemId: string): Promise<boolean>
}

async function setCustomization(slot: CustomizationSlot, itemId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_customization', {
    p_slot: slot,
    p_item_id: itemId,
  })
  if (error) console.error('[customization] set_customization failed', { slot, itemId, error })
  return data === true
}

export const customizationApi: CustomizationApi = { setCustomization }
