import type { Question } from './trivia'

/** Client name field cap — enforced on typed names; generated names stay well under it. */
export const MAX_NAME_LENGTH = 16

export type ClientMessage =
  | { type: 'queue'; name: string }
  | { type: 'cancel' }
  | { type: 'kickResult'; scored: boolean }
  | { type: 'rematchVote' }
  | { type: 'leave' }
  // --- friend challenges (directed matchmaking over the presence socket) ---
  | { type: 'challenge'; targetUserId: string }
  | { type: 'challengeAccept'; challengeId: string }
  | { type: 'challengeDecline'; challengeId: string }
  | { type: 'challengeCancel'; challengeId: string }

/** Why a challenge couldn't be delivered/started. */
export type ChallengeFailReason = 'offline' | 'busy' | 'declined' | 'expired' | 'gone'

export type ServerMessage =
  | { type: 'queued' }
  | { type: 'matched'; opponentName: string; youGoFirst: boolean; questions: Question[] }
  | { type: 'kickResolved'; by: 'you' | 'opponent'; scored: boolean }
  | { type: 'rematchVotes'; count: 1 }
  | { type: 'rematchStart'; youGoFirst: boolean; questions: Question[] }
  | { type: 'opponentLeft' }
  | { type: 'error'; reason: string }
  | { type: 'coinsAwarded'; amount: number; balance: number }
  // --- friend challenges ---
  /** Ack to the challenger: the invite reached the friend and is pending. */
  | { type: 'challengeSent'; challengeId: string }
  /** To the target: someone is challenging you. Reuse `matched` once accepted. */
  | { type: 'challengeReceived'; challengeId: string; fromUserId: string; fromName: string }
  /** To the challenger: the invite couldn't be delivered or was turned down. */
  | { type: 'challengeFailed'; reason: ChallengeFailReason }
  /** To the target: the challenger withdrew before they answered. */
  | { type: 'challengeCanceled'; challengeId: string }

/**
 * Connection-level lobby state — not sent over the wire. The "starting /
 * who goes first / 3-2-1" sequence is a timed UI animation layered on top
 * of 'found' by LobbyScreen itself, not a distinct store phase.
 */
export type LobbyPhase = 'idle' | 'searching' | 'found'
