import { useState } from 'react'
import type { Stage } from '../../../types/match'
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
}

// ponytail: emoji actors over the bg.jpg goal. Same props contract the sprite
// version will keep — see Plans/Sprite Transfer Plan.md for the swap.
export function PitchScene({ stage, feedback }: Props) {
  // ponytail: the scene mounts fresh for every animation, so a lazy useState
  // initializer gives one stable random pick per goal
  const [variant] = useState(
    () => GOAL_KEEPER_VARIANTS[Math.floor(Math.random() * GOAL_KEEPER_VARIANTS.length)],
  )
  return (
    <div
      className={`scene${feedback ? ` scene--${feedback}` : ''}${feedback === 'goal' ? ` scene--goal-${variant}` : ''}`}
      role="img"
      aria-label={feedback ? LABELS[feedback] : stage === 'shoot' ? 'you are shooting' : 'you are in goal'}
    >
      {/* stage mirrors the background's center/cover sizing so % positions land on the bg.jpg goal */}
      <div className="scene__stage">
        <span className="scene__keeper">🧤</span>
        <span className="scene__ball">⚽</span>
        {feedback && <span className="scene__label">{LABELS[feedback]}</span>}
      </div>
    </div>
  )
}
