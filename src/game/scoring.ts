import type { MatchResult, ScoringTeam, Stage } from '../types/match'

/**
 * Who scores on a single resolved kick:
 *  - shooting: correct answer → user goal; wrong/timeout → miss (nobody).
 *  - keeping:  correct answer → save (nobody); wrong/timeout → CPU goal.
 */
export function scoreOf(stage: Stage, correct: boolean): ScoringTeam {
  if (stage === 'shoot') return correct ? 'user' : null
  return correct ? null : 'cpu'
}

export function decideResult(userScore: number, cpuScore: number): MatchResult {
  return {
    outcome: userScore > cpuScore ? 'win' : 'lose',
    userScore,
    cpuScore,
  }
}
