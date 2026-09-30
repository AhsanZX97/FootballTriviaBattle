import type { PitchSkins } from './pitchArt'
import type { SceneFeedback, ShotEvent } from './shotTimeline'

export interface PitchState extends PitchSkins {
  feedback: SceneFeedback | null
  label: string | null
  dimmed: boolean
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
