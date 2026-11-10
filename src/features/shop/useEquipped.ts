import { useSyncExternalStore } from 'react'
import { authStore } from '../auth/store'
import { localProgressStore } from '../progress/store'
import { useDevMode } from '../../services/devMode'
import { DEFAULT_ITEM_ID, type Customization, type CustomizationSlot } from '../../types/customization'

/** The look the pitch should actually draw.
 *
 * Signed in, it is the server profile. Signed out, equips only ever land in the
 * on-device store, so that is what gets drawn. The dev account equips on-device
 * too (the server refuses its free items and a profile refresh would wipe a
 * session-only change), so there an on-device pick wins over the profile. */
export function useEquipped(): Customization {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState)
  const local = useSyncExternalStore(localProgressStore.subscribe, localProgressStore.getState)
  const dev = useDevMode()

  if (auth.status !== 'signedIn') return local.customization
  if (!dev) return auth.customization
  const merged = { ...auth.customization }
  for (const slot of Object.keys(merged) as CustomizationSlot[]) {
    if (local.customization[slot] !== DEFAULT_ITEM_ID) merged[slot] = local.customization[slot]
  }
  return merged
}
