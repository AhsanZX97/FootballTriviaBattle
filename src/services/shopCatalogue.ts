import type { ShopItem } from '../types/customization'
import goalHornSrc from '../assets/sounds/Goal Celebrations/goal + horn.mp3'
import gooalSrc from '../assets/sounds/Goal Celebrations/gooal.mp3'
import goooalSrc from '../assets/sounds/Goal Celebrations/GOOOOOOOOOOAL.mp3'
import celebrationYellSrc from '../assets/sounds/Goal Celebrations/celebration-yell.mp3'
import videoGameSrc from '../assets/sounds/Goal Celebrations/video game sound.mp3'
import gkGreenWallThumbSrc from '../assets/gk/green-wall_thumb.png'
import gkGreenWallIdleSrc from '../assets/gk/green-wall.png'
import gkGreenWallDiveSrc from '../assets/gk/green-wall_dive.png'
import gkGoldStandardThumbSrc from '../assets/gk/gold-standard_thumb.png'
import gkGoldStandardIdleSrc from '../assets/gk/gold-standard.png'
import gkGoldStandardDiveSrc from '../assets/gk/gold-standard_dive.png'
import gkCoralGuardThumbSrc from '../assets/gk/coral-guard_thumb.png'
import gkCoralGuardIdleSrc from '../assets/gk/coral-guard.png'
import gkCoralGuardDiveSrc from '../assets/gk/coral-guard_dive.png'
import gkOrangeBlazeThumbSrc from '../assets/gk/orange-blaze_thumb.png'
import gkOrangeBlazeIdleSrc from '../assets/gk/orange-blaze.png'
import gkOrangeBlazeDiveSrc from '../assets/gk/orange-blaze_dive.png'
import ballGoldTrimSrc from '../assets/sprites/ball/gold-trim.png'
import ballGoldTrimSpinSrc from '../assets/sprites/ball/gold-trim_spin.png'
import ballCarnivalSwirlSrc from '../assets/sprites/ball/carnival-swirl.png'
import ballCarnivalSwirlSpinSrc from '../assets/sprites/ball/carnival-swirl_spin.png'
import ballCrimsonBlockSrc from '../assets/sprites/ball/crimson-block.png'
import ballCrimsonBlockSpinSrc from '../assets/sprites/ball/crimson-block_spin.png'
import ballNeonStreakSrc from '../assets/sprites/ball/neon-streak.png'
import ballNeonStreakSpinSrc from '../assets/sprites/ball/neon-streak_spin.png'
import ballPrismPanelSrc from '../assets/sprites/ball/prism-panel.png'
import ballPrismPanelSpinSrc from '../assets/sprites/ball/prism-panel_spin.png'

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
  { id: 'celebration_yell', name: 'Celebration Yell', slot: 'goalSound', price: GOAL_SOUND_PRICE },
  { id: 'video_game_sound', name: 'video game sound', slot: 'goalSound', price: GOAL_SOUND_PRICE },
  { id: 'ball_gold_trim', name: 'Gold Trim Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'ball_carnival_swirl', name: 'Carnival Swirl Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'ball_crimson_block', name: 'Crimson Block Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'ball_neon_streak', name: 'Neon Streak Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'ball_prism_panel', name: 'Prism Panel Ball', slot: 'ballSkin', price: BALL_SKIN_PRICE },
  { id: 'gk_green_wall', name: 'Green Wall Keeper', slot: 'gkSkin', price: GK_SKIN_PRICE },
  { id: 'gk_gold_standard', name: 'Gold Standard Keeper', slot: 'gkSkin', price: GK_SKIN_PRICE },
  { id: 'gk_coral_guard', name: 'Coral Guard Keeper', slot: 'gkSkin', price: GK_SKIN_PRICE },
  { id: 'gk_orange_blaze', name: 'Orange Blaze Keeper', slot: 'gkSkin', price: GK_SKIN_PRICE },
]

/** Audio for each goal-sound item. Keyed by the catalogue id above; an id with
 * no entry here falls back to the stock cheer. */
export const GOAL_SOUND_SOURCES: Record<string, string> = {
  goal_horn: goalHornSrc,
  gooal: gooalSrc,
  goooooooooal: goooalSrc,
  celebration_yell: celebrationYellSrc,
  video_game_sound: videoGameSrc,
}

/** Art for each ball-skin item. `thumb` is the resting/shop-tile image; `spin`
 * is a 2x2 grid (4 frames, reading order TL/TR/BL/BR) used for the in-flight
 * spin animation. Keyed by the catalogue id above; an id with no entry here
 * falls back to the stock ball. */
export const BALL_SKIN_SOURCES: Record<string, { thumb: string; spin: string }> = {
  ball_gold_trim: { thumb: ballGoldTrimSrc, spin: ballGoldTrimSpinSrc },
  ball_carnival_swirl: { thumb: ballCarnivalSwirlSrc, spin: ballCarnivalSwirlSpinSrc },
  ball_crimson_block: { thumb: ballCrimsonBlockSrc, spin: ballCrimsonBlockSpinSrc },
  ball_neon_streak: { thumb: ballNeonStreakSrc, spin: ballNeonStreakSpinSrc },
  ball_prism_panel: { thumb: ballPrismPanelSrc, spin: ballPrismPanelSpinSrc },
}

/** Art for each keeper-skin item. `thumb` is the resting/shop-tile image — the
 * idle sheet's first frame, cropped to its own file. `idle` is the full idle
 * sheet used for the in-match animation, a grid (4x3 for Green Wall, 4x4 for
 * the rest — each source came in with a different frame count). `dive` is a
 * horizontal strip, evenly packed and bottom-anchored per cell — repacked
 * from each source's unevenly-spaced (sometimes colliding) frames via
 * connected-component detection, the same approach the stock
 * gk-dive-strip.png used. Frame count varies by keeper too (5 or 6).
 * `cssId` selects the matching keyframes/box-size rule in PitchScene.css
 * (`.scene__keeper--<cssId>`) — every keeper's grid shape, cell size and dive
 * frame count differs enough that each needs its own rule; there's no single
 * generic one to parameterize. Keyed by the catalogue id above; an id with no
 * entry here falls back to the stock keeper. */
export const GK_SKIN_SOURCES: Record<string, { thumb: string; idle: string; dive: string; cssId: string }> = {
  gk_green_wall: {
    thumb: gkGreenWallThumbSrc,
    idle: gkGreenWallIdleSrc,
    dive: gkGreenWallDiveSrc,
    cssId: 'greenwall',
  },
  gk_gold_standard: {
    thumb: gkGoldStandardThumbSrc,
    idle: gkGoldStandardIdleSrc,
    dive: gkGoldStandardDiveSrc,
    cssId: 'goldstandard',
  },
  gk_coral_guard: {
    thumb: gkCoralGuardThumbSrc,
    idle: gkCoralGuardIdleSrc,
    dive: gkCoralGuardDiveSrc,
    cssId: 'coralguard',
  },
  gk_orange_blaze: {
    thumb: gkOrangeBlazeThumbSrc,
    idle: gkOrangeBlazeIdleSrc,
    dive: gkOrangeBlazeDiveSrc,
    cssId: 'orangeblaze',
  },
}

export function catalogueFor(slot: ShopItem['slot']): ShopItem[] {
  return CATALOGUE.filter((item) => item.slot === slot)
}

export function findItem(id: string): ShopItem | undefined {
  return CATALOGUE.find((item) => item.id === id)
}
