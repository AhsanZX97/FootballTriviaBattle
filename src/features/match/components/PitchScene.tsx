import { useState, type CSSProperties } from 'react'
import type { Stage } from '../../../types/match'
import { BALL_SKIN_SOURCES, GK_SKIN_SOURCES } from '../../../services/shopCatalogue'
import './PitchScene.css'

/** How the keeper reacts to being beaten — picked at random per goal. */
const GOAL_KEEPER_VARIANTS = ['wrong-way', 'frozen', 'late'] as const

/** Outcome being animated: goal/miss = user shot, save/concede = user kept. */
export type SceneFeedback = 'goal' | 'miss' | 'save' | 'concede'

const LABELS: Record<SceneFeedback, string> = {
  goal: 'GOAL!',
  miss: 'MISS!',
  save: 'SAVED!',
  concede: 'CPU SCORES!',
}

type Props = {
  stage: Stage
  feedback: SceneFeedback | null
  /** Who scored the conceded goal — defaults to CPU outside 1v1. */
  opponentLabel?: string
  /** Equipped ballSkin item id (auth.customization.ballSkin). 'default' or an
   * id with no bundled art falls back to the stock ball. */
  ballSkin?: string
  /** Equipped gkSkin item id (auth.customization.gkSkin). Only ever applies to
   * OUR OWN keeper — stage 'keep', i.e. we're the one defending. The
   * opponent's keeper (stage 'shoot') always renders the stock look; we have
   * no idea (and no need to know) what they have equipped. 'default' or an id
   * with no bundled art falls back to the stock keeper. */
  gkSkin?: string
}

// ponytail: emoji actors over the bg.jpg goal. Same props contract the sprite
// version will keep — see Plans/Sprite Transfer Plan.md for the swap.
export function PitchScene({ stage, feedback, opponentLabel = 'CPU', ballSkin, gkSkin }: Props) {
  // ponytail: the scene mounts fresh for every animation, so a lazy useState
  // initializer gives one stable random pick per goal
  const [variant] = useState(
    () => GOAL_KEEPER_VARIANTS[Math.floor(Math.random() * GOAL_KEEPER_VARIANTS.length)],
  )
  const label = feedback === 'concede' ? `${opponentLabel} SCORES!` : feedback ? LABELS[feedback] : null
  const skin = ballSkin ? BALL_SKIN_SOURCES[ballSkin] : undefined
  const ballStyle = skin
    ? ({ '--ball-thumb': `url(${skin.thumb})`, '--ball-spin': `url(${skin.spin})` } as CSSProperties)
    : undefined
  // stage 'keep' = we're the one on the goal line; anything else is the
  // opponent's keeper, which never wears our equipped skin.
  const keeper = stage === 'keep' && gkSkin ? GK_SKIN_SOURCES[gkSkin] : undefined
  const keeperStyle = keeper
    ? ({ '--gk-idle': `url(${keeper.idle})`, '--gk-dive': `url(${keeper.dive})` } as CSSProperties)
    : undefined
  return (
    <div
      className={`scene${feedback ? ` scene--${feedback}` : ''}${feedback === 'goal' ? ` scene--goal-${variant}` : ''}`}
      role="img"
      aria-label={label ?? (stage === 'shoot' ? 'you are shooting' : 'you are in goal')}
    >
      {/* stage mirrors the background's center/cover sizing so % positions land on the bg.jpg goal */}
      <div className="scene__stage">
        <span
          className={`scene__keeper${keeper ? ` scene__keeper--skinned scene__keeper--${keeper.cssId}` : ''}`}
          style={keeperStyle}
        />
        <span
          className={`scene__ball${skin ? ' scene__ball--skinned' : ''}`}
          style={ballStyle}
        />
        {label && <span className="scene__label">{label}</span>}
      </div>
    </div>
  )
}
