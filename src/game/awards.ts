export interface MatchPlayers {
  aUserId: string | null
  bUserId: string | null
}

export type SettleReason = 'completed' | 'forfeitA' | 'forfeitB'

import { KICKS_PER_SIDE } from './shootout'

export interface Award {
  userId: string
  amount: number
}

export const WIN_AMOUNT = 3
export const COMPLETED_LOSS_AMOUNT = 1
export const FORFEIT_QUITTER_AMOUNT = 0

/**
 * A forfeit before this many kicks have been taken pays nobody: it's less than
 * halfway through a full standard phase (KICKS_PER_SIDE kicks *each* side, so
 * 2*KICKS_PER_SIDE total), too little of a match for the remaining player to
 * have earned the win.
 */
const MIN_KICKS_FOR_FORFEIT_AWARD = KICKS_PER_SIDE

/**
 * Coin award rules for a finished 1v1 match. `shootoutStatus` is
 * room.shootout.status, which is always relative to slot 'a' — for a forfeit
 * this is already flipped by room.ts's `forfeit()` (leaver's slot loses), so
 * the winner/loser split falls out of status alone; `reason` only changes the
 * *amount* (a completed loss still pays 1, a forfeited "loss" — the quitter —
 * pays 0). Anonymous players (`null` userId) are silently filtered out, never
 * an error.
 *
 * `kicksTaken` is how many kicks the shootout had resolved when it ended, and
 * `scores` is each slot's goal tally at that point. A forfeit before the match
 * is halfway played (see MIN_KICKS_FOR_FORFEIT_AWARD) normally pays nobody —
 * neither the quitter nor the player left behind — *except* when the player
 * left behind was already ahead, in which case they still earned the win.
 * Both are ignored for completed matches, which played the full standard phase.
 */
export function settleMatch(
  shootoutStatus: 'won' | 'lost',
  players: MatchPlayers,
  reason: SettleReason,
  kicksTaken: number,
  scores: { a: number; b: number },
): Award[] {
  const aWon = shootoutStatus === 'won'
  const winnerId = aWon ? players.aUserId : players.bUserId
  const loserId = aWon ? players.bUserId : players.aUserId

  // Early forfeit: too little of a match to pay out — unless the player left
  // behind was already leading, so they get their win regardless.
  if (reason !== 'completed' && kicksTaken < MIN_KICKS_FOR_FORFEIT_AWARD) {
    const winnerScore = aWon ? scores.a : scores.b
    const loserScore = aWon ? scores.b : scores.a
    if (winnerScore <= loserScore) return []
  }

  const loserAmount = reason === 'completed' ? COMPLETED_LOSS_AMOUNT : FORFEIT_QUITTER_AMOUNT

  const awards: Award[] = []
  if (winnerId) awards.push({ userId: winnerId, amount: WIN_AMOUNT })
  if (loserId) awards.push({ userId: loserId, amount: loserAmount })
  return awards
}

/** One finished match from the local player's own point of view. */
export interface LocalResult {
  won: boolean
  /** True when the opponent left mid-match, forfeiting it to me. */
  byForfeit: boolean
  kicksTaken: number
  myScore: number
  opponentScore: number
}

/**
 * What a signed-out player earns for a match played on this device. Delegates
 * to `settleMatch` — with the player pinned to slot 'a' and an anonymous
 * opponent in 'b' — precisely so the offline economy can never drift from the
 * server's: the early-forfeit gate, the win/loss amounts and the quitter rule
 * are all the same code path, not a second copy of the same numbers.
 *
 * Only the two outcomes a client actually reaches are expressible here: the
 * match completed, or the opponent forfeited it to me. A player who quits
 * never sees a result screen, so there is nothing to award them.
 */
export function awardForLocalResult(result: LocalResult): number {
  const awards = settleMatch(
    result.won ? 'won' : 'lost',
    { aUserId: LOCAL_PLAYER_SLOT, bUserId: null },
    result.byForfeit ? 'forfeitB' : 'completed',
    result.kicksTaken,
    { a: result.myScore, b: result.opponentScore },
  )
  return awards.find((a) => a.userId === LOCAL_PLAYER_SLOT)?.amount ?? 0
}

/** Stand-in user id for the local player inside `settleMatch`. Never persisted
 * or sent anywhere — it exists only so the award can be picked back out. */
const LOCAL_PLAYER_SLOT = 'local'
