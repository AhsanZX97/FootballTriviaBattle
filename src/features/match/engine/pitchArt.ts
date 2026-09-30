import type { Stage } from '../../../types/match'
import { BALL_SKIN_SOURCES, GK_SKIN_SOURCES } from '../../../services/shopCatalogue'
import idleSrc from '../../../assets/gk-idle-strip.png'
import diveSrc from '../../../assets/gk-dive-strip.png'
import ballSrc from '../../../assets/ball.png'
import spinSrc from '../../../assets/ball-spin-strip.png'

export interface PitchSkins {
  stage: Stage
  ballSkin?: string
  gkSkin?: string
  opponentGkSkin?: string
}
export interface Sheet { src: string; columns: number; rows: number }
export function resolvePitchArt(skins: PitchSkins) {
  const keeperId = skins.stage === 'keep' ? skins.gkSkin : skins.opponentGkSkin
  const keeper = keeperId ? GK_SKIN_SOURCES[keeperId] : undefined
  const ball = skins.ballSkin ? BALL_SKIN_SOURCES[skins.ballSkin] : undefined
  const green = keeperId === 'gk_green_wall'
  const diveScale: Record<string, number> = {
    gk_green_wall: 1.2523, gk_gold_standard: 1.2504,
    gk_coral_guard: 1.3, gk_orange_blaze: 1.2855,
  }
  return {
    idle: { src: keeper?.idle ?? idleSrc, columns: keeper ? 4 : 16, rows: keeper ? (green ? 3 : 4) : 1 },
    dive: { src: keeper?.dive ?? diveSrc, columns: keeper && !green ? 5 : 6, rows: 1 },
    ball: { src: ball?.thumb ?? ballSrc, columns: 1, rows: 1 },
    spin: { src: ball?.spin ?? spinSrc, columns: ball ? 2 : 4, rows: ball ? 2 : 1 },
    diveScale: keeper ? diveScale[keeperId!] : 1.184,
  }
}
// Share of the stadium width that must fit on screen: both posts plus a margin.
const GOAL_VIEW = 0.4

export function pitchLayout(width: number, height: number) {
  // Cover the screen, but never zoom past the whole goal. On a tall phone that
  // leaves the art short of the screen; `PITCH_BANDS` fill above and below it.
  const pitchWidth = Math.min(Math.max(width, height * 16 / 9), width / GOAL_VIEW)
  const pitchHeight = pitchWidth * 9 / 16
  return { x: (width - pitchWidth) / 2, y: (height - pitchHeight) / 2, width: pitchWidth, height: pitchHeight }
}

export interface Band { x: number; y: number; width: number; height: number }
/** Source-pixel regions of bg.jpg (1280x720) that repeat seamlessly. */
export const PITCH_BANDS = {
  // Upper stand tier plus the dark divider beneath it; stacks upward from row 25.
  crowd: { x: 0, y: 25, width: 1280, height: 115 },
  // One dark + light grass stripe, clear of pitch markings between the posts' view.
  grass: { x: 384, y: 525, width: 512, height: 88 },
} satisfies Record<string, Band>
