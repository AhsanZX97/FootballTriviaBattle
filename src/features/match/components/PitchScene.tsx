import { useState, type CSSProperties } from 'react'
import type { Stage } from '../../../types/match'
import { BALL_SKIN_SOURCES, GK_SKIN_SOURCES } from '../../../services/shopCatalogue'
import stockDiveSheet from '../../../assets/gk-dive-strip.png'
import stockSpinSheet from '../../../assets/ball-spin-strip.png'
import './PitchScene.css'
import { useT } from '../../../services/i18n/store'
import type { MessageKey } from '../../../services/i18n/messages/en'

/* The dive/spin sheets are referenced only inside @keyframes, and browsers
 * don't fetch a background image until a rule actually applies it — so on a
 * cold cache the sheet is fetched mid-animation, blanking the actor for a few
 * frames the first time each outcome plays. Warm the stock sheets at module
 * load; the equipped skins' art goes through preloadSceneArt, which
 * MatchScreen calls on mount — well before the first animation needs it. */
const warmed = new Set<string>()
function warm(src?: string) {
  if (!src || warmed.has(src)) return
  warmed.add(src)
  new Image().src = src
}
warm(stockDiveSheet)
warm(stockSpinSheet)

export function preloadSceneArt(ballSkin?: string, ...gkSkins: Array<string | undefined>) {
  const ball = ballSkin ? BALL_SKIN_SOURCES[ballSkin] : undefined
  warm(ball?.thumb)
  warm(ball?.spin)
  for (const gkSkin of gkSkins) {
    const keeper = gkSkin ? GK_SKIN_SOURCES[gkSkin] : undefined
    warm(keeper?.idle)
    warm(keeper?.dive)
  }
}

/** How the keeper reacts to being beaten — picked at random per goal. */
const GOAL_KEEPER_VARIANTS = ['wrong-way', 'frozen', 'late'] as const

/** Outcome being animated: goal/miss = user shot, save/concede = user kept. */
export type SceneFeedback = 'goal' | 'miss' | 'save' | 'concede'

const LABEL_KEYS = {
  goal: 'scene.goal',
  miss: 'scene.miss',
  save: 'scene.saved',
} as const satisfies Partial<Record<SceneFeedback, MessageKey>>

type Props = {
  stage: Stage
  feedback: SceneFeedback | null
  /** Who scored the conceded goal. Falls back to the generic OPPONENT label. */
  opponentLabel?: string
  /** Equipped ballSkin item id (auth.customization.ballSkin). 'default' or an
   * id with no bundled art falls back to the stock ball. */
  ballSkin?: string
  /** Equipped gkSkin item id (auth.customization.gkSkin). Only ever applies to
   * OUR OWN keeper — stage 'keep', i.e. we're the one defending. 'default' or
   * an id with no bundled art falls back to the stock keeper. */
  gkSkin?: string
  /** The opponent's equipped gkSkin item id (server-read from their profile,
   * via 'matched'). Dresses the keeper we shoot against — stage 'shoot'.
   * Absent (anonymous opponent), 'default' or an id with no bundled art falls
   * back to the stock keeper. */
  opponentGkSkin?: string
}

// ponytail: emoji actors over the bg.jpg goal. Same props contract the sprite
// version will keep — see Plans/Sprite Transfer Plan.md for the swap.
export function PitchScene({
  stage,
  feedback,
  opponentLabel,
  ballSkin,
  gkSkin,
  opponentGkSkin,
}: Props) {
  const t = useT()
  // ponytail: the scene mounts fresh for every animation, so a lazy useState
  // initializer gives one stable random pick per goal
  const [variant] = useState(
    () => GOAL_KEEPER_VARIANTS[Math.floor(Math.random() * GOAL_KEEPER_VARIANTS.length)],
  )
  const label =
    feedback === 'concede'
      ? t('scene.scores', { name: opponentLabel ?? t('match.opponent') })
      : feedback
        ? t(LABEL_KEYS[feedback])
        : null
  const skin = ballSkin ? BALL_SKIN_SOURCES[ballSkin] : undefined
  const ballStyle = skin
    ? ({ '--ball-thumb': `url(${skin.thumb})`, '--ball-spin': `url(${skin.spin})` } as CSSProperties)
    : undefined
  // stage 'keep' = we're the one on the goal line, wearing our own skin;
  // stage 'shoot' = the opponent's keeper, wearing theirs.
  const keeperSkinId = stage === 'keep' ? gkSkin : opponentGkSkin
  const keeper = keeperSkinId ? GK_SKIN_SOURCES[keeperSkinId] : undefined
  const keeperStyle = keeper
    ? ({ '--gk-idle': `url(${keeper.idle})`, '--gk-dive': `url(${keeper.dive})` } as CSSProperties)
    : undefined
  return (
    <div
      className={`scene${feedback ? ` scene--${feedback}` : ''}${feedback === 'goal' ? ` scene--goal-${variant}` : ''}`}
      role="img"
      aria-label={label ?? (stage === 'shoot' ? t('scene.shootingAria') : t('scene.keepingAria'))}
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
