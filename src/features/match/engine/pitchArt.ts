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
export function pitchLayout(width: number, height: number) {
  // Fill the mobile screen and bring the penalty spot into the foreground.
  // Crop the stadium sides in portrait, keeping every actor on the same scale.
  const pitchWidth = Math.max(width, height * 16 / 9)
  const pitchHeight = pitchWidth * 9 / 16
  return { x: (width - pitchWidth) / 2, y: (height - pitchHeight) / 2, width: pitchWidth, height: pitchHeight }
}
