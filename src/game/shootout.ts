import type { MatchResult, ShootoutState, Stage } from '../types/match'
import { decideResult, scoreOf } from './scoring'

/** Kicks each side gets in the standard phase before sudden death. */
export const KICKS_PER_SIDE = 5

export function createInitialState(): ShootoutState {
  return { userScore: 0, cpuScore: 0, stage: 'shoot', kicks: [], status: 'playing' }
}

export function nextStage(stage: Stage): Stage {
  return stage === 'shoot' ? 'keep' : 'shoot'
}

export function isMatchOver(state: ShootoutState): boolean {
  return state.status !== 'playing'
}

export function getResult(state: ShootoutState): MatchResult | null {
  return isMatchOver(state) ? decideResult(state.userScore, state.cpuScore) : null
}

/**
 * resolveShootoutState — the one pure rule engine. Given the current state and
 * whether the trivia answer was correct (timeout = false), return the next state.
 * No early mathematical termination (Phase 1): the standard phase always plays
 * all 5 kicks each, then sudden death runs a full round per turn until a side leads.
 */
export function applyAnswer(state: ShootoutState, correct: boolean): ShootoutState {
  if (isMatchOver(state)) return state

  const scoredBy = scoreOf(state.stage, correct)
  const userScore = state.userScore + (scoredBy === 'user' ? 1 : 0)
  const cpuScore = state.cpuScore + (scoredBy === 'cpu' ? 1 : 0)
  const kicks = [...state.kicks, { stage: state.stage, correct, scoredBy }]

  const userKicks = kicks.filter((k) => k.stage === 'shoot').length
  const cpuKicks = kicks.length - userKicks
  const roundComplete = userKicks === cpuKicks
  const over = roundComplete && userKicks >= KICKS_PER_SIDE && userScore !== cpuScore

  return {
    userScore,
    cpuScore,
    kicks,
    stage: over ? state.stage : nextStage(state.stage),
    status: over ? (userScore > cpuScore ? 'won' : 'lost') : 'playing',
  }
}
