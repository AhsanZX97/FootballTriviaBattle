import type { Stage } from '../../../types/match'
import './PitchScene.css'

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

// ponytail: CSS/emoji placeholder scene. Same props contract the sprite
// version will keep — see Plans/Sprite Transfer Plan.md for the swap.
export function PitchScene({ stage, feedback }: Props) {
  return (
    <div
      className={`scene${feedback ? ` scene--${feedback}` : ''}`}
      role="img"
      aria-label={feedback ? LABELS[feedback] : stage === 'shoot' ? 'you are shooting' : 'you are in goal'}
    >
      <div className="scene__goal">
        <div className="scene__net" />
        <span className="scene__keeper">🧤</span>
      </div>
      <span className="scene__ball">⚽</span>
      {feedback && <span className="scene__label">{LABELS[feedback]}</span>}
    </div>
  )
}
