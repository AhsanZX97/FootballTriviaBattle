import type { PitchSkins } from './pitchArt'
import type { KeeperReaction, SceneFeedback, ShotEvent } from './shotTimeline'

export interface PitchState extends PitchSkins {
  feedback: SceneFeedback | null
  label: string | null
  dimmed: boolean
  /** Forces the keeper's reaction for the next shot; rolled at random when omitted. */
  reaction?: KeeperReaction
  /** Forces the next shot to the right-hand side; rolled at random when omitted. */
  mirror?: boolean
}

export interface PitchCallbacks {
  onEvent: (event: ShotEvent, outcome: SceneFeedback) => void
  onReady: () => void
  onError: () => void
}

export interface PitchGame {
  update: (state: PitchState) => void
  destroy: () => void
}
