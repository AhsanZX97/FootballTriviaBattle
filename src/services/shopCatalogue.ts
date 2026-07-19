import type { ShopItem } from '../types/customization'
import goalHornSrc from '../assets/sounds/Goal Celebrations/goal + horn.mp3'
import gooalSrc from '../assets/sounds/Goal Celebrations/gooal.mp3'
import goooalSrc from '../assets/sounds/Goal Celebrations/GOOOOOOOOOOAL.mp3'
import siuuuuSrc from '../assets/sounds/Goal Celebrations/SIUUUU.mp3'
import videoGameSrc from '../assets/sounds/Goal Celebrations/video game sound.mp3'
import gkManuelNeuerThumbSrc from '../assets/gk/Manuel Neuer_thumb.png'
import gkManuelNeuerIdleSrc from '../assets/gk/Manuel Neuer.png'
import gkManuelNeuerDiveSrc from '../assets/gk/Manuel Neuer_dive.png'
import wcBall2010Src from '../assets/sprites/ball/2010 WC Ball.png'
import wcBall2010SpinSrc from '../assets/sprites/ball/2010 WC Ball_spin.png'
import wcBall2014Src from '../assets/sprites/ball/2014 WC Ball.png'
import wcBall2014SpinSrc from '../assets/sprites/ball/2014 WC Ball_spin.png'
import wcBall2018Src from '../assets/sprites/ball/2018 WC Ball.png'
import wcBall2018SpinSrc from '../assets/sprites/ball/2018 WC Ball_spin.png'
import wcBall2022Src from '../assets/sprites/ball/2022 WC Ball.png'
import wcBall2022SpinSrc from '../assets/sprites/ball/2022 WC Ball_spin.png'
import wcBall2026Src from '../assets/sprites/ball/2026 WC Ball.png'
import wcBall2026SpinSrc from '../assets/sprites/ball/2026 WC Ball_spin.png'

/** Every goal celebration costs the same for now. */
const GOAL_SOUND_PRICE = 100
/** Every ball skin costs the same for now. */
const BALL_SKIN_PRICE = 150
/** Every keeper skin costs the same for now. */
const GK_SKIN_PRICE = 200

/**
 * The shop catalogue. Client-side because each item id has to map to a bundled
 * asset anyway (the audio below), and because the tabs must render for signed-
 * out players who have no DB session.
 *
 * IMPORTANT: the DB seeds the same ids/prices in 0004_customization_shop.sql
 * and `purchase_item` charges the DB's price, not this one — a client can't be
 * trusted with what an item costs. Keep the two in sync; if they ever drift,
 * the DB wins on what is actually charged.
 */
export const CATALOGUE: ShopItem[] = [
  { id: 'goal_horn', name: 'goal + horn', slot: 'goalSound', price: GOAL_SOUND_PRICE },
  { id: 'gooal', name: 'gooal', slot: 'goalSound', price: GOAL_SOUND_PRICE },
  { id: 'goooooooooal', name: 'GOOOOOOOOOOAL', slot: 'goalSound', price: GOAL_SOUND_PRICE },
  { id: 'siuuuu', name: 'SIUUUU', slot: 'goalSound', price: GOAL_SOUND_PRICE },
  { id: 'video_game_sound', name: 'video game sound', slot: 'goalSound', price: GOAL_SOUND_PRICE },
  { id: 'wc_ball_2010', name: '2010 WC Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'wc_ball_2014', name: '2014 WC Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'wc_ball_2018', name: '2018 WC Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'wc_ball_2022', name: '2022 WC Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'wc_ball_2026', name: '2026 WC Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'gk_manuel_neuer', name: 'Manuel Neuer', slot: 'gkSkin', price: GK_SKIN_PRICE },
]

/** Audio for each goal-sound item. Keyed by the catalogue id above; an id with
 * no entry here falls back to the stock cheer. */
export const GOAL_SOUND_SOURCES: Record<string, string> = {
  goal_horn: goalHornSrc,
  gooal: gooalSrc,
  goooooooooal: goooalSrc,
  siuuuu: siuuuuSrc,
  video_game_sound: videoGameSrc,
}

/** Art for each ball-skin item. `thumb` is the resting/shop-tile image; `spin`
 * is a 2x2 grid (4 frames, reading order TL/TR/BL/BR) used for the in-flight
 * spin animation. Keyed by the catalogue id above; an id with no entry here
 * falls back to the stock ball. */
export const BALL_SKIN_SOURCES: Record<string, { thumb: string; spin: string }> = {
  wc_ball_2010: { thumb: wcBall2010Src, spin: wcBall2010SpinSrc },
  wc_ball_2014: { thumb: wcBall2014Src, spin: wcBall2014SpinSrc },
  wc_ball_2018: { thumb: wcBall2018Src, spin: wcBall2018SpinSrc },
  wc_ball_2022: { thumb: wcBall2022Src, spin: wcBall2022SpinSrc },
  wc_ball_2026: { thumb: wcBall2026Src, spin: wcBall2026SpinSrc },
}

/** Art for each keeper-skin item. `thumb` is the resting/shop-tile image — the
 * idle sheet's first frame, cropped to its own file. `idle` is the full idle
 * sheet used for the in-match animation (a 4-col x 3-row grid; see
 * PitchScene.css's scene-keeper-idle-grid keyframes). `dive` is a 6-frame
 * horizontal strip, evenly packed and bottom-anchored per cell (402x371) —
 * repacked from the source art's unevenly-spaced frames via connected-
 * component detection, the same approach the stock gk-dive-strip.png used.
 * Keyed by the catalogue id above; an id with no entry here falls back to the
 * stock keeper. */
export const GK_SKIN_SOURCES: Record<string, { thumb: string; idle: string; dive: string }> = {
  gk_manuel_neuer: { thumb: gkManuelNeuerThumbSrc, idle: gkManuelNeuerIdleSrc, dive: gkManuelNeuerDiveSrc },
}

export function catalogueFor(slot: ShopItem['slot']): ShopItem[] {
  return CATALOGUE.filter((item) => item.slot === slot)
}

export function findItem(id: string): ShopItem | undefined {
  return CATALOGUE.find((item) => item.id === id)
}
