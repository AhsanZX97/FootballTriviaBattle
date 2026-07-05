import { Preferences } from '@capacitor/preferences'

/**
 * Copy every persisted Capacitor Preferences entry into localStorage so the
 * synchronous storage seam (services/storage.ts) reads real values on native.
 * Run once at boot, before React renders. Writes localStorage directly rather
 * than through the seam so it doesn't echo straight back into Preferences.
 */
export async function hydrateFromPreferences(): Promise<void> {
  const { keys } = await Preferences.keys()
  await Promise.all(
    keys.map(async (key) => {
      const { value } = await Preferences.get({ key })
      if (value != null) localStorage.setItem(key, value)
    }),
  )
}

/** Write-through sink handed to setStorageMirror: keeps Preferences in step. */
export function mirrorToPreferences(key: string, value: string | null): void {
  if (value === null) void Preferences.remove({ key })
  else void Preferences.set({ key, value })
}
