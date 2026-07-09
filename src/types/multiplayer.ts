import type { Question } from './trivia'

/** Client name field cap — enforced on typed names; generated names stay well under it. */
export const MAX_NAME_LENGTH = 16

export type ClientMessage =
  | { type: 'queue'; name: string }
  | { type: 'cancel' }
  | { type: 'kickResult'; scored: boolean }
  | { type: 'rematchVote' }
  | { type: 'leave' }

export type ServerMessage =
  | { type: 'queued' }
  | { type: 'matched'; opponentName: string; youGoFirst: boolean; questions: Question[] }
  | { type: 'kickResolved'; by: 'you' | 'opponent'; scored: boolean }
  | { type: 'rematchVotes'; count: 1 }
  | { type: 'rematchStart'; youGoFirst: boolean; questions: Question[] }
  | { type: 'opponentLeft' }
  | { type: 'error'; reason: string }
  | { type: 'coinsAwarded'; amount: number; balance: number }

/**
 * Connection-level lobby state — not sent over the wire. The "starting /
 * who goes first / 3-2-1" sequence is a timed UI animation layered on top
 * of 'found' by LobbyScreen itself, not a distinct store phase.
 */
export type LobbyPhase = 'idle' | 'searching' | 'found'
