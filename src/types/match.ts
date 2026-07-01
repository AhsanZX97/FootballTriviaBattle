/** What the user does this kick: take the penalty, or play keeper. */
export type Stage = 'shoot' | 'keep'

/** Which side, if any, scored on a resolved kick. */
export type ScoringTeam = 'user' | 'cpu' | null

export interface Kick {
  stage: Stage
  /** Was the trivia answer correct (timeout counts as false). */
  correct: boolean
  scoredBy: ScoringTeam
}

export type MatchStatus = 'playing' | 'won' | 'lost'

export interface ShootoutState {
  userScore: number
  cpuScore: number
  /** Stage of the *next* kick to resolve. */
  stage: Stage
  kicks: Kick[]
  status: MatchStatus
}

export interface MatchResult {
  outcome: 'win' | 'lose'
  userScore: number
  cpuScore: number
}
