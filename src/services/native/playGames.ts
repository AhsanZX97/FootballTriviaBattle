import { registerPlugin } from '@capacitor/core'
import { isNative } from '../platform'

/** Mirrors PlayGamesPlugin.java. Android-only; nothing here exists on web. */
export interface PlayGamesPlugin {
  /** False when the build has no Play Games project configured yet. */
  isAvailable(): Promise<{ available: boolean }>
  /** Whether Play Games' automatic sign-in at launch succeeded. */
  isAuthenticated(): Promise<{ authenticated: boolean }>
  /** Shows the sign-in prompt. Not used by the silent boot path. */
  signIn(): Promise<{ authenticated: boolean }>
  /** One-time code for pgs-signin to redeem; null when unobtainable. */
  requestServerSideAccess(): Promise<{ authCode: string | null }>
}

const PlayGames = registerPlugin<PlayGamesPlugin>('PlayGames')

/**
 * The auth code for a player Play Games has already signed in automatically,
 * or null for every other case — web, an unconfigured build, no Play Services,
 * a player who declined, a child account. Never throws and never prompts: a
 * null here just means the player gets the ordinary sign-in screen.
 */
export async function playGamesAuthCode(): Promise<string | null> {
  if (!isNative) return null
  try {
    const { available } = await PlayGames.isAvailable()
    if (!available) return null

    const { authenticated } = await PlayGames.isAuthenticated()
    if (!authenticated) return null

    const { authCode } = await PlayGames.requestServerSideAccess()
    return authCode ?? null
  } catch {
    return null
  }
}
