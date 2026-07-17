import themeSrc from '../assets/sounds/theme music.mp3'
import kickSrc from '../assets/sounds/kick.mp3'
import cheerSrc from '../assets/sounds/cheer.mp3'
import shockSrc from '../assets/sounds/crowd shocked.mp3'
import netRippleSrc from '../assets/sounds/net ripple.ogg'
import startWhistleSrc from '../assets/sounds/start whistle.mp3'
import finalWhistleSrc from '../assets/sounds/final ref whistle.mp3'
import countdownSrc from '../assets/sounds/321 countdown.mp3'
import { GOAL_SOUND_SOURCES } from './shopCatalogue'
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

/** Bought goal stings are dry one-shots rather than crowd ambience, so they sit
 * above the stock cheer's 0.5 to land with the same weight. */
const GOAL_SOUND_LEVEL = 0.8

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
// crowd sounds from doubling up without touching the callers. Keyed by sound
// name, or by item id for goal celebrations.
const lastPlayed = new Map<string, number>()

/** Shared playback path for every one-shot: master gate, debounce, mix level,
 * and (for the long reactions) crowd tracking so fadeOutCrowd can catch them. */
function playSource(
  key: string,
  src: string,
  level: number,
  isCrowd: boolean,
): HTMLAudioElement | null {
  if (master === 0) return null
  const now = Date.now()
  if (now - (lastPlayed.get(key) ?? -Infinity) < 100) return null
  lastPlayed.set(key, now)
  const audio = new Audio(src)
  audio.volume = master * level
  // autoplay-blocked or unsupported playback just stays silent
  audio.play()?.catch(() => {})
  if (isCrowd) {
    crowd?.pause()
    crowd = audio
  }
  return audio
}

export function play(name: SoundName) {
  playSource(name, SOURCES[name], LEVELS[name] ?? 1, name === 'cheer' || name === 'shock')
}

/**
 * The goal celebration for the player's equipped `goalSound` item, falling back
 * to the stock cheer for 'default' (or any id without bundled audio — e.g. a
 * profile equipped on a newer build than this one). Tracked as a crowd sound
 * either way, so the match screen's fade-out still catches it.
 */
export function playGoalCelebration(itemId: string) {
  const src = GOAL_SOUND_SOURCES[itemId]
  if (!src) {
    play('cheer')
    return
  }
  playSource(itemId, src, GOAL_SOUND_LEVEL, true)
}

// Shop previews get their own channel: they must restart on a repeated tap of
// the same tile (so the debounce above would be wrong) and must not be caught
// by fadeOutCrowd, which belongs to the match.
let previewAudio: HTMLAudioElement | null = null

/** Stop whatever the shop is previewing. Safe to call when nothing is playing. */
export function stopPreview(): void {
  previewAudio?.pause()
  previewAudio = null
}

/** Preview a goal sound. Only one preview plays at a time — picking another row
 * (or replaying the same one) cuts the previous off. Resolves 'default' to the
 * stock cheer, at the cheer's own level, so a preview is always what you would
 * actually hear on a goal. */
export function previewGoalSound(itemId: string): void {
  stopPreview()
  if (master === 0) return
  const custom = GOAL_SOUND_SOURCES[itemId]
  const audio = new Audio(custom ?? cheerSrc)
  audio.volume = master * (custom ? GOAL_SOUND_LEVEL : (LEVELS.cheer ?? 1))
  audio.play()?.catch(() => {})
  previewAudio = audio
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
