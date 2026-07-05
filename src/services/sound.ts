import themeSrc from '../assets/sounds/theme music.mp3'
import kickSrc from '../assets/sounds/kick.mp3'
import cheerSrc from '../assets/sounds/cheer.mp3'
import shockSrc from '../assets/sounds/crowd shocked.mp3'
import netRippleSrc from '../assets/sounds/net ripple.ogg'
import startWhistleSrc from '../assets/sounds/start whistle.mp3'
import finalWhistleSrc from '../assets/sounds/final ref whistle.mp3'
import countdownSrc from '../assets/sounds/321 countdown.mp3'
import { getItem, setItem } from './storage'

export type SoundName =
  | 'kick'
  | 'cheer'
  | 'shock'
  | 'netRipple'
  | 'startWhistle'
  | 'finalWhistle'
  | 'countdown'

const SOURCES: Record<SoundName, string> = {
  kick: kickSrc,
  cheer: cheerSrc,
  shock: shockSrc,
  netRipple: netRippleSrc,
  startWhistle: startWhistleSrc,
  finalWhistle: finalWhistleSrc,
  countdown: countdownSrc,
}

export const VOLUME_STORAGE_KEY = 'ftb-volume'
/** Theme sits at 10% of master so it beds under the effects. */
const THEME_LEVEL = 0.1

/** Per-sound mix levels (× master). Anything unlisted plays at full master. */
const LEVELS: Partial<Record<SoundName, number>> = {
  cheer: 0.5,
  shock: 0.5,
  startWhistle: 0.5,
  finalWhistle: 0.5,
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1))
}

let master = clamp01(Number(getItem(VOLUME_STORAGE_KEY) ?? 1))

const theme = new Audio(themeSrc)
theme.loop = true
theme.volume = master * THEME_LEVEL

export function getMasterVolume(): number {
  return master
}

/**
 * Re-read the persisted volume. Called once on native after Capacitor
 * Preferences hydrates localStorage, since this module's initial read at import
 * time runs before that boot step. A no-op on web (storage is already there).
 */
export function reloadMasterVolume(): void {
  master = clamp01(Number(getItem(VOLUME_STORAGE_KEY) ?? 1))
  theme.volume = master * THEME_LEVEL
}

export function setMasterVolume(v: number) {
  master = clamp01(v)
  setItem(VOLUME_STORAGE_KEY, String(master))
  theme.volume = master * THEME_LEVEL
}

// The long crowd reactions (cheer is a 30s file) get tracked so the match
// screen can fade them out when the moment passes; everything else is
// fire-and-forget.
let crowd: HTMLAudioElement | null = null
// StrictMode double-runs effects in dev; a tiny debounce keeps whistles and
// crowd sounds from doubling up without touching the callers.
const lastPlayed = new Map<SoundName, number>()

export function play(name: SoundName) {
  if (master === 0) return
  const now = Date.now()
  if (now - (lastPlayed.get(name) ?? -Infinity) < 100) return
  lastPlayed.set(name, now)
  const audio = new Audio(SOURCES[name])
  audio.volume = master * (LEVELS[name] ?? 1)
  // ponytail: autoplay-blocked or unsupported playback just stays silent
  audio.play()?.catch(() => {})
  if (name === 'cheer' || name === 'shock') {
    crowd?.pause()
    crowd = audio
  }
}

/** Fade the current crowd reaction out instead of cutting a 30s cheer dead. */
export function fadeOutCrowd(ms = 800) {
  const audio = crowd
  crowd = null
  if (!audio || audio.paused) return
  const startVolume = audio.volume
  const startedAt = Date.now()
  const timer = setInterval(() => {
    const remaining = 1 - (Date.now() - startedAt) / ms
    if (remaining <= 0) {
      audio.pause()
      clearInterval(timer)
    } else {
      audio.volume = startVolume * remaining
    }
  }, 50)
}

// Browsers block audio until the first user gesture; if the intro theme is
// refused, retry once on the first pointer press.
let themeRetry: (() => void) | null = null

export function playTheme() {
  theme.volume = master * THEME_LEVEL
  theme.play()?.catch(() => {
    if (themeRetry) return
    themeRetry = () => {
      themeRetry = null
      theme.play()?.catch(() => {})
    }
    window.addEventListener('pointerdown', themeRetry, { once: true })
  })
}

export function stopTheme() {
  if (themeRetry) {
    window.removeEventListener('pointerdown', themeRetry)
    themeRetry = null
  }
  theme.pause()
}
