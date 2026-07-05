import { App as CapApp } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar } from '@capacitor/status-bar'
import { setStorageMirror } from '../storage'
import { hydrateFromPreferences, mirrorToPreferences } from './preferences'
import { fadeOutCrowd, playTheme, reloadMasterVolume, stopTheme } from '../sound'

/**
 * One-time native bootstrap, awaited before the app renders (see main.tsx).
 * Only ever runs inside a Capacitor WebView, so nothing here touches web.
 */
export async function initNative(): Promise<void> {
  // Durable storage first: pull Preferences into localStorage, then mirror
  // future writes back, then refresh the volume that sound.ts read at import.
  await hydrateFromPreferences().catch(() => {})
  setStorageMirror(mirrorToPreferences)
  reloadMasterVolume()

  // Immersive: hide the status bar so the pitch fills the screen.
  await StatusBar.hide().catch(() => {})

  // Pause audio when the app is backgrounded; resume the theme on return.
  // (The match stops the theme itself, so playTheme here only revives menus.)
  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      playTheme()
    } else {
      stopTheme()
      fadeOutCrowd()
    }
  })
}

/** Reveal the app once React has painted the first screen. */
export function hideSplash(): void {
  void SplashScreen.hide().catch(() => {})
}
