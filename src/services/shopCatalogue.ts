import type { ShopItem } from '../types/customization'
import goalHornSrc from '../assets/sounds/Goal Celebrations/goal + horn.mp3'
import gooalSrc from '../assets/sounds/Goal Celebrations/gooal.mp3'
import goooalSrc from '../assets/sounds/Goal Celebrations/GOOOOOOOOOOAL.mp3'
import siuuuuSrc from '../assets/sounds/Goal Celebrations/SIUUUU.mp3'
import videoGameSrc from '../assets/sounds/Goal Celebrations/video game sound.mp3'

/** Every goal celebration costs the same for now. */
const GOAL_SOUND_PRICE = 100

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

export function catalogueFor(slot: ShopItem['slot']): ShopItem[] {
  return CATALOGUE.filter((item) => item.slot === slot)
}

export function findItem(id: string): ShopItem | undefined {
  return CATALOGUE.find((item) => item.id === id)
}
